import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../src/analysis/classify";
import { buildFeatureFlags } from "../../src/args/parse";
import { assembleConfig } from "../../src/builders/config";
import { buildProxyGroups } from "../../src/builders/proxy-groups";
import { buildBaseLists } from "../../src/builders/selectors";
import { PROXY_GROUPS } from "../../src/catalog/group-names";
import type { ScriptArgs } from "../../src/types/args";
import type { ClashConfig } from "../../src/types/clash";
import type { ProxyGroup } from "../../src/types/proxy";

/** 与 `config.test.ts` 相同的组装流程，额外接通本 Fork 的 `include` / `exclude` / `prefer` 参数。 */
function run(args: ScriptArgs, config: ClashConfig): ClashConfig {
    const flags = buildFeatureFlags(args);
    const proxies = config.proxies ?? [];
    const nodes = analyzeNodes(proxies, flags.countryThreshold, flags.preferPatterns);
    const lists = buildBaseLists({
        landing: nodes.landing,
        landingNodes: nodes.landingNodes,
        lowCostNodes: nodes.lowCostNodes,
        nonLandingNodes: nodes.nonLandingNodes,
        tailscaleNodes: nodes.tailscaleNodes,
        regexFilter: flags.regexFilter,
        regions: nodes.regionLayout,
        preferNodes: nodes.preferNodes,
    });
    const proxyGroups = buildProxyGroups({ flags, nodes, lists });

    return assembleConfig(config, { flags, nodes, proxyGroups });
}

function group(config: ClashConfig, name: string): ProxyGroup | undefined {
    return config["proxy-groups"]?.find((item) => item.name === name);
}

function providerNames(config: ClashConfig): string[] {
    return Object.keys(config["rule-providers"] ?? {});
}

const CONFIG: ClashConfig = {
    proxies: [{ name: "香港01" }, { name: "香港02" }, { name: "美国01" }, { name: "美国02" }],
};

describe("include / exclude 参数", () => {
    it("默认输出全部规则、代理组与规则集", () => {
        const result = run({}, CONFIG);

        assert.ok(result.rules?.includes(`RULE-SET,PT,${PROXY_GROUPS.PT_SITE}`));
        assert.ok(providerNames(result).includes("PT"));
        assert.ok(group(result, PROXY_GROUPS.PT_SITE));
        assert.ok(group(result, PROXY_GROUPS.NETFLIX));
    });

    it("exclude=PT 时规则、代理组与规则集同时剔除", () => {
        const result = run({ exclude: "PT" }, CONFIG);

        assert.ok(!result.rules?.some((rule) => rule.includes("PT站点")));
        assert.equal(group(result, PROXY_GROUPS.PT_SITE), undefined);
        assert.ok(!providerNames(result).includes("PT"));
    });

    it("include 白名单只保留被引用的规则集与代理组", () => {
        const result = run({ include: "ADBlock" }, CONFIG);

        assert.deepEqual(providerNames(result), ["ADBlock"]);
        assert.ok(result.rules?.includes(`RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`));
        assert.ok(!result.rules?.some((rule) => rule.startsWith("GEOSITE,netflix")));
        assert.equal(group(result, PROXY_GROUPS.NETFLIX), undefined);
        // 基础设施组与地区组不受过滤影响
        assert.ok(group(result, PROXY_GROUPS.AD_BLOCK));
        assert.ok(group(result, PROXY_GROUPS.SELECT));
        assert.ok(group(result, "香港节点"));
    });

    it("过滤后清理候选列表中指向已删除组的引用", () => {
        const result = run({ include: "ADBlock" }, CONFIG);
        const select = group(result, PROXY_GROUPS.SELECT);

        assert.ok(select?.proxies?.includes("香港节点"));
        assert.ok(!select?.proxies?.includes(PROXY_GROUPS.NETFLIX));
    });

    it("include 解析为空集时退化为不过滤", () => {
        const result = run({ include: ", ," }, CONFIG);

        assert.ok(result.rules?.some((rule) => rule.startsWith("GEOSITE,netflix")));
        assert.ok(providerNames(result).includes("PT"));
        assert.ok(group(result, PROXY_GROUPS.NETFLIX));
    });

    it("PT站点组默认 DIRECT 优先，Final 组以 DIRECT 为首选", () => {
        const result = run({}, CONFIG);

        assert.equal(group(result, PROXY_GROUPS.PT_SITE)?.proxies?.[0], "DIRECT");
        assert.deepEqual(group(result, PROXY_GROUPS.FINAL)?.proxies, [
            "DIRECT",
            PROXY_GROUPS.SELECT,
        ]);
    });
});

describe("prefer 参数", () => {
    it("命中节点时生成 fallback 优先选路组并置于选择代理候选首位", () => {
        const result = run({ prefer: "香港.*01" }, CONFIG);
        const prefer = group(result, PROXY_GROUPS.PREFER);

        assert.equal(prefer?.type, "fallback");
        assert.deepEqual(prefer?.proxies, ["香港01", PROXY_GROUPS.AUTO]);
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.proxies?.[0], PROXY_GROUPS.PREFER);
    });

    it("无命中节点时不创建优先选择组", () => {
        const result = run({ prefer: "不存在" }, CONFIG);

        assert.equal(group(result, PROXY_GROUPS.PREFER), undefined);
        assert.notEqual(group(result, PROXY_GROUPS.SELECT)?.proxies?.[0], PROXY_GROUPS.PREFER);
    });

    it("不命中 Tailscale 节点", () => {
        const result = run(
            { prefer: "Tailscale" },
            {
                proxies: [
                    { name: "香港01" },
                    { name: "香港02" },
                    { name: "美国01" },
                    { name: "Tailscale出口", type: "tailscale" },
                ],
            }
        );

        assert.equal(group(result, PROXY_GROUPS.PREFER), undefined);
    });

    it("未传 prefer 时保持原有候选顺序", () => {
        const result = run({}, CONFIG);

        assert.equal(group(result, PROXY_GROUPS.PREFER), undefined);
        assert.equal(group(result, PROXY_GROUPS.SELECT)?.proxies?.[0], PROXY_GROUPS.AUTO);
    });
});
