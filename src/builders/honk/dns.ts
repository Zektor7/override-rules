/**
 * 生成 honk `dns {}` 段落。
 *
 * honk 的 DNS upstream 在定义时就绑定出口，与 Clash 的 `nameserver` +
 * `proxy-server-nameserver` 分离不同。这里把 `catalog/dns.ts` 里的地址映射为
 * honk 的 default / remote 两个 upstream：
 * - default → direct（国内 DNS，直连查询）；
 * - remote → Select（国外 DNS，走主选择器）；
 *
 * `qtype(aaaa)` 由 `ipv6Enabled` 控制是否拒绝；fakeip/keepalive/sniffer 在 honk 里没有
 * 对应字段，不出现。
 */

import type { FeatureFlags } from "../../types/args";

/** honk 版 DNS 服务器地址；与 Clash 的 `DEFAULT_NAMESERVERS` / `DEFAULT_FALLBACK_DNS` 独立。 */
const HONK_DEFAULT_UPSTREAM = "https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com";
const HONK_REMOTE_UPSTREAM = "https://8.8.8.8/dns-query?tls_server_name=dns.google";

/** 渲染完整的 `dns {}` 段（含首尾大括号）。 */
export function buildHonkDns(flags: FeatureFlags): string[] {
    const requestLines = ["            qtype(https, svcb) -> reject"];
    if (!flags.ipv6Enabled) {
        requestLines.push("            qtype(aaaa) -> reject");
    }
    requestLines.push(
        "            qname(geosite: private) -> asis",
        "            qname(geosite: cn, geosite: microsoft@cn, geosite: apple@cn) -> default",
        "            qname(geosite: geolocation-!cn) -> remote",
        "            fallback: remote"
    );

    return [
        "dns {",
        "    upstream {",
        `        default: '${HONK_DEFAULT_UPSTREAM}' -> direct`,
        `        remote: '${HONK_REMOTE_UPSTREAM}' -> Select`,
        "    }",
        "    routing {",
        "        request {",
        ...requestLines,
        "        }",
        "        response {",
        "            upstream(remote) && ip(geoip: cn) -> default",
        "            fallback: accept",
        "        }",
        "    }",
        "}",
    ];
}
