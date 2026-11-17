/*!
powerfullz 的 Substore → honk 覆写脚本（config.dae 动态生成）
https://github.com/powerfullz/override-rules

用法（操作路径与 mihomo 覆写完全一致）：
1. 在 Sub-Store 里新建「文件」，类型选「Clash Config」，来源选你的组合订阅
   —— 和 mihomo 那边用的是同一个文件、同一份来源；
2. 给这个文件加一条「脚本操作」，指向本脚本：
   https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert-honk.min.js
3. 客户端 GET 这个文件的下载链接，拿到的是一份可直接放进 /etc/honk/config.dae 的
   策略骨架（裸文本，不是 YAML）。

为什么脚本要自己写回 $content：
Sub-Store 在「Clash Config」类型下会执行 `YAML.safeDump(await main(config))`，
返回的字符串会被包成 `|-` 块标量，honk 解析不了；而文件作用域里脚本是被原样内联进
`operator` 的，可以直接把 config.dae 写回 `$content`，Sub-Store 会原样作为响应体吐出。
所以本脚本在 Sub-Store 里不会注册全局 `main`（注册了就会被 YAML 化）。

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
- sub-base: SubStore 服务基础地址（host + 后端路径，不含 /download/...）。不传时会从当前下载请求的
  地址反推，所以一般不需要手动指定；显式 subscription 仍优先
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

import { buildHonkFromConfig } from "./builders/honk/script";
import type { HonkEntryArgs } from "./builders/honk/script";
import { buildHonkFileScope } from "./builders/honk/file-scope";
import type { ClashConfig } from "./types/clash";
import type { HonkFileContext, HonkRequestContext } from "./types/honk";

declare const $arguments: HonkEntryArgs;
declare let $content: string | undefined;
declare const $file: HonkFileContext | null | undefined;

/** Sub-Store 在文件作用域注入的 `$options`；`_req` 是当前请求的快照。 */
interface HonkScriptOptions {
    _req?: unknown;
}

declare const $options: HonkScriptOptions | null | undefined;

/**
 * Sub-Store `nodeFunc` 里的 operator 形参。
 *
 * 文件作用域与节点列表作用域共用这一个函数体，靠 `input` 是否存在来区分：
 * 节点列表作用域（脚本挂在订阅/组合订阅上）不会有 `$content`。
 */
declare const input: unknown;

/** 读取脚本环境传入的参数；未检测到时返回空对象以使用默认值。 */
function readRawArgs(): HonkEntryArgs {
    try {
        return $arguments;
    } catch {
        return {};
    }
}

/**
 * 读取 SubStore 文件处理作用域里的 `$file`（含 `type` / `sourceType` / `sourceName` / `url`）。
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

/** 读取 `$options._req`（当前请求快照），用于反推 SubStore 服务的基础地址。 */
function readRequestContext(): HonkRequestContext | null {
    try {
        if (typeof $options !== "undefined" && $options != null) {
            const req = $options._req;
            if (typeof req === "object" && req !== null) {
                return req;
            }
        }
    } catch {
        // 沙箱无此变量时忽略
    }
    return null;
}

/**
 * 判断当前是否运行在 Sub-Store 的脚本作用域里。
 *
 * Sub-Store 用 `new Function('$arguments', …)` 执行脚本，`$arguments` 必然存在；
 * 独立运行（单元测试、自建工具链）时它是未声明标识符。
 */
function isSubStoreScope(): boolean {
    try {
        return typeof $arguments !== "undefined";
    } catch {
        return false;
    }
}

/**
 * 让 Sub-Store 跳过 `YAML.safeDump(await main(config))` 那一步。
 *
 * 只要全局存在 `main` 函数，Sub-Store 就会用它的返回值覆盖 `$content`，字符串
 * 会被 YAML 化成 `|-` 块标量。这里把全局 `main` 置空；mihomo 覆写脚本每次运行
 * 都会重新注册自己的 `main`，因此不会影响它自己的链路。
 */
function suppressGlobalMainLookup(): void {
    const scope = globalThis as Record<string, unknown>;
    if (typeof scope.main === "function") {
        scope.main = undefined;
    }
}

/** 脚本被挂在订阅/组合订阅（节点列表）上时给出提示：这里不会生效。 */
function warnWrongScope(): void {
    const scope = globalThis as Record<string, unknown>;
    if (scope.__honkScopeWarned) return;
    scope.__honkScopeWarned = true;
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(
            "[powerfullz 的 honk 覆写] 脚本被挂在节点列表上，这里不会生效；" +
                "请把它挂到「文件」上（类型选「Clash Config」，来源选你的组合订阅）。"
        );
    }
}

/**
 * honk 覆写的可测试入口：与 bundle 入口同逻辑，只是把 `$arguments` 抽成参数。
 * 单元测试直接调用它避免污染 `globalThis`；bundle 打包后 esbuild 会 tree-shake
 * 掉 `export` 关键字，不影响产物。
 * @param config - 上游订阅配置（Sub-Store 解析后的 Clash 对象）
 * @param rawArgs - `$arguments` 原始参数
 * @param fileContext - SubStore 暴露的 `$file`；非 SubStore 环境传空
 * @param requestContext - SubStore 暴露的 `$options._req`；非 SubStore 环境传空
 */
export function runHonkEntry(
    config: ClashConfig,
    rawArgs: HonkEntryArgs,
    fileContext: HonkFileContext | null = null,
    requestContext: HonkRequestContext | null = null
): string {
    return buildHonkFromConfig(config, rawArgs, fileContext, requestContext);
}

/**
 * Sub-Store 文件作用域入口：读 `$content`（上游 Clash 配置）→ 生成 config.dae →
 * 写回 `$content`。Sub-Store 随后会把它当作响应体原样输出。
 */
function applyFileScope(): void {
    if (typeof $content === "undefined") {
        // 节点列表作用域：脚本不会生效，提示用户挂到「文件」上。
        if (typeof input !== "undefined") {
            warnWrongScope();
        }
        return;
    }

    const fileContext = readFileContext();
    if (fileContext?.type === "mihomoConfig" || fileContext?.type === "mihomoProfile") {
        // Sub-Store 在这类文件下会用 `main()` 的返回值覆盖 $content，先把它禁掉。
        suppressGlobalMainLookup();
    }

    $content = buildHonkFileScope($content, readRawArgs(), fileContext, readRequestContext());
}

/**
 * 独立调用入口：从 `$arguments` 拿参数，转给 `runHonkEntry`。
 * 返回字符串：供自建工具链与单元测试使用。
 * @param config - 上游订阅配置（Sub-Store 解析后的 Clash 对象）
 */
function main(config: ClashConfig): string {
    return runHonkEntry(config, readRawArgs(), readFileContext(), readRequestContext());
}

if (isSubStoreScope()) {
    // Sub-Store 作用域：走文件通道，不注册全局 main（否则会被 YAML 化）。
    applyFileScope();
} else {
    (globalThis as Record<string, unknown>).main = main;
}
