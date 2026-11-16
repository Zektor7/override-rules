import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../../src/args/honk-parse";
import { buildHonkGroupSpecs, buildHonkGroups } from "../../../src/builders/honk/groups";
import { PROXY_GROUPS } from "../../../src/catalog/group-names";
import type { ProxyNode } from "../../../src/types/proxy";

/** 覆盖 4 个地区 + 2 个低倍率节点，方便断言组数量与顺序。 */
const PROXIES: ProxyNode[] = [
    { name: "香港01" },
    { name: "香港02" },
    { name: "台湾01" },
    { name: "台湾02" },
    { name: "日本01" },
    { name: "日本02" },
    { name: "美国01" },
    { name: "美国02" },
    { name: "香港 0.2x 大流量" },
    { name: "日本省流" },
];

function build(args: Record<string, string> = {}) {
    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args);
    const nodes = analyzeNodes(PROXIES, flags.countryThreshold, flags.preferPatterns);
    return { flags, opts, nodes };
}

describe("buildHonkGroupSpecs", () => {
    it("默认顺序：Select → Auto → Fallback → 服务组 → 地区组 → LowCost → Final", () => {
        const specs = buildHonkGroupSpecs(build());
        const names = specs.map((s) => s.name);

        assert.equal(names[0], "Select");
        assert.equal(names[1], "Auto");
        assert.equal(names[2], "Fallback");
        assert.ok(names.indexOf("HK") > names.indexOf("Fallback"));
        assert.equal(names.at(-1), "Final");
        assert.equal(names.at(-2), "LowCost");
    });

    it("Prefer 组仅在 prefer 参数命中时置于首位", () => {
        const withoutPrefer = buildHonkGroupSpecs(build()).map((s) => s.name);
        assert.ok(!withoutPrefer.includes("Prefer"));

        const specs = buildHonkGroupSpecs(build({ prefer: "香港.*01" }));
        assert.equal(specs[0].name, "Prefer");
        assert.equal(specs[0].policy, "fallback");
        assert.equal(specs[0].final, "Auto");
        assert.match(specs[0].filter, /name\(regex: '香港\.\*01'\)/);
    });

    it("grouptype=0 时 Auto 与地区组 policy 为 select", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "0" }));
        const auto = specs.find((s) => s.name === "Auto");
        const hk = specs.find((s) => s.name === "HK");
        assert.equal(auto?.policy, "select");
        assert.equal(hk?.policy, "select");
    });

    it("grouptype=1 时 Auto 与地区组 policy 为 min_moving_avg", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "1" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "min_moving_avg");
        assert.equal(specs.find((s) => s.name === "HK")?.policy, "min_moving_avg");
    });

    it("grouptype=2 时使用 loadbalance", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "2" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "loadbalance");
    });

    it("Final 组始终使用 score policy 且开启 interrupt_connections", () => {
        const final = buildHonkGroupSpecs(build()).find((s) => s.name === "Final");
        assert.equal(final?.policy, "score");
        assert.equal(final?.interruptConnections, true);
    });

    it("不生成 LANDING/FRONT_PROXY/TAILSCALE/MANUAL/AD_BLOCK/SOGOU_INPUT 组", () => {
        const names = buildHonkGroupSpecs(build({ prefer: "香港" })).map((s) => s.name);
        const forbidden = [
            "Landing",
            "FrontProxy",
            "Tailscale",
            "Manual",
            "AdBlock",
            "SogouInput",
            "GLOBAL",
        ];
        for (const name of forbidden) {
            assert.ok(!names.includes(name), `不应生成组: ${name}`);
        }
    });

    it("地区组按 groupedCountries 生成，展平模式下不生成地区组", () => {
        const grouped = buildHonkGroupSpecs(build()).map((s) => s.name);
        assert.ok(grouped.includes("HK"));
        assert.ok(grouped.includes("TW"));
        assert.ok(grouped.includes("JP"));
        assert.ok(grouped.includes("US"));

        // 只剩一个地区时展平：给一份仅覆盖美国的订阅。
        const singleRegion: ProxyNode[] = [
            { name: "美国01" },
            { name: "美国02" },
            { name: "美国03" },
        ];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({});
        const nodes = analyzeNodes(singleRegion, flags.countryThreshold, flags.preferPatterns);
        const flattened = buildHonkGroupSpecs({ flags, opts, nodes }).map((s) => s.name);
        assert.ok(!flattened.includes("US"), "展平模式下不应生成地区组");
    });

    it("AdBlock/SogouInput 不建组，交由路由层落到 block/direct", () => {
        const names = buildHonkGroupSpecs(build()).map((s) => s.name);
        assert.ok(!names.includes("AdBlock"));
        assert.ok(!names.includes("SogouInput"));
    });
});

describe("buildHonkGroups 文本渲染", () => {
    it("首尾包含 group { ... } 块", () => {
        const lines = buildHonkGroups(build());
        assert.equal(lines[0], "group {");
        assert.equal(lines.at(-1), "}");
    });

    it("每个组按 filter → policy → [final] → [interrupt_connections] 顺序渲染", () => {
        const text = buildHonkGroups(build({ prefer: "香港.*01" })).join("\n");
        const preferIdx = text.indexOf("    Prefer {");
        assert.ok(preferIdx >= 0);
        const preferBlock = text.slice(preferIdx, text.indexOf("    }", preferIdx));
        assert.match(preferBlock, /filter:.*\n.*policy:/);
        assert.match(preferBlock, /final: Auto/);
    });

    it("地区组 filter 引用 countriesMeta 里的 pattern 与 excludePattern", () => {
        const text = buildHonkGroups(build()).join("\n");
        // 美国有 excludePattern（美属/亚美尼亚/…）
        assert.match(
            text,
            /US \{[\s\S]*?filter: name\(regex: '[^']*美国[^']*'\) && !name\(regex: '[^']*美属[^']*'\)/
        );
    });

    it("服务组沿用 PROXY_GROUPS 中除已置空之外的每一条映射", () => {
        const text = buildHonkGroups(build()).join("\n");
        // AI/Crypto/Finance/Apple/Google/Microsoft 都是服务组映射
        for (const name of ["AI", "Crypto", "Finance", "Apple", "Google", "Microsoft"]) {
            assert.match(text, new RegExp(`    ${name} \\{`));
        }
        // PROXY_GROUPS.AD_BLOCK / SOGOU_INPUT 已置为 null，不应出现在组块中
        assert.ok(!text.includes(`    ${PROXY_GROUPS.AD_BLOCK} {`));
    });
});
