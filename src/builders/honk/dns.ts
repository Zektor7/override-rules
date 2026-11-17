/**
 * 生成 honk `dns {}` 段落。
 *
 * honk 的 DNS upstream 在定义时就绑定出口，与 Clash 的 `nameserver` +
 * `proxy-server-nameserver` 分离不同。这里把参数化的 default / remote 两个
 * upstream 与 `client_subnet` 拼成完整段：
 * - default → direct（国内 DNS，直连查询）；
 * - remote → `opts.dnsRemoteExit`（默认 `Select`，国外 DNS 走主选择器）；
 *
 * 两个要点：
 * - **不使用系统自身的 DNS**：请求路由里没有 `-> asis`（asis 会拿原始目的地址
 *   回查系统解析器），所有查询都落在 `default` 或 `remote` 两个命名上游上；
 * - **不禁用 IPv6**：`#ipv6=false` 时用 `ipversion_prefer: 4` 表达「偏好 IPv4」，
 *   honk 仍保留 IPv6 回退，而不是用 `qtype(aaaa) -> reject` 把 AAAA 掐掉。
 *
 * fakeip/keepalive/sniffer 在 honk 里没有对应字段，不出现。
 */

import type { FeatureFlags } from "../../types/args";
import type { HonkRuntimeOptions } from "../../types/honk";

/** 内网域名（用户自建 SubStore 等）固定走 default 上游直连查询。 */
const INTERNAL_DOMAIN_SUFFIX = "nip.io";

/** 渲染完整的 `dns {}` 段（含首尾大括号）。 */
export function buildHonkDns(flags: FeatureFlags, opts: HonkRuntimeOptions): string[] {
    // 请求路由：第一条命中即生效。私有域名走 default，其余按 geosite 分流。
    const requestLines = [
        `            qname(suffix: ${INTERNAL_DOMAIN_SUFFIX}) -> default`,
        "            qname(geosite: cn, geosite: microsoft@cn, geosite: apple@cn) -> default",
        "            qname(geosite: geolocation-!cn) -> remote",
        "            fallback: remote",
    ];

    return [
        "dns {",
        `    client_subnet: ${opts.dnsClientSubnet}`,
        // 偏好 IPv4，但 IPv6 仍然可用（不写 ipversion_prefer 即 both）。
        ...(flags.ipv6Enabled ? [] : ["    ipversion_prefer: 4"]),
        "    upstream {",
        `        default: '${opts.dnsDefaultUpstream}' -> direct`,
        `        remote: '${opts.dnsRemoteUpstream}' -> ${opts.dnsRemoteExit}`,
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
