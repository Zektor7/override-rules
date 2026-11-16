import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../../src/args/honk-parse";
import { renderHonkConfig } from "../../../src/builders/honk/render";
import type { InlineRuleSetMap } from "../../../src/types/honk";
import type { ProxyNode } from "../../../src/types/proxy";

const PROXIES: ProxyNode[] = [
    { name: "香港01" },
    { name: "香港02" },
    { name: "台湾01" },
    { name: "台湾02" },
    { name: "美国01" },
    { name: "美国02" },
];

function render(args: Record<string, string> = {}, inline: InlineRuleSetMap = {}): string {
    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args);
    const nodes = analyzeNodes(PROXIES, flags.countryThreshold, flags.preferPatterns);
    return renderHonkConfig({ flags, opts, nodes }, inline);
}

describe("renderHonkConfig 段落顺序", () => {
    it("按 banner → subscription → group → dns → routing → global → assets → experimental 顺序", () => {
        const text = render();
        const idx = (needle: string) => text.indexOf(needle);

        const positions: [string, number][] = [
            ["banner", idx("# 由 override-rules 的 honk 覆写动态生成")],
            ["subscription", idx("subscription {")],
            ["group", idx("\ngroup {")],
            ["dns", idx("\ndns {")],
            ["routing", idx("\nrouting {")],
            ["global", idx("\nglobal {")],
            ["assets", idx("\nassets {")],
            ["experimental", idx("\nexperimental {")],
        ];
        for (const [name, position] of positions) {
            assert.ok(position >= 0, `${name} 缺失`);
        }
        for (let i = 0; i < positions.length - 1; i++) {
            assert.ok(
                positions[i][1] < positions[i + 1][1],
                `${positions[i][0]} 应在 ${positions[i + 1][0]} 之前`
            );
        }
    });

    it("banner 参数指纹反映 flags 与 opts 关键值", () => {
        const text = render({
            grouptype: "2",
            adblock: "0",
            ipv6: "true",
            quic: "true",
            subscription: "https://sub.example/token",
            "lan-iface": "eth0",
            "data-dir": "/var/lib/honk",
            "dial-mode": "ip",
        });
        assert.match(text, /grouptype=2 \(loadbalance\)/);
        assert.match(text, /adblock=0/);
        assert.match(text, /ipv6=on/);
        assert.match(text, /quic=on/);
        assert.match(text, /subscription=https:\/\/sub\.example\/token/);
        assert.match(text, /lan-iface=eth0/);
        assert.match(text, /data-dir=\/var\/lib\/honk/);
        assert.match(text, /dial-mode=ip/);
    });

    it("banner 显示 include/exclude/prefer 参数", () => {
        const text = render({ include: "netflix", exclude: "", prefer: "香港.*01" });
        assert.match(text, /include=netflix/);
        assert.match(text, /prefer=香港\.\*01/);
    });

    it("banner 提示被裁剪的 mihomo 字段", () => {
        const text = render();
        assert.match(text, /landing \/ dialer-proxy 链式代理/);
        assert.match(text, /Tailscale outbound/);
        assert.match(text, /fake-ip、sniffer、tcp-keepalive、tun/);
    });
});

describe("subscription 段", () => {
    it("默认使用占位 URL 并附 TODO 提示", () => {
        const text = render();
        assert.match(text, /# TODO: 通过 Sub-Store URL hash/);
        assert.match(text, /my_sub: 'https:\/\/example\.com\/your-subscription'/);
        assert.match(text, /interval: 86400s/);
        assert.match(text, /route: direct/);
        assert.match(text, /cache: true/);
        assert.match(text, /ua: 'clash\.meta\/1\.19\.30'/);
    });

    it("subscription 参数覆盖 URL 与 tag", () => {
        const text = render({
            subscription: "https://sub.example/token",
            subtag: "airport-a",
            "sub-interval": "3600s",
            "sub-route": "Select",
            "sub-cache": "false",
        });
        assert.ok(
            !/# TODO: 通过 Sub-Store URL hash/.test(text),
            "已传入 URL 时不应出现 subscription 的 TODO"
        );
        assert.match(text, /airport-a: 'https:\/\/sub\.example\/token'/);
        assert.match(text, /interval: 3600s/);
        assert.match(text, /route: Select/);
        assert.match(text, /cache: false/);
    });

    it("URL 编码的 subscription 会自动 decode", () => {
        const encoded = encodeURIComponent("https://sub.example/x?token=a b");
        const text = render({ subscription: encoded });
        assert.match(text, /'https:\/\/sub\.example\/x\?token=a b'/);
    });
});

describe("dns / global / experimental 段参数化", () => {
    it("dns 段随 ipv6 参数变化", () => {
        assert.match(render({ ipv6: "false" }), /qtype\(aaaa\) -> reject/);
        assert.ok(!render({ ipv6: "true" }).includes("qtype(aaaa) -> reject"));
    });

    it("dns 默认使用阿里 + Cloudflare DoH，client_subnet=auto", () => {
        const text = render();
        assert.match(text, /client_subnet: auto/);
        assert.match(
            text,
            /default: 'https:\/\/223\.5\.5\.5\/dns-query\?tls_server_name=dns\.alidns\.com' -> direct/
        );
        assert.match(
            text,
            /remote: 'https:\/\/8\.8\.8\.8\/dns-query\?tls_server_name=dns\.google' -> Select/
        );
    });

    it("dns 段可用参数覆盖 upstream 与出口", () => {
        const text = render({
            "dns-default": "udp://119.29.29.29:53",
            "dns-remote": "https://dns.google/dns-query",
            "dns-remote-exit": "Auto",
            "dns-client-subnet": "off",
        });
        assert.match(text, /client_subnet: off/);
        assert.match(text, /default: 'udp:\/\/119\.29\.29\.29:53' -> direct/);
        assert.match(text, /remote: 'https:\/\/dns\.google\/dns-query' -> Auto/);
    });

    it("global 段反映 lan-iface / dial-mode / data-dir / log-level 参数", () => {
        const text = render({
            "lan-iface": "eth0",
            "dial-mode": "ip",
            "data-dir": "/var/lib/honk",
            "log-level": "debug",
            "allow-insecure": "true",
        });
        assert.match(text, /lan_interface: eth0/);
        assert.match(text, /dial_mode: ip/);
        assert.match(text, /data_dir: '\/var\/lib\/honk'/);
        assert.match(text, /log_level: debug/);
        assert.match(text, /allow_insecure: true/);
    });

    it("experimental 段默认同时输出 native_api 与 clash_api", () => {
        const text = render();
        assert.match(text, /native_api \{[\s\S]*listen: '0\.0\.0\.0:9527'/);
        assert.match(text, /clash_api \{[\s\S]*external_controller: '0\.0\.0\.0:9090'/);
    });

    it("native-api=false 时不输出 native_api 块；clash-api 同理", () => {
        const text = render({ "native-api": "false", "clash-api": "false" });
        assert.ok(!text.includes("native_api {"), "native-api=false 时不应输出 native_api 块");
        assert.ok(!text.includes("clash_api {"), "clash-api=false 时不应输出 clash_api 块");
    });

    it("clash-secret 未设置时给出 TODO 注释", () => {
        assert.match(render(), /secret: '' # TODO/);
        const withSecret = render({ "clash-secret": "abc123" });
        assert.ok(!/secret: '[^']*' # TODO/.test(withSecret), "设置后 secret 行不应带 TODO");
        assert.match(withSecret, /secret: 'abc123'/);
    });
});

describe("routing 段参数化", () => {
    it("routing 段包含自维护 ruleset 的内联域名", () => {
        const inline: InlineRuleSetMap = {
            PT: ["DOMAIN-SUFFIX,byr.pt", "DOMAIN-SUFFIX,m-team.cc"],
        };
        const text = render({}, inline);
        assert.match(text, /domain\(suffix: byr\.pt, m-team\.cc\) -> PT/);
    });

    it("quic=false 时首条为 UDP 443 拦截；adblock=1 时启用 geosite 近似", () => {
        const text = render({ adblock: "1" });
        assert.match(text, /routing \{\n\s+l4proto\(udp\) && dport\(443\) -> block/);
        assert.match(text, /domain\(geosite: category-ads-all\) -> block/);
    });
});

describe("产物完整性", () => {
    it("文件以换行结尾且大括号数量平衡", () => {
        const text = render({ prefer: "香港.*01", adblock: "1", subscription: "https://x/y" });
        assert.ok(text.endsWith("\n"));
        const opens = (text.match(/\{/g) ?? []).length;
        const closes = (text.match(/\}/g) ?? []).length;
        assert.equal(opens, closes, "大括号数量不平衡");
    });
});
