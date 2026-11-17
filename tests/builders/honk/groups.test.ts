import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeNodes } from "../../../src/analysis/classify";
import { buildFeatureFlags } from "../../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../../src/args/honk-parse";
import {
    buildHonkGroupSpecs,
    buildHonkGroups,
    collectHonkTargets,
} from "../../../src/builders/honk/groups";
import { buildHonkClashRules } from "../../../src/builders/honk/rules";
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

/** 取组 spec 的第一个 filter（多 filter 时取第一行）。 */
function firstFilter(spec: { filter?: string | readonly string[] } | undefined): string {
    const filter = spec?.filter;
    if (filter === undefined) return "";
    return typeof filter === "string" ? filter : (filter[0] ?? "");
}

/** 取组 spec 的全部 filter 行。 */
function allFilters(spec: { filter?: string | readonly string[] } | undefined): string[] {
    const filter = spec?.filter;
    if (filter === undefined) return [];
    return typeof filter === "string" ? [filter] : [...filter];
}

describe("buildHonkGroupSpecs 层级与顺序", () => {
    it("顺序：地区组 → Auto → Manual → Select → 服务组 → Final（不生成故障转移/低倍率组）", () => {
        const names = buildHonkGroupSpecs(build()).map((s) => s.name);
        assert.equal(names[0], "HK");
        assert.equal(names[3], "US");
        assert.equal(names[4], "Auto");
        assert.equal(names[5], "Manual");
        assert.equal(names[6], "Select");
        assert.ok(names.indexOf("AI") > names.indexOf("Select"));
        assert.equal(names.at(-1), "Final");
        assert.ok(!names.includes("Fallback"), "不应生成故障转移组");
        assert.ok(!names.includes("LowCost"), "不应生成低倍率组");
    });

    it("被嵌套引用的组一定声明在引用方之前（honk 拒绝未知嵌套 tag）", () => {
        const names = buildHonkGroupSpecs(build({ prefer: "香港.*01" })).map((s) => s.name);
        const before = (referenced: string, referrer: string) =>
            names.indexOf(referenced) < names.indexOf(referrer);
        assert.ok(before("Auto", "Select"));
        assert.ok(before("Fallback", "Select"));
        assert.ok(before("Manual", "Select"));
        assert.ok(before("Prefer", "Select"));
        assert.ok(before("Select", "AI"));
        assert.ok(before("HK", "AI"));
        assert.ok(before("Select", "Final"));
    });

    it("Prefer 组仅在 prefer 参数命中时生成，final 指向 Auto", () => {
        const withoutPrefer = buildHonkGroupSpecs(build()).map((s) => s.name);
        assert.ok(!withoutPrefer.includes("Prefer"));

        const specs = buildHonkGroupSpecs(build({ prefer: "香港.*01" }));
        const prefer = specs.find((s) => s.name === "Prefer");
        assert.equal(prefer?.policy, "fallback");
        assert.equal(prefer?.final, "Auto");
        assert.match(firstFilter(prefer), /name\(regex: '香港\.\*01'\)/);
    });

    it("不生成 LANDING/FRONT_PROXY/TAILSCALE/AD_BLOCK/SOGOU_INPUT 组", () => {
        const names = buildHonkGroupSpecs(build({ prefer: "香港" })).map((s) => s.name);
        for (const forbidden of [
            "Landing",
            "FrontProxy",
            "Tailscale",
            "AdBlock",
            "SogouInput",
            "GLOBAL",
        ]) {
            assert.ok(!names.includes(forbidden), `不应生成组: ${forbidden}`);
        }
    });

    it("地区组按「有节点」生成：节点数不足 threshold 的地区也会建组", () => {
        const grouped = buildHonkGroupSpecs(build()).map((s) => s.name);
        for (const region of ["HK", "TW", "JP", "US"]) {
            assert.ok(grouped.includes(region), `缺少地区组: ${region}`);
        }

        // honk 侧不再按 threshold/展平规则丢弃地区：单地区单节点也要有地区组
        const singleRegion: ProxyNode[] = [{ name: "美国01" }];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(singleRegion, flags.countryThreshold, flags.preferPatterns);
        const specs = buildHonkGroupSpecs({ flags, opts, nodes }).map((s) => s.name);
        assert.ok(specs.includes("US"), "单地区单节点也应生成地区组");
    });
});

describe("buildHonkGroupSpecs 全节点只存在于手动选择组", () => {
    it("Manual 组持有全节点，其余组只引用地区组/其它组", () => {
        const specs = buildHonkGroupSpecs(build());
        const manual = specs.find((s) => s.name === "Manual");
        assert.match(firstFilter(manual), /^!name\(regex: '/);

        const allNodesFilter = /^!name\(regex: '/;
        for (const spec of specs) {
            if (spec.name === "Manual") continue;
            assert.ok(!allNodesFilter.test(firstFilter(spec)), `${spec.name} 不应直接持有全节点`);
        }
    });

    it("Auto 的候选是地区组", () => {
        const specs = buildHonkGroupSpecs(build());
        assert.equal(
            firstFilter(specs.find((s) => s.name === "Auto")),
            "group('HK', 'TW', 'JP', 'US')"
        );
    });

    it("识别不出地区时，节点进入未分类组而不是被丢掉", () => {
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(
            [{ name: "zzz-01" }],
            flags.countryThreshold,
            flags.preferPatterns
        );
        const specs = buildHonkGroupSpecs({ flags, opts, nodes });
        assert.ok(
            specs.some((s) => s.name === "Other"),
            "应生成未分类组"
        );
        assert.equal(firstFilter(specs.find((s) => s.name === "Auto")), "group('Other')");
    });
});

describe("buildHonkGroupSpecs 未分类组兜底", () => {
    const MIXED: ProxyNode[] = [
        { name: "香港01" },
        { name: "美国01" },
        { name: "IEPL 专线 01" }, // 名字里没有地区关键词
        { name: "剩余流量：100GB" }, // 机场元信息，不是节点
        { name: "官网：example.com" },
    ];

    function buildMixed(args: Args = {}) {
        const flags = buildFeatureFlags(args);
        const opts = buildHonkRuntimeOptions(args, flags);
        const nodes = analyzeNodes(MIXED, flags.countryThreshold, flags.preferPatterns);
        return { flags, opts, nodes };
    }

    it("没有地区关键词 / 本项目未收录地区的节点进入未分类组", () => {
        const specs = buildHonkGroupSpecs(buildMixed());
        const other = specs.find((s) => s.name === "Other");
        assert.ok(other, "应生成未分类组");
        // 未分类组 = 排除所有已知国名 + 排除机场元信息
        assert.match(firstFilter(other), /^!name\(regex: '香港\|/);
        assert.match(firstFilter(other), /!name\(regex: '[^']*剩余[^']*'\)/);
    });

    it("机场元信息条目不进未分类组", () => {
        const specs = buildHonkGroupSpecs(buildMixed());
        const other = specs.find((s) => s.name === "Other");
        assert.match(firstFilter(other), /!name\(regex: '[^']*官网[^']*'\)/);
    });

    it("Tailscale 节点不进未分类组（honk 无 tailscale outbound）", () => {
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(
            [...MIXED, { name: "Tailscale节点", type: "tailscale" }],
            flags.countryThreshold,
            flags.preferPatterns
        );
        const specs = buildHonkGroupSpecs({ flags, opts, nodes });
        const other = specs.find((s) => s.name === "Other");
        assert.ok(other);
        assert.ok(!firstFilter(other).includes("Tailscale"));
    });

    it("未分类组被自动选择 / 选择代理 / 服务组 / 兜底组引用", () => {
        const specs = buildHonkGroupSpecs(buildMixed());
        const auto = specs.find((s) => s.name === "Auto");
        assert.match(firstFilter(auto), /'Other'/);
        assert.match(firstFilter(specs.find((s) => s.name === "Select")), /'Other'/);
        assert.match(firstFilter(specs.find((s) => s.name === "AI")), /'Other'/);
        assert.match(firstFilter(specs.find((s) => s.name === "Final")), /'Other'/);
    });

    it("所有节点都能归到地区时不生成未分类组", () => {
        const specs = buildHonkGroupSpecs(build());
        assert.ok(!specs.some((s) => s.name === "Other"));
    });
});

describe("buildHonkGroupSpecs 地区覆盖范围", () => {
    it("Clash 侧未收录的地区（阿联酋、巴西等）也会生成地区组", () => {
        const proxies: ProxyNode[] = [
            { name: "香港 01" },
            { name: "阿联酋 01" },
            { name: "巴西 01" },
            { name: "巴西 02" },
        ];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(proxies, flags.countryThreshold, flags.preferPatterns);
        const names = buildHonkGroupSpecs({ flags, opts, nodes }).map((s) => s.name);

        assert.ok(names.includes("HK"), "缺少香港组");
        assert.ok(names.includes("AE"), "缺少阿联酋组");
        assert.ok(names.includes("BR"), "缺少巴西组");
        assert.ok(!names.includes("Other"), "已归类到地区时不应再生成未分类组");
    });

    it("地区组 filter 按中文国名匹配", () => {
        const proxies: ProxyNode[] = [{ name: "阿联酋 01" }];
        const flags = buildFeatureFlags({});
        const opts = buildHonkRuntimeOptions({}, flags);
        const nodes = analyzeNodes(proxies, flags.countryThreshold, flags.preferPatterns);
        const specs = buildHonkGroupSpecs({ flags, opts, nodes });
        assert.equal(firstFilter(specs.find((s) => s.name === "AE")), "name(regex: '阿联酋')");
    });
});

describe("buildHonkGroupSpecs 选择代理与兜底组", () => {
    it("选择代理 = 优先选择/自动选择/地区/手动选择，默认停在自动选择", () => {
        const specs = buildHonkGroupSpecs(build());
        const select = specs.find((s) => s.name === "Select");
        assert.equal(select?.policy, "select");
        assert.equal(firstFilter(select), "group('Auto', 'HK', 'TW', 'JP', 'US', 'Manual')");
        assert.equal(select?.defaultValue, "Auto");
        assert.equal(select?.final, "direct");
    });

    it("存在 prefer 时选择代理的默认成员是优先选择", () => {
        const specs = buildHonkGroupSpecs(build({ prefer: "香港.*01" }));
        const select = specs.find((s) => s.name === "Select");
        assert.equal(select?.defaultValue, "Prefer");
        assert.match(firstFilter(select), /'Prefer'/);
    });

    it("兜底组 = 选择代理/地区/手动选择/直连，默认停在直连", () => {
        const specs = buildHonkGroupSpecs(build());
        const final = specs.find((s) => s.name === "Final");
        assert.equal(final?.policy, "select");
        assert.deepEqual(allFilters(final), [
            "group('Select', 'HK', 'TW', 'JP', 'US', 'Manual')",
            "name(direct)",
        ]);
        assert.equal(final?.defaultValue, "direct");
        assert.equal(final?.final, "direct");
    });
});

describe("服务组的 honk 嵌套组语义", () => {
    it("服务组候选 = 选择代理/地区/手动选择，并把直连收进候选", () => {
        const specs = buildHonkGroupSpecs(build());
        const ai = specs.find((s) => s.name === "AI");
        assert.deepEqual(allFilters(ai), [
            "group('Select', 'HK', 'TW', 'JP', 'US', 'Manual')",
            "name(direct)",
        ]);
        assert.equal(ai?.policy, "select");
        assert.equal(ai?.defaultValue, "Select");
    });

    it("服务组之间候选不同：哔哩哔哩偏台港、巴哈姆特偏台湾、TruthSocial 偏美国", () => {
        const specs = buildHonkGroupSpecs(build());
        assert.equal(firstFilter(specs.find((s) => s.name === "Bilibili")), "group('TW', 'HK')");
        assert.equal(specs.find((s) => s.name === "Bilibili")?.defaultValue, "direct");
        assert.equal(
            firstFilter(specs.find((s) => s.name === "Bahamut")),
            "group('TW', 'Select', 'Manual')"
        );
        assert.equal(specs.find((s) => s.name === "Bahamut")?.defaultValue, "TW");
        assert.equal(
            firstFilter(specs.find((s) => s.name === "TruthSocial")),
            "group('US', 'Select', 'Manual')"
        );
        assert.equal(specs.find((s) => s.name === "TruthSocial")?.defaultValue, "US");
    });

    it("静态资源组与其它服务组候选一致（低倍率组已移除）", () => {
        const specs = buildHonkGroupSpecs(build());
        assert.equal(
            firstFilter(specs.find((s) => s.name === "StaticResources")),
            "group('Select', 'HK', 'TW', 'JP', 'US', 'Manual')"
        );
    });

    it("直连优先的服务组默认成员是直连", () => {
        const specs = buildHonkGroupSpecs(build());
        for (const name of ["Finance", "Microsoft", "Weibo", "PT"]) {
            assert.equal(specs.find((s) => s.name === name)?.defaultValue, "direct", name);
        }
        assert.equal(specs.find((s) => s.name === "AI")?.defaultValue, "Select");
    });

    it("include/exclude 裁掉规则后，不再被引用的服务组不生成", () => {
        const ctx = build({ include: "netflix" });
        const targets = collectHonkTargets(buildHonkClashRules(ctx));
        const names = buildHonkGroupSpecs(ctx, targets).map((s) => s.name);

        assert.ok(names.includes("Netflix"), "仍被规则引用的服务组应保留");
        assert.ok(!names.includes("Youtube"), "未被引用的服务组应被裁掉");
        assert.ok(names.includes("HK"), "地区组始终保留");
        assert.ok(names.includes("Final"), "基础设施组始终保留");
    });

    it("exclude 掉某个服务时，对应服务组也不再生成", () => {
        const ctx = build({ exclude: "netflix" });
        const targets = collectHonkTargets(buildHonkClashRules(ctx));
        const names = buildHonkGroupSpecs(ctx, targets).map((s) => s.name);
        assert.ok(!names.includes("Netflix"));
        assert.ok(names.includes("Youtube"));
    });
});

describe("buildHonkGroupSpecs policy", () => {
    it("自动类组（Auto/地区组）默认走 score（grouptype=1 映射）", () => {
        const specs = buildHonkGroupSpecs(build());
        for (const name of ["Auto", "HK", "TW", "JP", "US"]) {
            assert.equal(
                specs.find((s) => s.name === name)?.policy,
                "score",
                `${name} 默认 policy`
            );
        }
        // 组选择器类固定 select
        assert.equal(specs.find((s) => s.name === "Select")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "Manual")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "Final")?.policy, "select");
    });

    it("grouptype=0 时自动类组 policy=select", () => {
        const specs = buildHonkGroupSpecs(build({ grouptype: "0" }));
        assert.equal(specs.find((s) => s.name === "Auto")?.policy, "select");
        assert.equal(specs.find((s) => s.name === "HK")?.policy, "select");
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
        // 组选择器类不跟随 policy
        assert.equal(specs.find((s) => s.name === "Select")?.policy, "select");
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

        // 组选择器不写调优字段避免 honk warning
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
        for (const name of ["Auto", "HK"]) {
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

    it("选择代理组写出 default 成员", () => {
        const text = buildHonkGroups(build()).join("\n");
        assert.match(text, /Select \{[\s\S]*?default: 'Auto'/);
        assert.match(text, /Final \{[\s\S]*?default: 'direct'/);
    });

    it("地区组 filter 只按中文国名匹配（节点名已由上游重命名脚本规范化）", () => {
        const text = buildHonkGroups(build()).join("\n");
        assert.match(text, /HK \{[\s\S]*?filter: name\(regex: '香港'\)/);
        assert.match(text, /US \{[\s\S]*?filter: name\(regex: '美国'\)/);
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
