import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../../src/args/honk-parse";
import { buildHonkRoutingLines, translateRule } from "../../../src/builders/honk/rules";
import { PROXY_GROUPS } from "../../../src/catalog/group-names";
import type { InlineRuleSetMap } from "../../../src/types/honk";
import type { ProxyNode } from "../../../src/types/proxy";

const PROXIES: ProxyNode[] = [
    { name: "香港01" },
    { name: "香港02" },
    { name: "美国01" },
    { name: "美国02" },
];

const EMPTY_INLINE: InlineRuleSetMap = {};

function run(args: Record<string, string> = {}, inline: InlineRuleSetMap = EMPTY_INLINE): string[] {
    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args, flags);
    const nodes = analyzeNodes(PROXIES, flags.countryThreshold, flags.preferPatterns);
    return buildHonkRoutingLines({ flags, opts, nodes }, inline);
}

describe("translateRule 单条翻译", () => {
    it("QUIC 拦截规则映射到 l4proto(udp) && dport(443) -> block", () => {
        const out = translateRule("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT", EMPTY_INLINE);
        assert.deepEqual(out, ["    l4proto(udp) && dport(443) -> block"]);
    });

    it("GEOIP,private 转成 dip(geoip: private) && !dport(53) -> direct(must)", () => {
        const out = translateRule("GEOIP,private,DIRECT,no-resolve", EMPTY_INLINE);
        assert.deepEqual(out, ["    dip(geoip: private) && !dport(53) -> direct(must)"]);
    });

    it("GEOIP,cn 屏蔽 53/853 端口避免误伤 DNS/DoT", () => {
        const out = translateRule("GEOIP,cn,DIRECT", EMPTY_INLINE);
        assert.deepEqual(out, ["    dip(geoip: cn) && !dport(53, 853) -> direct(must)"]);
    });

    it("GEOIP,telegram 转成 dip(geoip: telegram) -> Telegram", () => {
        const out = translateRule("GEOIP,telegram,Telegram,no-resolve", EMPTY_INLINE);
        assert.deepEqual(out, ["    dip(geoip: telegram) -> Telegram"]);
    });

    it("GEOSITE 转成 domain(geosite: ...)，保留 @cn 与 !cn 修饰符", () => {
        assert.deepEqual(translateRule("GEOSITE,netflix,Netflix", EMPTY_INLINE), [
            "    domain(geosite: netflix) -> Netflix",
        ]);
        assert.deepEqual(
            translateRule(`GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`, EMPTY_INLINE),
            ["    domain(geosite: category-ai-!cn) -> AI"]
        );
        assert.deepEqual(translateRule("GEOSITE,microsoft@cn,DIRECT", EMPTY_INLINE), [
            "    domain(geosite: microsoft@cn) -> direct",
        ]);
    });

    it("DOMAIN-SUFFIX 转成 domain(suffix: ...) -> 目标组", () => {
        assert.deepEqual(
            translateRule(
                `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
                EMPTY_INLINE
            ),
            ["    domain(suffix: truthsocial.com) -> TruthSocial"]
        );
    });

    it("MATCH 转成 fallback", () => {
        assert.deepEqual(translateRule("MATCH,Final", EMPTY_INLINE), ["    fallback: Final"]);
    });

    it("目标为 LANDING/FRONT_PROXY/TAILSCALE 时整条规则跳过", () => {
        assert.deepEqual(
            translateRule(`DOMAIN-SUFFIX,a.com,${PROXY_GROUPS.LANDING}`, EMPTY_INLINE),
            []
        );
        assert.deepEqual(
            translateRule("IP-CIDR,100.64.0.0/10,Tailscale,no-resolve", EMPTY_INLINE),
            []
        );
    });

    it("AdBlock/SogouInput 目标降级为 block/direct 出口", () => {
        assert.deepEqual(
            translateRule(`DOMAIN-SUFFIX,ads.com,${PROXY_GROUPS.AD_BLOCK}`, EMPTY_INLINE),
            ["    domain(suffix: ads.com) -> block"]
        );
        assert.deepEqual(
            translateRule(`DOMAIN-SUFFIX,sogou.com,${PROXY_GROUPS.SOGOU_INPUT}`, EMPTY_INLINE),
            ["    domain(suffix: sogou.com) -> direct"]
        );
    });
});

describe("RULE-SET 翻译", () => {
    it("项目自维护 ruleset 展开为 domain(full/suffix/keyword)", () => {
        const inline: InlineRuleSetMap = {
            PT: [
                "DOMAIN,hudbt.hust.edu.cn",
                "DOMAIN-SUFFIX,byr.pt",
                "DOMAIN-SUFFIX,m-team.cc",
                "DOMAIN-KEYWORD,tracker",
                "# 注释会被忽略",
                "",
                "IP-CIDR,1.2.3.4/32,DIRECT",
            ],
        };
        const out = translateRule(`RULE-SET,PT,${PROXY_GROUPS.PT_SITE}`, inline);
        assert.deepEqual(out, [
            "    domain(full: hudbt.hust.edu.cn) -> PT",
            "    domain(suffix: byr.pt, m-team.cc) -> PT",
            "    domain(keyword: tracker) -> PT",
        ]);
    });

    it("内联 ruleset 为空时整条规则跳过", () => {
        const out = translateRule(`RULE-SET,PT,${PROXY_GROUPS.PT_SITE}`, { PT: [] });
        assert.deepEqual(out, []);
    });

    it("ADBlock 外部 ruleset 近似为 geosite: category-ads-all 并落到 block", () => {
        const out = translateRule(`RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`, EMPTY_INLINE);
        assert.deepEqual(out, ["    domain(geosite: category-ads-all) -> block"]);
    });

    it("GFWList 近似为 geosite: geolocation-!cn 并落到 Select", () => {
        const out = translateRule(`RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`, EMPTY_INLINE);
        assert.deepEqual(out, ["    domain(geosite: geolocation-!cn) -> Select"]);
    });

    it("SogouInput/StaticResources/CDNResources 输出注释跳过", () => {
        for (const key of ["SogouInput", "StaticResources", "CDNResources"]) {
            const out = translateRule(
                `RULE-SET,${key},${PROXY_GROUPS.STATIC_RESOURCES}`,
                EMPTY_INLINE
            );
            assert.equal(out.length, 1);
            assert.match(out[0], new RegExp(`#\\s*\\[honk\\].*${key}`));
        }
    });

    it("未识别 ruleset 键给出明确注释", () => {
        const out = translateRule("RULE-SET,FutureAdded,Netflix", EMPTY_INLINE);
        assert.equal(out.length, 1);
        assert.match(out[0], /未识别的 RULE-SET,FutureAdded/);
    });
});

describe("buildHonkRoutingLines 端到端", () => {
    it("quic=false 时首条为 UDP 443 拦截", () => {
        const lines = run({ quic: "false" });
        assert.equal(lines[0], "    l4proto(udp) && dport(443) -> block");
    });

    it("quic=true 时不含 UDP 443 拦截", () => {
        const lines = run({ quic: "true" });
        assert.ok(!lines.some((l) => l.includes("l4proto(udp) && dport(443)")));
    });

    it("adblock=0 时不产出 category-ads-all 规则", () => {
        const lines = run({ adblock: "0" });
        assert.ok(!lines.some((l) => l.includes("category-ads-all")));
    });

    it("adblock=1 时近似输出 geosite: category-ads-all -> block", () => {
        const lines = run({ adblock: "1" });
        assert.ok(lines.some((l) => l.trim() === "domain(geosite: category-ads-all) -> block"));
    });

    it("以 fallback: Final 收尾", () => {
        const lines = run({});
        assert.equal(lines.at(-1), "    fallback: Final");
    });

    it("exclude=netflix 时相关规则被剔除", () => {
        const lines = run({ exclude: "netflix" });
        assert.ok(!lines.some((l) => l.includes("geosite: netflix")));
    });

    it("include=netflix 时只保留 netflix 相关规则与基础兜底", () => {
        const lines = run({ include: "netflix" });
        const netflixFiring = lines.filter((l) => l.toLowerCase().includes("netflix"));
        assert.equal(netflixFiring.length, 2, "GEOSITE + GEOIP 各一条");
        // 保留 GEOIP private/cn 与 MATCH 收尾，其余服务规则被裁掉
        assert.ok(lines.some((l) => l.includes("dip(geoip: private)")));
        assert.ok(lines.some((l) => l.includes("dip(geoip: cn)")));
        assert.ok(!lines.some((l) => l.includes("geosite: youtube")));
    });

    it("Tailscale 相关 IP-CIDR 与 DOMAIN-SUFFIX 被跳过", () => {
        const tailscaleProxies: ProxyNode[] = [
            ...PROXIES,
            { name: "Tailscale节点", type: "tailscale" },
        ];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(tailscaleProxies, flags.countryThreshold, flags.preferPatterns);
        const lines = buildHonkRoutingLines({ flags, opts, nodes }, EMPTY_INLINE);
        assert.ok(!lines.some((l) => l.includes("100.64.0.0")));
        assert.ok(!lines.some((l) => l.includes("ts.net")));
    });
});
