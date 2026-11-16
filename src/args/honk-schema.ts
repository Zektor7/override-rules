/**
 * honk 覆写侧独有参数的默认值。
 *
 * 与 mihomo 分支共用的参数（`grouptype` / `threshold` / `adblock` 等）仍走
 * `args/schema.ts` 里的 `ARG_DEFAULTS`；这里只列 honk 独立的一段。
 *
 * 默认值取自 kenzok8 / qichiyuhub 的公开 honk 模板，兼顾 OpenWrt 与 x86 软路由：
 * - 网卡 `br-lan` + `wan_interface: auto` 覆盖 OpenWrt 常见拓扑；
 * - `data_dir: /etc/honk` 落在 OpenWrt 的持久化分区；
 * - DNS 用阿里 DoH（default）与 Cloudflare DoH（remote），国内直连、国外走 Select；
 * - 面板默认同时开 native_api（Doona）与 clash_api（zashboard），监听在 0.0.0.0
 *   方便局域网访问；`clash-secret` 留空由用户显式配置。
 */
export const HONK_ARG_DEFAULTS = {
    /** 未传 `#subscription=` 时使用的占位 URL；产物会保留且额外写一行注释提醒替换。 */
    subscriptionUrl: "https://example.com/your-subscription",
    subscriptionTag: "my_sub",
    subscriptionInterval: "86400s",
    subscriptionRoute: "direct",
    subscriptionCache: true,
    subscriptionUa: "clash.meta/1.19.30",

    lanInterface: "br-lan",
    wanInterface: "auto",
    /** `domain` 让分流规则可以直接命中域名；对 DoT/DoH 更友好。 */
    dialMode: "domain",
    dataDir: "/etc/honk",
    logLevel: "info",
    allowInsecure: false,
    storeSubscribe: true,
    nfqueueEnable: true,
    autoConfigKernelParameter: true,

    dnsDefaultUpstream: "https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com",
    dnsRemoteUpstream: "https://8.8.8.8/dns-query?tls_server_name=dns.google",
    /** remote 走 Select：honk 面板上切 Select 节点等同于切所有 DNS 出口。 */
    dnsRemoteExit: "Select",
    dnsClientSubnet: "auto",

    enableNativeApi: true,
    nativeApiListen: "0.0.0.0:9527",
    nativeApiUi: "embedded",
    enableClashApi: true,
    clashApiController: "0.0.0.0:9090",
    clashApiUi: "zashboard",
    clashApiSecret: "",
} as const;
