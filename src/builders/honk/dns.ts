/**
 * 生成 honk `dns {}` 段落。
 *
 * honk 的 DNS upstream 在定义时就绑定出口，与 Clash 的 `nameserver` +
 * `proxy-server-nameserver` 分离不同。这里把参数化的 default / remote 两个
 * upstream 与 `client_subnet` 拼成完整段：
 * - default → direct（国内 DNS，直连查询）；
 * - remote → `opts.dnsRemoteExit`（默认 `Select`，国外 DNS 走主选择器）；
 *
 * `qtype(aaaa)` 由 `flags.ipv6Enabled` 控制是否拒绝；fakeip/keepalive/sniffer 在
 * honk 里没有对应字段，不出现。
 */

import type { FeatureFlags } from "../../types/args";
import type { HonkRuntimeOptions } from "../../types/honk";

/** 渲染完整的 `dns {}` 段（含首尾大括号）。 */
export function buildHonkDns(flags: FeatureFlags, opts: HonkRuntimeOptions): string[] {
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
        `    client_subnet: ${opts.dnsClientSubnet}`,
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
