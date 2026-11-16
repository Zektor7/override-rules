/**
 * 生成 honk `group {}` 段落。
 *
 * honk 组的核心字段（见 `doc/zh/reference/groups.md`）：`policy` / `filter` /
 * `default` / `final` / `check_url` / `tolerance` / `idle_timeout` /
 * `interrupt_connections` / `icon`。Clash 侧的候选列表（引用其他组）在 honk
 * 里靠 `filter: group(...)` 表达，但本项目 Select/Auto/Fallback/Final 直接
 * 以 `!name(regex: '<utility 关键词>')` 覆盖全订阅（等价语义，避免与
 * 未生成的 Other 兜底组耦合）。
 *
 * 落地/前置/Tailscale/AdBlock/SogouInput 等 Clash 概念在 honk 没有对应：
 * - 落地/前置/Tailscale：跳过（`HONK_GROUP_NAMES` 对应值为 `null`）；
 * - AdBlock/SogouInput：不建组，路由规则直接指向 `block` / `direct`。
 */

import { honkCountryName, requireHonkName, toHonkName } from "../../catalog/honk-groups";
import { countriesMeta } from "../../catalog/countries";
import { PROXY_GROUPS } from "../../catalog/group-names";
import { ICONS } from "../../catalog/icons";
import { serviceGroups } from "../../catalog/service-groups";
import { ALL_NODES_FILTER, countryFilter, lowCostFilter, preferFilter } from "./filter";
import type { HonkBuildContext, HonkGroupSpec } from "../../types/honk";

/** `PROXY_GROUPS` 键到 `ICONS` 键的显式映射，避免依赖大小写转换。 */
const ICON_BY_PROXY_KEY: Partial<Record<keyof typeof PROXY_GROUPS, string>> = {
    SELECT: ICONS.select,
    AUTO: ICONS.auto,
    FALLBACK: ICONS.fallback,
    LOW_COST: ICONS.lowCost,
    STATIC_RESOURCES: ICONS.staticResources,
    AI_SERVICE: ICONS.aiService,
    CRYPTO: ICONS.crypto,
    FINANCE: ICONS.finance,
    APPLE: ICONS.apple,
    GOOGLE: ICONS.google,
    MICROSOFT: ICONS.microsoft,
    BILIBILI: ICONS.bilibili,
    BAHAMUT: ICONS.bahamut,
    XBOX: ICONS.xbox,
    GITHUB: ICONS.github,
    YOUTUBE: ICONS.youtube,
    NETFLIX: ICONS.netflix,
    TIKTOK: ICONS.tiktok,
    SPOTIFY: ICONS.spotify,
    EHENTAI: ICONS.ehentai,
    TELEGRAM: ICONS.telegram,
    TRUTH_SOCIAL: ICONS.truthSocial,
    TWITTER: ICONS.twitter,
    TWITCH: ICONS.twitch,
    WEIBO: ICONS.weibo,
    PIKPAK: ICONS.pikpak,
    PT_SITE: ICONS.ptSite,
    FINAL: ICONS.final,
    PREFER: ICONS.prefer,
};

/** 通过 PROXY_GROUPS 键拿到 icon；未登记时返回 undefined 让渲染层省略。 */
function iconOf(key: keyof typeof PROXY_GROUPS): string | undefined {
    return ICON_BY_PROXY_KEY[key];
}

/**
 * 单个 honk 组的字段渲染。
 *
 * 顺序：filter → policy → default → final → icon → tolerance → idle_timeout →
 * check_url → interrupt_connections。honk 不关心 key 顺序，但固定顺序能让
 * 每次生成的产物 diff 最小化。
 */
function renderGroup(spec: HonkGroupSpec): string[] {
    const lines = [`    ${spec.name} {`];
    if (spec.filter) lines.push(`        filter: ${spec.filter}`);
    lines.push(`        policy: ${spec.policy}`);
    if (spec.defaultValue) lines.push(`        default: '${spec.defaultValue}'`);
    if (spec.final) lines.push(`        final: ${spec.final}`);
    if (spec.icon) lines.push(`        icon: '${spec.icon}'`);
    if (typeof spec.tolerance === "number") lines.push(`        tolerance: ${spec.tolerance}`);
    if (typeof spec.idleTimeout === "number")
        lines.push(`        idle_timeout: ${spec.idleTimeout}`);
    if (spec.checkUrl) lines.push(`        check_url: '${spec.checkUrl}'`);
    if (spec.interruptConnections) lines.push(`        interrupt_connections: true`);
    lines.push(`    }`);
    return lines;
}

/**
 * 组装完整的 honk 组声明（未加 `group {` 外壳）。
 *
 * 顺序：Prefer（若启用）→ 三大主选择器 → 服务组 → 地区组 → LowCost → Final。
 * 与 Clash 侧的顺序基本对齐，方便人工比对；honk 本身不在意组声明顺序。
 */
export function buildHonkGroupSpecs(ctx: HonkBuildContext): HonkGroupSpec[] {
    const { flags, opts, nodes } = ctx;
    const policy = opts.policy;
    // 只有走自动选择的组才需要 URLTest 调优字段；Selector / Fallback 加了 honk
    // 会打 warning 或直接忽略，保守起见只在 policy != "select" 时输出。
    // interrupt_connections 受 `#interrupt=true` 控制；false 时不写，让 Select/Final 自身的
    // 硬编码 true 保持默认（避免 spread 时用 undefined 覆盖）。
    const tuneExtras: Partial<HonkGroupSpec> =
        policy === "select" || policy === "selector" || policy === "fixed"
            ? {}
            : {
                  tolerance: opts.tolerance ?? undefined,
                  idleTimeout: opts.idleTimeout ?? undefined,
                  checkUrl: opts.checkUrl ?? undefined,
                  ...(opts.interruptConnections ? { interruptConnections: true } : {}),
              };
    const specs: HonkGroupSpec[] = [];

    // Prefer（本 Fork 新增）：命中 prefer 时置于首位，不可用时回退到 Auto。
    const prefer = preferFilter(flags.preferPatterns);
    if (prefer) {
        specs.push({
            name: requireHonkName("PREFER"),
            filter: prefer,
            policy: "fallback",
            final: requireHonkName("AUTO"),
            icon: iconOf("PREFER"),
        });
    }

    // 主选择器：Select 手动、Auto 走 opts.policy、Fallback 走首个存活。
    specs.push({
        name: requireHonkName("SELECT"),
        filter: ALL_NODES_FILTER,
        policy: "select",
        icon: iconOf("SELECT"),
        interruptConnections: true,
    });
    specs.push({
        name: requireHonkName("AUTO"),
        filter: ALL_NODES_FILTER,
        policy,
        icon: iconOf("AUTO"),
        ...tuneExtras,
    });
    specs.push({
        name: requireHonkName("FALLBACK"),
        filter: ALL_NODES_FILTER,
        policy: "fallback",
        icon: iconOf("FALLBACK"),
    });

    // 服务组：沿用 serviceGroups 目录，逐个转成 ASCII 组名；
    // 未映射的（当前只有 SogouInput/AdBlock 被主动置为 null）跳过建组，
    // 由 `builders/honk/rules.ts` 把命中的规则直接路由到 `block` / `direct`。
    for (const svc of serviceGroups) {
        const honkName = toHonkName(svc.name);
        if (!honkName) continue;
        // 服务组默认走 opts.policy（score）——Doona 面板上依然可以手动固定成员，
        // Score 策略会持续基于业务观测挑选最佳节点，比 `select` 更贴用户预期。
        specs.push({
            name: honkName,
            filter: ALL_NODES_FILTER,
            policy,
            icon: svc.icon,
            ...tuneExtras,
        });
    }

    // 地区组：按 `regionLayout.groupedCountries` 顺序，展平模式下这里为空、
    // 由 Select/Auto/Fallback 直接兜住全部非落地节点。groupedCountries 一定属于
    // `countriesMeta` 的键（`analyzeNodes` 保证），因此 `countriesMeta[country]` 不会 undefined。
    for (const country of nodes.regionLayout.groupedCountries) {
        specs.push({
            name: honkCountryName(country),
            filter: countryFilter(country),
            policy,
            icon: countriesMeta[country].icon,
            ...tuneExtras,
        });
    }

    // LowCost：无论订阅是否命中低倍率节点都建组（对齐 `yamls/` 的 regex=true 模式），
    // 避免静态产物因假节点集合过窄而缺失该组。
    specs.push({
        name: requireHonkName("LOW_COST"),
        filter: lowCostFilter(),
        policy,
        icon: iconOf("LOW_COST"),
        ...tuneExtras,
    });

    // Final：honk 侧兜底，跟随 opts.policy（默认 score），面板与 CLI 都按它兜底。
    specs.push({
        name: requireHonkName("FINAL"),
        filter: ALL_NODES_FILTER,
        policy,
        icon: iconOf("FINAL"),
        interruptConnections: true,
        ...tuneExtras,
    });

    return specs;
}

/** 渲染 `group {}` 段（含首尾大括号）为字符串数组，便于上层按行拼接。 */
export function buildHonkGroups(ctx: HonkBuildContext): string[] {
    const lines = ["group {"];
    for (const spec of buildHonkGroupSpecs(ctx)) {
        lines.push(...renderGroup(spec));
    }
    lines.push("}");
    return lines;
}
