import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../../src/args/honk-parse";
import { buildHonkGroupSpecs, buildHonkGroups } from "../../../src/builders/honk/groups";
import { PROXY_GROUPS } from "../../../src/catalog/group-names";
import type { HonkScriptArgs } from "../../../src/types/honk";
import type { ScriptArgs } from "../../../src/types/args";
import type { ProxyNode } from "../../../src/types/proxy";

type Args = ScriptArgs & HonkScriptArgs;

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

function build(args: Args = {}) {
    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args, flags);
    const nodes = analyzeNodes(PROXIES, flags.countryThreshold, flags.preferPatterns);
    return { flags, opts, nodes };
}

describe("buildHonkGroupSpecs 顺序与结构", () => {
    it("默认顺序：Select → Auto → Fallback → 服务组 → 地区组 → LowCost → Final", () => {
        const names = buildHonkGroupSpecs(build()).map((s) => s.name);
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
        assert.match(specs[0].filter ?? "", /name\(regex: '香港\.\*01'\)/);
    });

    it("不生成 LANDING/FRONT_PROXY/TAILSCALE/MANUAL/AD_BLOCK/SOGOU_INPUT 组", () => {
        const names = buildHonkGroupSpecs(build({ prefer: "香港" })).map((s) => s.name);
        for (const forbidden of [
            "Landing",
            "FrontProxy",
            "Tailscale",
            "Manual",
            "AdBlock",
            "SogouInput",
            "GLOBAL",
        ]) {
            assert.ok(!names.includes(forbidden), `不应生成组: ${forbidden}`);
        }
    });

    it("地区组按 groupedCountries 生成，展平模式下不生成地区组", () => {
        const grouped = buildHonkGroupSpecs(build()).map((s) => s.name);
        for (const region of ["HK", "TW", "JP", "US"]) {
            assert.ok(grouped.includes(region), `缺少地区组: ${region}`);
        }

        const singleRegion: ProxyNode[] = [
            { name: "美国01" },
            { name: "美国02" },
            { name: "美国03" },
        ];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(singleRegion, flags.countryThreshold, flags.preferPatterns);
        const flattened = buildHonkGroupSpecs({ flags, opts, nodes }).map((s) => s.name);
        assert.ok(!flattened.includes("US"), "展平模式下不应生成地区组");
    });
});

describe("buildHonkGroupSpecs policy", () => {
    it("默认所有自动类组走 score（grouptype=1 映射）", () => {
        const specs = buildHonkGroupSpecs(build());
        for (const name of ["Auto", "HK", "TW", "JP", "US", "LowCost", "Final"]) {
            assert.equal(
                specs.find((s) => s.name === name)?.policy,
                "score",
                `${name} 默认 policy`
            );
        }
        // Select 与 Fallback 不受影响
        assert.equal(specs.find((s) => s.name === "Select")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "Fallback")?.policy, "fallback");
    });

    it("grouptype=0 时自动类组 policy=select", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "0" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "HK")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "Final")?.policy, "select");
    });

    it("grouptype=2 时自动类组 policy=loadbalance", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "2" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "loadbalance");
        assert.equal(specs.find((s) => s.name === "HK")?.policy, "loadbalance");
    });

    it("显式 #policy 覆盖 grouptype 映射", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "0", policy: "urltest" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "urltest");
        assert.equal(specs.find((s) => s.name === "HK")?.policy, "urltest");
        // Select 与 Fallback 依然按各自固定策略
        assert.equal(specs.find((s) => s.name === "Select")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "Fallback")?.policy, "fallback");
    });
});

describe("buildHonkGroupSpecs icon 与 URLTest 调优", () => {
    it("每个组都从 catalog/icons 或 countriesMeta 拿到 icon", () => {
        const specs = buildHonkGroupSpecs(build());
        for (const spec of specs) {
            assert.ok(spec.icon && spec.icon.length > 0, `${spec.name} 缺少 icon`);
            assert.match(spec.icon, /^https?:\/\//, `${spec.name} icon 应为绝对 URL`);
        }
    });

    it("policy=urltest 时把 tolerance/idle_timeout/check_url 写到自动类组上", () => {
        const specs = buildHonkGroupSpecs(
            build({
                policy: "urltest",
                tolerance: "100",
                "idle-timeout": "300",
                "check-url": "https://cp.cloudflare.com",
            })
        );
        const auto = specs.find((s) => s.name === "Auto");
        assert.equal(auto?.tolerance, 100);
        assert.equal(auto?.idleTimeout, 300);
        assert.equal(auto?.checkUrl, "https://cp.cloudflare.com");

        const hk = specs.find((s) => s.name === "HK");
        assert.equal(hk?.tolerance, 100);

        // Select/Fallback 属于 selector/fallback 策略，不写调优字段避免 honk warning
        assert.equal(specs.find((s) => s.name === "Select")?.tolerance, undefined);
        assert.equal(specs.find((s) => s.name === "Fallback")?.tolerance, undefined);
    });

    it("policy=select 时（grouptype=0）完全不写 tolerance/idle_timeout/check_url", () => {
        const specs = buildHonkGroupSpecs(
            build({ grouptype: "0", tolerance: "100", "idle-timeout": "300" })
        );
        for (const spec of specs) {
            assert.equal(spec.tolerance, undefined, `${spec.name} 不应带 tolerance`);
            assert.equal(spec.idleTimeout, undefined, `${spec.name} 不应带 idle_timeout`);
        }
    });

    it("Select 与 Final 保留 interrupt_connections: true（大流量切换需要断连）", () => {
        const specs = buildHonkGroupSpecs(build());
        assert.equal(specs.find((s) => s.name === "Select")?.interruptConnections, true);
        assert.equal(specs.find((s) => s.name === "Final")?.interruptConnections, true);
    });

    it("#interrupt=true 时给自动选择类组也加上 interrupt_connections", () => {
        const specs = buildHonkGroupSpecs(build({ interrupt: "true" }));
        // Auto/HK/LowCost 都受影响
        for (const name of ["Auto", "HK", "LowCost"]) {
            assert.equal(specs.find((s) => s.name === name)?.interruptConnections, true, name);
        }
    });
});

describe("buildHonkGroups 文本渲染", () => {
    it("首尾包含 group { ... } 块", () => {
        const lines = buildHonkGroups(build());
        assert.equal(lines[0], "group {");
        assert.equal(lines.at(-1), "}");
    });

    it("每组按 filter → policy → [default] → [final] → [icon] → [tolerance] → [idle_timeout] → [check_url] → [interrupt_connections] 顺序", () => {
        const text = buildHonkGroups(
            build({
                prefer: "香港.*01",
                policy: "urltest",
                tolerance: "80",
                "idle-timeout": "600",
                "check-url": "https://cp.cloudflare.com",
            })
        ).join("\n");
        const autoIdx = text.indexOf("    Auto {");
        assert.ok(autoIdx >= 0);
        const autoBlock = text.slice(autoIdx, text.indexOf("\n    }", autoIdx));
        const fieldOrder = [
            "filter:",
            "policy:",
            "icon:",
            "tolerance:",
            "idle_timeout:",
            "check_url:",
        ];
        let cursor = 0;
        for (const key of fieldOrder) {
            const at = autoBlock.indexOf(key, cursor);
            assert.ok(at >= cursor, `Auto 组 ${key} 顺序错误`);
            cursor = at;
        }
        assert.match(text, /Prefer \{[\s\S]*final: Auto/);
        assert.match(text, /tolerance: 80/);
        assert.match(text, /idle_timeout: 600/);
        assert.match(text, /check_url: 'https:\/\/cp\.cloudflare\.com'/);
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
        for (const name of ["AI", "Crypto", "Finance", "Apple", "Google", "Microsoft"]) {
            assert.match(text, new RegExp(`    ${name} \\{`));
        }
        // PROXY_GROUPS.AD_BLOCK 已置为 null，不应出现在组块中
        assert.ok(!text.includes(`    ${PROXY_GROUPS.AD_BLOCK} {`));
    });
});
