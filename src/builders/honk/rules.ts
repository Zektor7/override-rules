/**
 * 生成 honk `routing {}` 段落的规则行。
 *
 * 输入沿用 `builders/rules.ts` 的输出（已按 `include`/`exclude`/`adblock`/`quic`/Tailscale
 * 参数裁剪的 Clash 规则字符串数组），逐条翻译为 dae/honk 的过滤表达式。
 * 这样 honk 与 Clash 两条分支共享同一份「规则的语义与顺序」，避免 Fork 的 include/exclude
 * 需要在两处重复实现。
 *
 * 支持范围：
 * - 已知 Clash 类型：`GEOIP` / `GEOSITE` / `DOMAIN-SUFFIX` / `MATCH` / QUIC 拦截；
 * - 项目自维护 `ruleset/*.list`（`AdditionalFilter` / `AdditionalCDNResources` /
 *   `TikTok` / `EHentai` / `Weibo` / `PT` / `SteamFix`）通过 `inlinedRuleSets` 内联为
 *   `domain(full|suffix|keyword: ...)`；
 * - 外部 rule-provider：`ADBlock` → `geosite: category-ads-all`、`GFWList` →
 *   `geosite: geolocation-!cn`，其余（`SogouInput` / `StaticResources` /
 *   `CDNResources`）在产物里以注释形式提示，避免用户误以为漏配。
 *
 * 显式忽略：
 * - 目标为 `Landing` / `FrontProxy` / `Tailscale` 的规则（honk 无对应 outbound）；
 * - IP-CIDR 类型的 Tailscale 定向分流（同上）。
 */

import { PROXY_GROUPS } from "../../catalog/group-names";
import { toHonkName } from "../../catalog/honk-groups";
import { buildRules } from "../rules";
import type { InlineRuleSetMap } from "../../types/honk";
import type { HonkBuildContext } from "../../types/honk";

/** Clash 内置动作 → honk 出口。 */
const CLASH_ACTION_TO_HONK: Readonly<Record<string, string>> = {
    DIRECT: "direct",
    REJECT: "block",
    "REJECT-DROP": "block",
};

/**
 * 未建组但仍在 Clash 规则里作为目标的服务组 → honk 出口。
 *
 * AdBlock / SogouInput 在 honk 里不建组（`HONK_GROUP_NAMES` 置为 `null`），
 * 直接在路由层给出等价动作，行为与 kenzok8 / qichiyuhub 的模板一致。
 */
const CLASH_GROUP_TO_HONK_ACTION: Readonly<Record<string, string>> = {
    [PROXY_GROUPS.AD_BLOCK]: "block",
    [PROXY_GROUPS.SOGOU_INPUT]: "direct",
};

/**
 * 外部 rule-provider 在 honk 侧的 geosite 近似映射。
 *
 * honk 没有 rule-provider，只能靠 geosite 分类近似；用户如需精确来源可自行
 * 在 `routing {}` 段落补 `domain(...)`。
 */
const EXTERNAL_RULESET_TO_GEOSITE: Readonly<Record<string, string>> = {
    ADBlock: "category-ads-all",
    GFWList: "geolocation-!cn",
};

/** 无近似可依赖、只能整体跳过的外部 ruleset；产物里给出注释方便排查。 */
const EXTERNAL_RULESETS_SKIPPED: readonly string[] = [
    "SogouInput",
    "StaticResources",
    "CDNResources",
];

/** QUIC 拦截规则在 Clash 里的固定文本；honk 需要单独前缀判断，避免 `split(",")` 破坏括号。 */
const CLASH_QUIC_REJECT_RULE = "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT";
const HONK_QUIC_REJECT_RULE = "    l4proto(udp) && dport(443) -> block";

/** 把 Clash 规则里的目标（组名或内置动作）翻译成 honk 出口；返回 `null` 表示应跳过。 */
function translateTarget(clashTarget: string | undefined): string | null {
    if (!clashTarget) return null;
    const action = CLASH_ACTION_TO_HONK[clashTarget];
    if (action) return action;
    const shortcut = CLASH_GROUP_TO_HONK_ACTION[clashTarget];
    if (shortcut) return shortcut;
    return toHonkName(clashTarget);
}

/** 从 `ruleset/*.list` 逐行解析出 DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD 三类。 */
function parseRulesetEntries(entries: readonly string[]): {
    full: string[];
    suffix: string[];
    keyword: string[];
} {
    const full: string[] = [];
    const suffix: string[] = [];
    const keyword: string[] = [];

    for (const raw of entries) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("//")) continue;
        const parts = line.split(",");
        if (parts.length < 2) continue;
        const type = parts[0].trim().toUpperCase();
        const value = parts[1].trim();
        if (!value) continue;
        if (type === "DOMAIN") full.push(value);
        else if (type === "DOMAIN-SUFFIX") suffix.push(value);
        else if (type === "DOMAIN-KEYWORD") keyword.push(value);
        // 其他类型（IP-CIDR、GEO 等）目前项目自维护 ruleset 未使用，遇到时忽略。
    }

    return { full, suffix, keyword };
}

/** 把内联的 ruleset 展开为一条或多条 `domain(...) -> target` 行；无有效条目返回空数组。 */
function inlineRuleSet(entries: readonly string[], honkTarget: string): string[] {
    const { full, suffix, keyword } = parseRulesetEntries(entries);
    const lines: string[] = [];
    if (full.length > 0) lines.push(`    domain(full: ${full.join(", ")}) -> ${honkTarget}`);
    if (suffix.length > 0) lines.push(`    domain(suffix: ${suffix.join(", ")}) -> ${honkTarget}`);
    if (keyword.length > 0)
        lines.push(`    domain(keyword: ${keyword.join(", ")}) -> ${honkTarget}`);
    return lines;
}

/** `RULE-SET` 类型的分发：项目自维护走内联，外部走 geosite 近似或跳过并加注释。 */
function translateRuleSet(
    key: string,
    honkTarget: string,
    inlinedRuleSets: InlineRuleSetMap
): string[] {
    // `inlinedRuleSets` 里登记的键一律走内联展开，空数组时直接无输出（避免默认回退到外部近似）。
    if (Object.prototype.hasOwnProperty.call(inlinedRuleSets, key)) {
        return inlineRuleSet(inlinedRuleSets[key] ?? [], honkTarget);
    }

    const geositeApprox = EXTERNAL_RULESET_TO_GEOSITE[key];
    if (geositeApprox) {
        return [`    domain(geosite: ${geositeApprox}) -> ${honkTarget}`];
    }

    if (EXTERNAL_RULESETS_SKIPPED.includes(key)) {
        return [
            `    # [honk] RULE-SET,${key} 依赖外部 rule-provider，honk 不支持；如需请手工添加。`,
        ];
    }

    // 未登记的 ruleset 键：视为项目/上游新增，产物里明确提示，避免静默丢弃。
    return [`    # [honk] 未识别的 RULE-SET,${key}，已跳过。`];
}

/**
 * 翻译一条 Clash 规则为一行或多行 honk 规则。
 * @param rule - `buildRules()` 输出的一条规则字符串
 * @param inlinedRuleSets - `ruleset/*.list` 已读取的内容，仅在 `RULE-SET` 分支使用
 * @returns honk 语法行数组；空数组表示该条整体跳过
 */
export function translateRule(rule: string, inlinedRuleSets: InlineRuleSetMap): string[] {
    if (rule === CLASH_QUIC_REJECT_RULE) {
        return [HONK_QUIC_REJECT_RULE];
    }

    // MATCH 只有两段（`MATCH,Final`），单独处理避免与三段式解析混在一起。
    if (rule.startsWith("MATCH,")) {
        const target = translateTarget(rule.split(",")[1]);
        return target ? [`    fallback: ${target}`] : [];
    }

    const parts = rule.split(",");
    if (parts.length < 3) return [];

    const [type, arg1] = parts;
    const hasNoResolve = parts.at(-1) === "no-resolve";
    const clashTarget = hasNoResolve ? parts.at(-2) : parts.at(-1);
    const honkTarget = translateTarget(clashTarget);
    if (!honkTarget) return [];

    switch (type) {
        case "GEOIP":
            if (arg1 === "private") {
                return [`    dip(geoip: private) && !dport(53) -> direct(must)`];
            }
            if (arg1 === "cn") {
                return [`    dip(geoip: cn) && !dport(53, 853) -> direct(must)`];
            }
            return [`    dip(geoip: ${arg1}) -> ${honkTarget}`];
        case "GEOSITE":
            return [`    domain(geosite: ${arg1}) -> ${honkTarget}`];
        case "DOMAIN-SUFFIX":
            return [`    domain(suffix: ${arg1}) -> ${honkTarget}`];
        case "RULE-SET":
            return translateRuleSet(arg1, honkTarget, inlinedRuleSets);
        // IP-CIDR 目前只用于 Tailscale 定向分流；honk 无对应 outbound，整体忽略。
        case "IP-CIDR":
            return [];
        default:
            return [];
    }
}

/**
 * 生成 honk `routing {}` 段（不含首尾大括号）。
 *
 * 复用 Clash 侧的 `buildRules()` 结果，保证 include/exclude/adblock/quic 参数的
 * 裁剪语义与 `yamls/` 完全一致（Fork 特性同步）。
 */
export function buildHonkRoutingLines(
    ctx: HonkBuildContext,
    inlinedRuleSets: InlineRuleSetMap
): string[] {
    const rules = buildRules({
        quicEnabled: ctx.flags.quicEnabled,
        hasTailscale: ctx.nodes.hasTailscale,
        includedRules: ctx.flags.includedRules,
        excludedRules: ctx.flags.excludedRules,
        adblockSource: ctx.flags.adblockSource,
    });

    const lines: string[] = [];
    for (const rule of rules) {
        lines.push(...translateRule(rule, inlinedRuleSets));
    }
    return lines;
}
