/**
 * 生成 honk `group {}` 段落。
 *
 * honk 的组没有「候选列表」概念，成员只能靠 `filter` 表达式命中：
 * - `filter: name(regex: '…')` —— 按节点名筛（地区组、未分类组）；
 * - `filter: group('Select', 'HK', …)` —— 嵌套引用其它组（服务组）；
 * - 同一行内用 `&&` 连接谓词，不同 `filter:` 行之间是「或」关系。
 *
 * 因此 mihomo 侧「服务组 = [选择代理, 地区组, 低倍率]」这类候选列表，在 honk 侧
 * 必须翻译成 `group(...)` 嵌套引用；否则每个组都会退化成同一张全量候选池，
 * 分流就失去意义。嵌套组各自贡献「当前策略选出的那个叶节点」，与 mihomo 侧
 * 「在服务组里挑一个地区组」的行为一致。
 *
 * 组声明顺序：地区组 → 未分类组 → Auto → Manual → Prefer → Select → 服务组 → Final。
 * 被嵌套引用的组都排在引用方之前，避免前向引用（honk 会拒收未知嵌套 tag）。
 *
 * 落地/前置/Tailscale/AdBlock/SogouInput 等 Clash 概念在 honk 没有对应：
 * - 落地/前置/Tailscale：跳过（`HONK_GROUP_NAMES` 对应值为 `null`）；
 * - AdBlock/SogouInput：不建组，路由规则直接指向 `block` / `direct`。
 */

import { honkServiceCandidates, requireHonkName, toHonkName } from "../../catalog/honk-groups";
import { countriesMeta } from "../../catalog/countries";
import type { CountryMeta } from "../../types/proxy";
import { HONK_COUNTRIES } from "../../catalog/honk-countries";
import { PROXY_GROUPS } from "../../catalog/group-names";
import { ICONS } from "../../catalog/icons";
import { serviceGroups } from "../../catalog/service-groups";
import { classifyHonkRegions } from "../../analysis/honk-regions";
import { getActiveProxyGroupNames } from "../rule-filter";
import {
    ALL_NODES_FILTER,
    DIRECT_FILTER,
    countryFilter,
    groupFilter,
    isUtilityNode,
    preferFilter,
    unclassifiedFilter,
} from "./filter";
import type { HonkBuildContext, HonkGroupSpec } from "../../types/honk";
import type { NodeAnalysis, ProxyNode } from "../../types/proxy";

/** `PROXY_GROUPS` 键到 `ICONS` 键的显式映射，避免依赖大小写转换。 */
const ICON_BY_PROXY_KEY: Partial<Record<keyof typeof PROXY_GROUPS, string>> = {
    SELECT: ICONS.select,
    MANUAL: ICONS.manual,
    AUTO: ICONS.auto,
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

/** 地区组的中间表示：中文地区名 → honk 组名。 */
interface RegionGroup {
    /** 中文地区名（`countriesMeta` 的键）。 */
    country: string;
    /** honk 组名（如 `HK`）。 */
    tag: string;
    /** 地区组图标。 */
    icon: string;
}

/**
 * 收集地区组。
 *
 * 与 mihomo 侧的区别：honk 的地区组靠 `filter: name(regex: …)` 命中节点，
 * 建组的边际成本为零，因此**只要该地区有节点就建组**——不再受 `threshold`
 * （地区节点数下限）与「至少两个地区才分组」这两条展平规则约束。
 * 否则订阅里每个地区只有一两个节点时，honk 会一个地区组都不给，用户没法按地区挑。
 */
/**
 * 收集 honk 侧的地区组。
 *
 * 与 mihomo 侧不同：honk 侧按**中文国名**归类（节点名已由上游重命名脚本规范化），
 * 并且覆盖 `catalog/honk-countries.ts` 里的全部国家/地区——「阿联酋」「巴西」这类
 * 节点不会因为 Clash 侧只收录 24 个地区而落进未分类组。
 * 地区组**只要有节点就建组**，不受 `threshold` 约束。
 */
/**
 * 取 Clash 侧的地区元数据；未收录的地区返回 `undefined`（honk 侧用通用图标）。
 */
function findCountryMeta(country: string): CountryMeta | undefined {
    return Object.hasOwn(countriesMeta, country) ? countriesMeta[country] : undefined;
}

function buildRegionGroups(nodes: NodeAnalysis): RegionGroup[] {
    return classifyHonkRegions(nodes.allNodes).map((region) => {
        // Clash 侧的 countriesMeta 只收录 24 个常用地区，其余地区用通用图标。
        const meta = findCountryMeta(region.names[0]);
        return {
            country: region.names.join("|"),
            tag: region.tag,
            icon: meta?.icon ?? ICONS.global,
        };
    });
}

/**
 * 从最终 Clash 规则里取出「仍被引用」的 honk 组 tag。
 *
 * `include` / `exclude` 会裁掉一批规则，被裁掉的服务组也就没有存在的必要——
 * 与 mihomo 侧 `filterProxyGroupsByRules()` 的裁剪语义保持一致。
 * @param rules - 已经过 include/exclude 过滤的 Clash 规则
 */
export function collectHonkTargets(rules: readonly string[]): Set<string> {
    const targets = new Set<string>();
    for (const name of getActiveProxyGroupNames([...rules])) {
        const tag = toHonkName(name);
        if (tag) targets.add(tag);
    }
    return targets;
}

/**
 * 把组 spec 的 filter 规整成多行数组。
 *
 * honk 里不同的 `filter:` 行之间是「或」关系，同一行内用 `&&` 连接谓词。
 */
function filterLines(spec: HonkGroupSpec): string[] {
    const filter = spec.filter;
    if (filter === undefined) return [];
    if (typeof filter === "string") return [filter];
    return [...filter];
}

/**
 * 单个 honk 组的字段渲染。
 *
 * 顺序：filter → policy → default → final → icon → tolerance → idle_timeout →
 * check_url → interrupt_connections。honk 不关心 key 顺序，但固定顺序能让
 * 每次生成的产物 diff 最小化。多个 filter 各占一行。
 */
function renderGroup(spec: HonkGroupSpec): string[] {
    const lines = [`    ${spec.name} {`];
    for (const filter of filterLines(spec)) {
        lines.push(`        filter: ${filter}`);
    }
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
 * 基础候选层：自动选择 / 故障转移 / 地区组 / 低倍率 / 手动选择。
 *
 * 这一层里只有「手动选择」持有全部节点，其余组要么靠节点名正则命中、要么引用
 * 地区组——与 mihomo 侧「全量节点只出现在手动选择组」的层级一致。
 */
/**
 * 基础候选层：地区组 / 未分类组 / 自动选择 / 手动选择。
 *
 * 这一层里只有「手动选择」持有全部节点，其余组要么靠节点名正则命中、要么引用
 * 别的组——与 mihomo 侧「全量节点只出现在手动选择组」的层级一致。
 *
 * 声明顺序遵循「被嵌套引用的组一定在前面」：地区组与未分类组在「自动选择」之前，
 * 「自动选择」与「手动选择」在「选择代理」之前。
 */
function buildBaseGroupSpecs(
    ctx: HonkBuildContext,
    regionGroups: RegionGroup[],
    unclassified: ProxyNode[],
    tuneExtras: Partial<HonkGroupSpec>
): HonkGroupSpec[] {
    const { opts } = ctx;
    const policy = opts.policy;
    const regionTags = regionGroups.map((r) => r.tag);
    const manualTag = requireHonkName("MANUAL");
    const specs: HonkGroupSpec[] = [];

    // 地区组：按节点名正则命中，每个地区一组。
    for (const region of regionGroups) {
        specs.push({
            name: region.tag,
            filter: countryFilter(region.country),
            policy,
            icon: region.icon,
            ...tuneExtras,
        });
    }

    // 未分类组：不属于任何地区的节点（名字里没有地区关键词，或属于本项目未收录的地区）。
    // 没有它，这些节点只会出现在「手动选择」里，自动选路永远轮不到。
    if (unclassified.length > 0) {
        specs.push({
            name: UNCLASSIFIED_GROUP_NAME,
            filter: unclassifiedFilter(),
            policy,
            icon: ICONS.global,
            ...tuneExtras,
        });
    }

    // 自动选择：候选是各地区组与未分类组，每个组按 opts.policy 选出自己的节点，
    // 本组再在这些节点里挑最优——与 mihomo 侧「自动选择 = [地区组…]」同构。
    const autoCandidates = [
        ...regionTags,
        ...(unclassified.length > 0 ? [UNCLASSIFIED_GROUP_NAME] : []),
    ];
    specs.push({
        name: requireHonkName("AUTO"),
        filter: groupFilter(autoCandidates.length > 0 ? autoCandidates : [manualTag]),
        policy,
        icon: iconOf("AUTO"),
        ...tuneExtras,
    });

    // 手动选择：唯一持有全部节点的组。
    specs.push({
        name: manualTag,
        filter: ALL_NODES_FILTER,
        policy: "select",
        icon: iconOf("MANUAL"),
    });

    return specs;
}

/**
 * 选择代理层：优先选择（可选）+ 选择代理。
 *
 * 选择代理是组选择器——候选为「优先选择 / 自动选择 / 地区 / 未分类 / 手动选择」，
 * 默认停在自动选择（有优先选择时停在优先选择），全部不可用时直连。
 */
function buildSelectGroupSpecs(
    ctx: HonkBuildContext,
    regionTags: string[],
    extraTags: string[],
    prefer: string | null
): HonkGroupSpec[] {
    const specs: HonkGroupSpec[] = [];

    // Prefer（本 Fork 新增）：命中 prefer 时置于首位，不可用时回退到 Auto。
    if (prefer) {
        specs.push({
            name: requireHonkName("PREFER"),
            filter: prefer,
            policy: "fallback",
            final: requireHonkName("AUTO"),
            icon: iconOf("PREFER"),
        });
    }

    const preferTag = requireHonkName("PREFER");
    specs.push({
        name: requireHonkName("SELECT"),
        filter: groupFilter([
            ...(prefer ? [preferTag] : []),
            requireHonkName("AUTO"),
            ...regionTags,
            ...extraTags,
            requireHonkName("MANUAL"),
        ]),
        policy: "select",
        defaultValue: prefer ? preferTag : requireHonkName("AUTO"),
        final: "direct",
        icon: iconOf("SELECT"),
        interruptConnections: true,
    });

    return specs;
}

/**
 * 服务组层：候选为「选择代理 / 地区 / 未分类 / 手动选择 / 直连」。
 *
 * 对齐 mihomo 侧服务组的候选列表语义（可以在服务组里挑地区，而不是所有服务组
 * 共用同一批节点）。`include` / `exclude` 裁掉规则后不再被引用的服务组不生成。
 */
function buildServiceGroupSpecs(
    regionTagByCountry: ReadonlyMap<string, string>,
    regionTags: string[],
    extraTags: string[],
    activeTargets: ReadonlySet<string> | null
): HonkGroupSpec[] {
    const specs: HonkGroupSpec[] = [];
    const serviceBaseTags = [
        requireHonkName("SELECT"),
        ...regionTags,
        ...extraTags,
        requireHonkName("MANUAL"),
    ];

    for (const svc of serviceGroups) {
        const honkName = toHonkName(svc.name);
        if (!honkName) continue;
        if (activeTargets && !activeTargets.has(honkName)) continue;
        const candidates = honkServiceCandidates(svc.name, regionTagByCountry, serviceBaseTags);
        specs.push({
            name: honkName,
            filter: candidates.includeDirect
                ? [groupFilter(candidates.tags), DIRECT_FILTER]
                : groupFilter(candidates.tags),
            policy: "select",
            defaultValue: candidates.defaultTag,
            final: "direct",
            icon: svc.icon,
        });
    }

    return specs;
}

/**
 * 「未分类」组的名称：装那些**不属于任何地区**的节点。
 *
 * 节点名里没有地区关键词（如「IEPL 专线 01」「流媒体 01」），或者命中了某地区的
 * include 正义却又被该地区的 exclude 正则挡下（如「美属波多黎各」），这些节点在
 * 任何地区组里都命中不到——没有这个兜底组，它们就只剩「手动选择」能选到，
 * 自动选路（`Auto`）永远轮不到它们，等于被忽略。
 */
const UNCLASSIFIED_GROUP_NAME = "Other";

/**
 * 判断节点是否被某个地区组覆盖。
 *
 * 判定口径与地区组 filter 完全一致：节点名里含某个已知地区的中文国名。
 */
function isCoveredByRegion(name: string): boolean {
    return HONK_COUNTRIES.some(([country]) => name.includes(country));
}

/**
 * 收集「不属于任何地区」的节点。
 *
 * 排除两类非节点条目：机场元信息（剩余流量 / 官网……）与 Tailscale 节点
 * （honk 没有 tailscale outbound）。
 */
function buildUnclassifiedNodes(nodes: NodeAnalysis): ProxyNode[] {
    const tailscaleNames = new Set(nodes.tailscaleNodes.map((node) => node.name));
    return nodes.allNodes.filter((node) => {
        if (!node.name) return false;
        if (tailscaleNames.has(node.name)) return false;
        if (isUtilityNode(node.name)) return false;
        return !isCoveredByRegion(node.name);
    });
}

/**
 * 组装完整的 honk 组声明（未加 `group {` 外壳）。
 *
 * 层级与 mihomo 侧一一对应：
 * ```
 * <地区>   地区组   —— 按节点名正则命中
 * Other    未分类   —— 不属于任何地区的节点（名字里没有地区关键词等）
 * Auto     自动选择 —— 候选是各地区组与未分类组
 * Manual   手动选择 —— 唯一持有全部节点的组
 * Prefer   优先选择 —— 仅在 prefer 参数命中时生成
 * Select   选择代理 —— 优先选择 / 自动选择 / 地区 / 未分类 / 手动选择
 * <服务组> 服务组   —— 选择代理 / 地区 / 未分类 / 手动选择 / 直连
 * Final    兜底     —— 选择代理 / 地区 / 未分类 / 手动选择 / 直连，默认停在选择代理
 * ```
 * 声明顺序保证被嵌套引用的组一定在前面（honk 对未知嵌套 tag 会直接拒收配置）。
 * @param ctx - honk 构建上下文
 * @param activeTargets - 最终规则里仍被引用的 honk 组 tag；为 `null` 时不裁剪服务组
 */
export function buildHonkGroupSpecs(
    ctx: HonkBuildContext,
    activeTargets: ReadonlySet<string> | null = null
): HonkGroupSpec[] {
    const { flags, opts } = ctx;
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

    const regionGroups = buildRegionGroups(ctx.nodes);
    const regionTagByCountry = new Map(regionGroups.map((r) => [r.country, r.tag]));
    const regionTags = regionGroups.map((r) => r.tag);
    const unclassified = buildUnclassifiedNodes(ctx.nodes);
    const extraTags = unclassified.length > 0 ? [UNCLASSIFIED_GROUP_NAME] : [];
    const prefer = preferFilter(flags.preferPatterns);

    return [
        ...buildBaseGroupSpecs(ctx, regionGroups, unclassified, tuneExtras),
        ...buildSelectGroupSpecs(ctx, regionTags, extraTags, prefer),
        ...buildServiceGroupSpecs(regionTagByCountry, regionTags, extraTags, activeTargets),
        // Final：默认分流策略——选择代理 / 地区 / 未分类 / 手动选择 / 直连，
        // 默认停在直连（其余候选仍在，可手动切走）。
        {
            name: requireHonkName("FINAL"),
            filter: [
                groupFilter([
                    requireHonkName("SELECT"),
                    ...regionTags,
                    ...extraTags,
                    requireHonkName("MANUAL"),
                ]),
                DIRECT_FILTER,
            ],
            policy: "select",
            defaultValue: "direct",
            final: "direct",
            icon: iconOf("FINAL"),
            interruptConnections: true,
        },
    ];
}

/** 渲染 `group {}` 段（含首尾大括号）为字符串数组，便于上层按行拼接。 */
export function buildHonkGroups(
    ctx: HonkBuildContext,
    activeTargets: ReadonlySet<string> | null = null
): string[] {
    const lines = ["group {"];
    for (const spec of buildHonkGroupSpecs(ctx, activeTargets)) {
        lines.push(...renderGroup(spec));
    }
    lines.push("}");
    return lines;
}
