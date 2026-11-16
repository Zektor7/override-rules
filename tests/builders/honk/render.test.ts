import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
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
    const nodes = analyzeNodes(PROXIES, flags.countryThreshold, flags.preferPatterns);
    return renderHonkConfig({ flags, nodes }, inline);
}

describe("renderHonkConfig 段落顺序", () => {
    it("按 banner → subscription → group → dns → routing → global → assets → experimental → 尾注的顺序", () => {
        const text = render();
        const idx = (needle: string) => text.indexOf(needle);

        const banner = idx("# 由 override-rules 静态生成器产出");
        const subscription = idx("subscription {");
        const group = idx("\ngroup {");
        const dns = idx("\ndns {");
        const routing = idx("\nrouting {");
        const global = idx("\nglobal {");
        const assets = idx("\nassets {");
        const experimental = idx("\nexperimental {");
        const tail = idx("以下 Clash/Mihomo 字段在 honk 输出中无对应概念");

        assert.ok(banner >= 0, "banner 缺失");
        for (const [name, position] of [
            ["subscription", subscription],
            ["group", group],
            ["dns", dns],
            ["routing", routing],
            ["global", global],
            ["assets", assets],
            ["experimental", experimental],
            ["尾注", tail],
        ] as const) {
            assert.ok(position > 0, `${name} 缺失`);
        }
        assert.ok(banner < subscription);
        assert.ok(subscription < group);
        assert.ok(group < dns);
        assert.ok(dns < routing);
        assert.ok(routing < global);
        assert.ok(global < assets);
        assert.ok(assets < experimental);
        assert.ok(experimental < tail);
    });

    it("banner 参数指纹反映 flags 内容", () => {
        const text = render({ grouptype: "2", adblock: "0", ipv6: "true", quic: "true" });
        assert.match(text, /grouptype=2 \(loadbalance\)/);
        assert.match(text, /adblock=0/);
        assert.match(text, /ipv6=on/);
        assert.match(text, /quic=on/);
    });

    it("banner 显示 include/exclude/prefer 参数", () => {
        const text = render({ include: "netflix", exclude: "", prefer: "香港.*01" });
        assert.match(text, /include=netflix/);
        assert.match(text, /prefer=香港\.\*01/);
    });

    it("subscription 占位块提示用户替换 URL", () => {
        const text = render();
        assert.match(text, /my_sub: 'https:\/\/example\.com\/your-subscription'/);
        assert.match(text, /interval: 86400s/);
        assert.match(text, /route: direct/);
    });
});

describe("renderHonkConfig 段落内容", () => {
    it("dns 段随 ipv6 参数变化", () => {
        assert.match(render({ ipv6: "false" }), /qtype\(aaaa\) -> reject/);
        assert.ok(!render({ ipv6: "true" }).includes("qtype(aaaa) -> reject"));
    });

    it("routing 段包含自维护 ruleset 的内联域名", () => {
        const inline: InlineRuleSetMap = {
            PT: ["DOMAIN-SUFFIX,byr.pt", "DOMAIN-SUFFIX,m-team.cc"],
        };
        const text = render({}, inline);
        assert.match(text, /domain\(suffix: byr\.pt, m-team\.cc\) -> PT/);
    });

    it("experimental 段同时输出 native_api 与 clash_api", () => {
        const text = render();
        assert.match(text, /native_api \{[\s\S]*listen: '0\.0\.0\.0:9527'/);
        assert.match(text, /clash_api \{[\s\S]*external_controller: '0\.0\.0\.0:9090'/);
    });

    it("末尾的丢弃说明覆盖 landing / tailscale / fakeip / tun 等", () => {
        const text = render();
        for (const needle of [
            "landing / dialer-proxy 链式代理",
            "tailscale 节点",
            "fake-ip 引擎、sniffer、TCP keepalive",
            "tun 段",
            "GLOBAL 汇总组",
        ]) {
            assert.ok(text.includes(needle), `丢弃说明缺少: ${needle}`);
        }
    });

    it("文件以换行结尾且大括号数量平衡", () => {
        const text = render({ prefer: "香港.*01", adblock: "1" });
        assert.ok(text.endsWith("\n"));
        const opens = (text.match(/\{/g) ?? []).length;
        const closes = (text.match(/\}/g) ?? []).length;
        assert.equal(opens, closes, "大括号数量不平衡");
    });
});
