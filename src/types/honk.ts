/**
 * honk 输出相关的类型定义。
 *
 * honk 是 dae 的 Rust + eBPF 重写（<https://github.com/daeuniverse/honk>），
 * 配置语法沿用 dae（`.dae` 文件），与 Clash/Mihomo 的 YAML 存在语义鸿沟：
 * - 组只能靠 `filter: name(regex: '…')` 命中订阅节点，或用 `filter: group(...)` 嵌套；
 * - 没有 dialer-proxy 链式代理、FakeIP、TUN、Sniffer、Tailscale outbound；
 * - 组名只允许 `[A-Za-z0-9]`。
 *
 * 本项目只负责 honk 配置里的**策略骨架**（subscription / group / dns / routing / assets），
 * `global {}` 与 `experimental {}` 属于机器/部署参数，交给用户的 `system.dae`，
 * 生成的 `config.dae` 顶部固定 `include { system.dae }`。
 *
 * honk 覆写以 `main(config) => string` 形式返回 `config.dae` 文本，
 * 交给 Sub-Store 原样吐出。
 */

import type { FeatureFlags } from "./args";
import type { NodeAnalysis } from "./proxy";

/**
 * honk 入口从 URL hash 收到的原始字符串参数。
 *
 * 与 mihomo 分支共享的字段（`grouptype` / `include` / `exclude` / `prefer` /
 * `adblock` / `ipv6` / `quic` / `threshold`）不在此重复声明，直接由
 * {@link ScriptArgs} 走 `buildFeatureFlags()`；本接口只列 honk 独有的字段。
 */
export interface HonkScriptArgs {
    /** 订阅 URL：honk 会按 interval 定时拉取；建议做 URL 编码。 */
    subscription?: string;
    /** 订阅 tag 名，honk 的 `subtag(...)` 过滤器按此匹配。默认 `my_sub`。 */
    subtag?: string;
    /** 订阅刷新间隔（honk 接受 `86400s` / `1h` / `30m` 等）。默认 `86400s`。 */
    "sub-interval"?: string;
    /** 拉取订阅的出口：`direct` 或某个组名。默认 `direct`。 */
    "sub-route"?: string;
    /** 是否把订阅正文缓存到本地状态库。默认 `true`。 */
    "sub-cache"?: string;
    /** 拉取订阅的 User-Agent。默认 `clash.meta/1.19.30`。 */
    "sub-ua"?: string;

    /** honk dns.upstream.default 的 URL。默认阿里 DoH。 */
    "dns-default"?: string;
    /** honk dns.upstream.remote 的 URL。默认 Cloudflare DoH。 */
    "dns-remote"?: string;
    /** honk dns.upstream.remote 绑定的出口组名。默认 `Select`。 */
    "dns-remote-exit"?: string;
    /** honk dns.client_subnet：`auto` / `off` / `<ipv4/24>`。默认 `auto`。 */
    "dns-client-subnet"?: string;
}

/** 解析后的 honk 运行时参数集合，构建层只关心这里的强类型字段。 */
export interface HonkRuntimeOptions {
    subscriptionUrl: string;
    subscriptionTag: string;
    subscriptionInterval: string;
    subscriptionRoute: string;
    subscriptionCache: boolean;
    subscriptionUa: string;

    dnsDefaultUpstream: string;
    dnsRemoteUpstream: string;
    dnsRemoteExit: string;
    dnsClientSubnet: string;
}

/** honk 构建上下文：合并 mihomo 分支共用的 `flags`/`nodes` 与 honk 独有的 `opts`。 */
export interface HonkBuildContext {
    flags: FeatureFlags;
    opts: HonkRuntimeOptions;
    nodes: NodeAnalysis;
}

/**
 * 已内联的自维护 ruleset：键与 `RuleSetKey` 一致，值为原始 `.list` 文本按行拆分的结果。
 *
 * 只有 `ruleset/*.list` 这类项目自带的文件会被内联；外部 rule-provider 通过
 * geosite 近似或跳过（详见 `builders/honk/rules.ts` 内的映射表）。
 *
 * 运行时覆写没有文件系统访问，`src/main-honk.ts` 从 `src/generated/honk-rulesets.ts`
 * 读取编译期内联好的内容。
 */
export type InlineRuleSetMap = Readonly<Record<string, readonly string[]>>;

/** honk group 块里单个组的字段集合；未指定的字段在渲染时省略。 */
export interface HonkGroupSpec {
    /** honk 组名，只允许 `[A-Za-z0-9]`。 */
    name: string;
    /** `filter` 表达式，决定哪些订阅节点归入本组。 */
    filter: string;
    /** honk policy 值；参见 `HONK_POLICIES` 与官方文档。 */
    policy: string;
    /** honk 组内回退出口：`direct` / `block` / 其他组名。 */
    final?: string;
    /** 切换节点时是否中断已有连接（Proxy/Final 类大流量组建议 true）。 */
    interruptConnections?: boolean;
}
