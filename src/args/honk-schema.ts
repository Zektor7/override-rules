/**
 * honk 覆写侧独有参数的默认值。
 *
 * 与 mihomo 分支共用的参数（`grouptype` / `threshold` / `adblock` 等）仍走
 * `args/schema.ts` 里的 `ARG_DEFAULTS`；这里只列 honk 独立的一段。
 *
 * 只保留与「策略骨架」相关的字段（订阅 + DNS 上游）。`global {}` 与 `experimental {}`
 * 属于机器/部署参数，交给用户的 `system.dae`，本项目不再关心。
 *
 * DNS 默认走 kenzok8 / qichiyuhub 生态通行的公共 DoH：阿里（default，直连）
 * 与 Cloudflare（remote，走 Select 主选择器）。
 */
export const HONK_ARG_DEFAULTS = {
    /** 未传 `#subscription=` 时使用的占位 URL；产物会保留且额外写一行注释提醒替换。 */
    subscriptionUrl: "https://example.com/your-subscription",
    subscriptionTag: "my_sub",
    subscriptionInterval: "86400s",
    subscriptionRoute: "direct",
    subscriptionCache: true,
    subscriptionUa: "clash.meta/1.19.30",

    dnsDefaultUpstream: "https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com",
    dnsRemoteUpstream: "https://8.8.8.8/dns-query?tls_server_name=dns.google",
    /** remote 走 Select：honk 面板上切 Select 节点等同于切所有 DNS 出口。 */
    dnsRemoteExit: "Select",
    dnsClientSubnet: "auto",
} as const;
