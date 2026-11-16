/*!
powerfullz 的 Substore → honk 覆写脚本（config.dae 动态生成）
https://github.com/powerfullz/override-rules

用法：把 convert-honk.min.js 作为 Sub-Store 覆写绑定到目标订阅，客户端 GET 该订阅
的 download URL 时，Sub-Store 会把 main(config) 返回的字符串原样作为响应体吐出，
拿到就是一份可直接放进 /etc/honk/config.dae 的策略骨架。

产物只包含策略段：subscription / group / dns / routing / assets；`global {}` 与
`experimental {}` 属于机器/部署参数，交给同目录下的 `system.dae`，本文件顶部固定
输出 `include { system.dae }` 引入。这样部署侧改网卡或面板口令不需要动本项目产物。

与 mihomo 分支共享的参数（含义完全一致，此处只列名字，详义见 convert.min.js banner）：
- grouptype: 地区代理组类型（0=select 手动, 1=min_moving_avg 自动测速, 2=loadbalance 负载均衡，默认 1）
- threshold: 地区节点数量小于该值时不显示分组（默认 2；不足 2 个地区时自动展平）
- ipv6: 启用 IPv6（false 时 dns.routing.request 加 `qtype(aaaa) -> reject`；默认 false）
- quic: 允许 QUIC（false 时插入 `l4proto(udp) && dport(443) -> block`；默认 false）
- adblock: 去广告（0=关闭，1/2/3=对应远程源；honk 侧统一近似为 `geosite: category-ads-all`，默认 3）
- include: 只使用指定规则，逗号分隔（与 exclude 冲突时优先）
- exclude: 排除指定规则，逗号分隔
- prefer: 优先选路节点正则，逗号分隔；命中时生成 Prefer 组（policy=fallback, final=Auto）

honk 独有参数（策略层）：
- subscription: honk 的订阅 URL（URL 编码），会写入 subscription { my_sub: '<URL>' }；honk 按 interval 自动重拉
- sub-base: SubStore 服务基础地址（host + 后端路径，不含 /download/...）。配合 SubStore 注入的 `$file`
  自动拼接出订阅下载地址（collection → /download/collection/<name>，subscription → /download/<name>），
  免去手工传完整 subscription；显式 subscription 仍优先
- subtag: 订阅 tag 名，默认 `my_sub`
- sub-interval: 订阅刷新间隔，默认 `86400s`；honk 接受 `30m` / `1h` 等
- sub-route: 拉订阅的出口（`direct` 或组名），默认 `direct`
- sub-cache: 是否缓存订阅正文到本地状态库，默认 true
- sub-ua: 拉订阅的 User-Agent，默认 `clash.meta/1.19.30`
- policy: Auto/地区/服务/LowCost/Final 组的 honk 策略，默认 `score`；可选：select / fixed / urltest / min_moving_avg / min_avg10 / min_last_delay / loadbalance / roundrobin / fallback / score；非法值回退到 HONK_POLICIES[grouptype]（默认就是 score）
- tolerance: URLTest/Score 切换阈值（毫秒，纯整数），默认不写（honk 侧 50）
- idle-timeout: URLTest 组空闲多少秒后暂停探测（纯整数），默认不写（honk 侧 1800）
- check-url: 非 Selector 策略的按组健康检查 URL（可带逗号分隔字面 IP），默认不写
- interrupt: 自动选择类组是否在成员变化时中断已有连接（`true/false/1/0`），默认 `false`
- dns-default: honk dns.upstream.default 的 URL，默认阿里 DoH
- dns-remote: honk dns.upstream.remote 的 URL，默认 Cloudflare DoH
- dns-remote-exit: remote 绑定的出口组名，默认 `Select`
- dns-client-subnet: honk dns.client_subnet，默认 `auto`

honk 无对应概念、显式忽略的 mihomo 参数：
- landing / 前置代理链（dialer-proxy）
- fakeip / sniffer / tun / keepalive / full / regex / manual / GLOBAL / tailscale

honk 侧交由 system.dae 处理的段（本覆写不再输出）：
- global {}：网卡、dial_mode、data_dir、log_level、内核参数等部署项
- experimental {}：native_api / clash_api / cache_file 面板与持久化配置

源码位于 `src/`，入口为 `src/main-honk.ts`。
*/

import { buildFeatureFlags } from "./args/parse";
import { buildHonkRuntimeOptions } from "./args/honk-parse";
import { analyzeNodes } from "./analysis/classify";
import { buildHonkDae } from "./builders/honk";
import { INLINED_HONK_RULESETS } from "./generated/honk-rulesets";
import type { ScriptArgs } from "./types/args";
import type { ClashConfig } from "./types/clash";
import type { HonkFileContext, HonkScriptArgs } from "./types/honk";

type HonkEntryArgs = ScriptArgs & HonkScriptArgs;

declare const $arguments: HonkEntryArgs;
declare const $file: HonkFileContext | null | undefined;

/** 读取脚本环境传入的参数；未检测到时返回空对象以使用默认值。 */
function readRawArgs(): HonkEntryArgs {
    try {
        return $arguments;
    } catch {
        return {};
    }
}

/**
 * 读取 SubStore 文件处理作用域里的 `$file`（含 `sourceType` / `sourceName`）。
 *
 * `$file` 只在 SubStore 的 `ScriptOperator.nodeFunc` 里以局部变量注入；单测或
 * 非文件场景下不存在。用 `typeof` 守卫（对未声明标识符也安全）避免引用错误。
 */
function readFileContext(): HonkFileContext | null {
    try {
        if (typeof $file !== "undefined" && $file != null) {
            return $file;
        }
    } catch {
        // 沙箱无此变量时忽略
    }
    return null;
}

/**
 * honk 覆写的可测试入口：与 bundle 入口 `main()` 同逻辑，只是把 `$arguments` 抽成参数。
 * 单元测试直接调用它避免污染 `globalThis`；bundle 打包后 esbuild 会 tree-shake
 * 掉 `export` 关键字，不影响产物。
 * @param fileContext - SubStore 暴露的 `$file`（`sourceType`/`sourceName`）；非 SubStore 环境传空
 */
export function runHonkEntry(
    config: ClashConfig,
    rawArgs: HonkEntryArgs,
    fileContext: HonkFileContext | null = null
): string {
    if (!config.proxies || !Array.isArray(config.proxies)) {
        throw new Error("[powerfullz 的 honk 覆写] 错误：Clash 配置中缺少有效的 proxies 字段");
    }

    const flags = buildFeatureFlags(rawArgs);
    const opts = buildHonkRuntimeOptions(rawArgs, flags, fileContext);
    const nodes = analyzeNodes(config.proxies, flags.countryThreshold, flags.preferPatterns);

    return buildHonkDae({ flags, opts, nodes }, INLINED_HONK_RULESETS);
}

/**
 * Sub-Store 实际调用的入口：从 `$arguments` 拿参数，转给 `runHonkEntry`。
 * 返回字符串：Sub-Store 会把字符串原样作为响应体输出，不再 stringify 成 YAML/JSON。
 * @param config - 上游订阅配置（Sub-Store 解析后的 Clash 对象）
 */
function main(config: ClashConfig): string {
    return runHonkEntry(config, readRawArgs(), readFileContext());
}

(globalThis as Record<string, unknown>).main = main;
