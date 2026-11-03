import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    filterProxyGroupsByRules,
    filterRuleSetsByRules,
    getActiveProxyGroupNames,
    shouldKeepRule,
} from "../../src/builders/rule-filter";
import type { ProxyGroup } from "../../src/types/proxy";

describe("shouldKeepRule", () => {
    it("基础规则始终保留", () => {
        const included = new Set(["netflix"]);
        assert.ok(shouldKeepRule("GEOIP,private,DIRECT,no-resolve", included, new Set()));
        assert.ok(shouldKeepRule("GEOIP,cn,DIRECT", included, new Set()));
        assert.ok(shouldKeepRule("MATCH,Final", included, new Set()));
    });

    it("include 白名单按标识命中且大小写不敏感", () => {
        const included = new Set(["adblock", "netflix"]);
        assert.ok(shouldKeepRule("RULE-SET,ADBlock,广告拦截", included, new Set()));
        assert.ok(shouldKeepRule("GEOSITE,netflix,Netflix", included, new Set()));
        assert.ok(!shouldKeepRule("GEOSITE,google,谷歌服务", included, new Set()));
    });

    it("exclude 黑名单命中时剔除规则", () => {
        const excluded = new Set(["ehentai", "truthsocial.com"]);
        assert.ok(!shouldKeepRule("RULE-SET,EHentai,E-Hentai", null, excluded));
        assert.ok(!shouldKeepRule("DOMAIN-SUFFIX,truthsocial.com,Truth Social", null, excluded));
        assert.ok(shouldKeepRule("GEOSITE,google,谷歌服务", null, excluded));
    });

    it("无过滤参数时保留全部规则", () => {
        assert.ok(shouldKeepRule("GEOSITE,google,谷歌服务", null, new Set()));
    });
});

describe("getActiveProxyGroupNames", () => {
    it("收集被引用的代理组并忽略内置策略", () => {
        const names = getActiveProxyGroupNames([
            "RULE-SET,EHentai,E-Hentai",
            "GEOIP,telegram,Telegram,no-resolve",
            "GEOIP,cn,DIRECT",
            "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT",
        ]);

        assert.deepEqual([...names].sort(), ["E-Hentai", "Telegram"]);
    });
});

describe("filterProxyGroupsByRules", () => {
    const groups: ProxyGroup[] = [
        { name: "选择代理", type: "select", proxies: ["自动选择", "Netflix", "DIRECT"] },
        {
            name: "自动选择",
            type: "url-test",
            url: "https://cp.cloudflare.com",
            interval: 60,
            tolerance: 20,
            proxies: ["香港01", "香港节点"],
        },
        { name: "Netflix", type: "select", proxies: ["E-Hentai", "DIRECT"] },
        { name: "E-Hentai", type: "select", proxies: ["选择代理", "DIRECT"] },
        { name: "香港节点", type: "select", proxies: ["香港01"] },
    ];

    const context = {
        countryNames: ["香港"],
        allProxyNames: new Set(["香港01"]),
    };

    it("保留基础设施组与地区组，剔除未被引用的服务组", () => {
        const kept = filterProxyGroupsByRules(groups, ["GEOSITE,netflix,Netflix"], context);

        assert.deepEqual(
            kept.map((group) => group.name),
            ["选择代理", "自动选择", "Netflix", "香港节点"]
        );
    });

    it("清理指向已删除组的悬空候选，保留仍存在的组与节点", () => {
        const kept = filterProxyGroupsByRules(groups, ["GEOSITE,netflix,Netflix"], context);
        const netflix = kept.find((group) => group.name === "Netflix");
        const select = kept.find((group) => group.name === "选择代理");
        const auto = kept.find((group) => group.name === "自动选择");

        assert.deepEqual(netflix?.proxies, ["DIRECT"]);
        assert.deepEqual(select?.proxies, ["自动选择", "Netflix", "DIRECT"]);
        assert.deepEqual(auto?.proxies, ["香港01", "香港节点"]);
    });

    it("候选被清空且未启用 include-all 时补入 DIRECT", () => {
        const source: ProxyGroup[] = [
            { name: "选择代理", type: "select", proxies: ["Netflix"] },
            { name: "Netflix", type: "select", proxies: ["香港01"] },
        ];
        const kept = filterProxyGroupsByRules(source, ["GEOIP,cn,DIRECT"], {
            countryNames: [],
            allProxyNames: new Set(["香港01"]),
        });

        assert.deepEqual(kept.find((group) => group.name === "选择代理")?.proxies, ["DIRECT"]);
    });

    it("启用 include-all 的组不会被补入 DIRECT", () => {
        const source: ProxyGroup[] = [{ name: "新浪微博", type: "select", "include-all": true }];
        const kept = filterProxyGroupsByRules(source, ["RULE-SET,Weibo,新浪微博"], context);

        assert.equal(kept[0]?.proxies, undefined);
    });
});

describe("filterRuleSetsByRules", () => {
    it("仅保留被 RULE-SET 引用的规则集", () => {
        const filtered = filterRuleSetsByRules(
            { EHentai: { type: "http" }, Weibo: { type: "http" }, GFWList: { type: "http" } },
            ["RULE-SET,Weibo,新浪微博", "GEOSITE,google,谷歌服务"]
        );

        assert.deepEqual(Object.keys(filtered), ["Weibo"]);
    });
});
