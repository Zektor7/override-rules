/**
 * honk 输出相关的类型定义。
 *
 * honk 是 dae 的 Rust + eBPF 重写（<https://github.com/daeuniverse/honk>），
 * 配置语法沿用 dae（`.dae` 文件），与 Clash/Mihomo 的 YAML 存在语义鸿沟：
 * - 组只能靠 `filter: name(regex: '…')` 命中订阅节点，不支持引用其他组；
 * - 没有 dialer-proxy 链式代理、FakeIP、TUN、Sniffer、Tailscale outbound；
 * - 组名只允许 `[A-Za-z0-9]`。
 *
 * 因此 honk 构建层单独定义上下文与产物形态，与 Clash 的 `GroupBuildContext` 平行。
 */

import type { FeatureFlags } from "./args";
import type { NodeAnalysis } from "./proxy";

/** honk 构建上下文：只依赖参数解析与节点分类结果，不复用 Clash 的候选列表。 */
export interface HonkBuildContext {
    flags: FeatureFlags;
    nodes: NodeAnalysis;
}

/**
 * 已内联的自维护 ruleset：键与 `RuleSetKey` 一致，值为原始 `.list` 文本按行拆分的结果。
 *
 * 只有 `ruleset/*.list` 这类项目自带的文件会被内联；外部 rule-provider 通过
 * geosite 近似或跳过（详见 `builders/honk/rules.ts` 内的映射表）。
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
