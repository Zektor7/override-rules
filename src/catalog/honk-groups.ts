/**
 * honk 输出专用的组名/策略映射。
 *
 * honk 组名只允许 `[A-Za-z0-9]`（参见 kenzok8/ruleset 的 honk 说明），
 * 并且不存在「链式代理 / 全局组 / Tailscale outbound」等概念。这里把
 * Clash 侧的展示名一次性映射到 honk 的 ASCII 名或 `null`（无对应概念，生成时跳过）。
 *
 * 该文件属于 honk 输出的「数据层」，与 `catalog/group-names.ts` 独立，
 * 避免污染上游 Clash 分支的常量与同步节奏。
 */

import { COUNTRY_KEYS, countriesMeta } from "./countries";
import { HONK_COUNTRY_CODES } from "./honk-countries";
import { PROXY_GROUPS } from "./group-names";
import type { GroupType } from "../types/args";

/**
 * 由 `PROXY_GROUPS` 的每个键指向 honk 侧的组名；值为 `null` 表示 honk 无对应概念，
 * 生成器遇到时应跳过对应的组与相关规则。
 *
 * 未列出的键会导致编译期报错，从而在 `PROXY_GROUPS` 新增时强制补齐 honk 映射。
 */
export const HONK_GROUP_NAMES: Record<keyof typeof PROXY_GROUPS, string | null> = {
    SELECT: "Select",
    // 「手动选择」保留：它是唯一持有全部节点名的组，Auto / Fallback / Select /
    // Final / 服务组都只引用它与地区组（与 mihomo 侧的层级一致）。
    MANUAL: "Manual",
    AUTO: "Auto",
    // honk 侧不生成「故障转移」组：Auto 已经按地区组给出自动选路，
    // 再叠一层同候选的 fallback 组只是重复面板入口。
    FALLBACK: null,
    // honk 没有 dialer-proxy 链式代理，落地/前置组无对应。
    LANDING: null,
    FRONT_PROXY: null,
    // honk 侧不生成「低倍率节点」组：低倍率只是节点的一个属性，单独建组并
    // 挂进每个服务组会让面板多出一堆重复入口，实际选路由地区组与手动选择承担。
    LOW_COST: null,
    STATIC_RESOURCES: "StaticResources",
    AI_SERVICE: "AI",
    CRYPTO: "Crypto",
    FINANCE: "Finance",
    APPLE: "Apple",
    GOOGLE: "Google",
    MICROSOFT: "Microsoft",
    BILIBILI: "Bilibili",
    BAHAMUT: "Bahamut",
    XBOX: "Xbox",
    // honk 没有 tailscale outbound；相关分流规则与组都不生成。
    TAILSCALE: null,
    GITHUB: "Github",
    YOUTUBE: "Youtube",
    NETFLIX: "Netflix",
    TIKTOK: "TikTok",
    SPOTIFY: "Spotify",
    EHENTAI: "EHentai",
    TELEGRAM: "Telegram",
    TRUTH_SOCIAL: "TruthSocial",
    TWITTER: "Twitter",
    TWITCH: "Twitch",
    WEIBO: "Weibo",
    PIKPAK: "PikPak",
    PT_SITE: "PT",
    // honk 无 rule-provider，SogouInput 在路由里直接命中 `-> direct`，不建组。
    SOGOU_INPUT: null,
    // AdBlock 同理，在路由里直接命中 `-> block`，不建组；
    // 保留组会与 honk 生态习惯（kenzok8 / qichiyuhub）相背离，且 `final: block` 在 Select
    // 策略下不会自动生效。
    AD_BLOCK: null,
    // honk 没有 GLOBAL 汇总组，由 Final 承担兜底。
    GLOBAL: null,
    FINAL: "Final",
    PREFER: "Prefer",
};

/**
 * Clash 组显示名 → honk 组名。未收录或对应 honk 概念缺失时返回 `null`。
 *
 * 通过反向查找保证与 `PROXY_GROUPS` 常量单一来源；新增 Clash 组后
 * 只需在 `HONK_GROUP_NAMES` 补一条，翻译层自动生效。
 * @param clashName - Clash 侧的组显示名，例如「选择代理」
 */
export function toHonkName(clashName: string): string | null {
    const entries = Object.entries(HONK_GROUP_NAMES) as [
        keyof typeof PROXY_GROUPS,
        string | null,
    ][];
    for (const [key, honkName] of entries) {
        if (PROXY_GROUPS[key] === clashName) return honkName;
    }
    return null;
}

/**
 * 取得 `key` 对应的 honk 组名；当该键在 honk 里无对应概念（`null`）时抛错。
 *
 * 只应在构建路径明确知道该键一定存在 honk 等价物时调用（例如 Select/Auto/Final），
 * 用异常替代 TypeScript 的非空断言，同时保留 CI 之外的可诊断失败。
 */
export function requireHonkName(key: keyof typeof PROXY_GROUPS): string {
    const name = HONK_GROUP_NAMES[key];
    if (name === null) {
        throw new Error(`honk 组名未映射（honk 无对应概念）: ${key}`);
    }
    return name;
}

/**
 * 将中文地区名映射为 honk 允许的 ASCII 组名。
 *
 * 映射表见 `catalog/honk-countries.ts`（取自上游重命名脚本的国家名清单）。
 * 未收录时回退到「去除非 ASCII 字符」的兜底逻辑；若结果为空则用 `Region` 占位，
 * 保证任何新增地区都不会阻塞构建。真正的完整性检查交给 `assertHonkCountryMappings()`
 * 在测试里跑，避免生产路径抛错。
 * @param country - 中文地区名
 */
export function honkCountryName(country: string): string {
    if (Object.hasOwn(HONK_COUNTRY_CODES, country)) {
        return HONK_COUNTRY_CODES[country];
    }
    const ascii = country.replace(/[^A-Za-z0-9]/g, "");
    return ascii.length > 0 ? ascii : "Region";
}

/**
 * 断言 `countriesMeta` 的每个地区都在 `HONK_COUNTRY_CODES` 中有映射。
 *
 * 供测试调用；生产路径通过 `honkCountryName` 的兜底保持稳健，
 * 避免遗漏新地区时让 CI 之外的用户拿到半成品配置。
 */
export function assertHonkCountryMappings(): void {
    const missing = Object.keys(countriesMeta).filter(
        (country) => !Object.hasOwn(HONK_COUNTRY_CODES, country)
    );
    if (missing.length > 0) {
        throw new Error(`honk 地区名映射缺失: ${missing.join(", ")}`);
    }
}

/**
 * honk 侧服务组的候选组（嵌套组 tag + 直连选项）。
 *
 * mihomo 侧服务组的候选是「其它代理组」（选择代理 / 地区组 / 低倍率 / 手动选择 /
 * 直连），honk 没有候选列表概念，只能用 `filter: group('tag', …)` 表达嵌套引用、
 * 用 `filter: name(direct)` 把直连收进候选。少数服务有特殊偏好（哔哩哔哩偏台港、
 * 巴哈姆特偏台湾、TruthSocial 偏美国），这里按 mihomo 侧的候选语义翻译。
 */
export interface HonkServiceCandidates {
    /** 嵌套组 tag 列表；书写顺序即 honk 侧的成员顺序。 */
    tags: string[];
    /** 是否把直连（`name(direct)`）也作为候选。 */
    includeDirect: boolean;
    /** 初始/回退成员 tag（对应 mihomo 侧候选列表的第一个）。 */
    defaultTag: string;
}

/**
 * 计算某个服务组在 honk 侧的候选嵌套组。
 * @param serviceName - Clash 侧的服务组显示名（`PROXY_GROUPS` 的值）
 * @param regionTags - 中文地区名 → honk 地区组 tag 的映射
 * @param baseTags - 通用候选：选择代理 + 各地地区组 + 低倍率 + 手动选择
 */
export function honkServiceCandidates(
    serviceName: string,
    regionTags: ReadonlyMap<string, string>,
    baseTags: readonly string[]
): HonkServiceCandidates {
    const selectTag = HONK_GROUP_NAMES.SELECT as string;
    const manualTag = HONK_GROUP_NAMES.MANUAL as string;
    const tagOf = (country: string): string | undefined => regionTags.get(country);
    /** 去重且保持顺序：honk 的嵌套 tag 重复会被去重，这里提前收敛避免产物里出现重复项。 */
    const unique = (tags: readonly string[]): string[] => [...new Set(tags)];

    switch (serviceName) {
        case PROXY_GROUPS.BILIBILI: {
            const taiwan = tagOf(COUNTRY_KEYS.taiwan);
            const hongKong = tagOf(COUNTRY_KEYS.hongKong);
            return taiwan && hongKong
                ? { tags: unique([taiwan, hongKong]), includeDirect: true, defaultTag: "direct" }
                : { tags: unique(baseTags), includeDirect: true, defaultTag: "direct" };
        }
        case PROXY_GROUPS.BAHAMUT: {
            const taiwan = tagOf(COUNTRY_KEYS.taiwan);
            return taiwan
                ? {
                      tags: unique([taiwan, selectTag, manualTag]),
                      includeDirect: true,
                      defaultTag: taiwan,
                  }
                : { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
        }
        case PROXY_GROUPS.TRUTH_SOCIAL: {
            const unitedStates = tagOf(COUNTRY_KEYS.unitedStates);
            return unitedStates
                ? {
                      tags: unique([unitedStates, selectTag, manualTag]),
                      includeDirect: false,
                      defaultTag: unitedStates,
                  }
                : { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
        }
        case PROXY_GROUPS.FINANCE:
        case PROXY_GROUPS.MICROSOFT:
        case PROXY_GROUPS.WEIBO:
        case PROXY_GROUPS.PT_SITE:
            // 这些服务在 mihomo 侧是「直连优先」（候选列表以 DIRECT 开头）。
            return { tags: unique(baseTags), includeDirect: true, defaultTag: "direct" };
        default:
            return { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
    }
}

/**
 * `grouptype` → honk 组 policy 的默认映射（仅供向后兼容）。
 *
 * - 0（select 手动）→ `select`；
 * - 1（自动选）→ `score`（honk 侧推荐默认，基于实际可靠性与有界验证选成员，
 *   比 dae 时代的 `min_moving_avg` 更贴近“自动”预期）；
 * - 2（load-balance）→ `loadbalance`。
 *
 * 用户如果显式传 `#policy=<value>`，会覆盖本映射（见 `buildHonkRuntimeOptions`）。
 */
export const HONK_POLICIES: Record<GroupType, "select" | "score" | "loadbalance"> = {
    0: "select",
    1: "score",
    2: "loadbalance",
};

/**
 * honk 支持的 policy 白名单（见 `doc/zh/reference/groups.md#策略`）。
 *
 * 保留 dae 侧的兼容写法（`urltest` / `min_moving_avg` / `min_avg10` / `min_last_delay`
 * / `roundrobin` / `round_robin` / `balance` / `fixed(N)`）方便从 dae 手册直接搬。
 * `buildHonkRuntimeOptions` 对非法值回退到 `HONK_POLICIES[grouptype]`。
 */
export const HONK_POLICY_VALUES: readonly string[] = [
    "select",
    "selector",
    "fixed",
    "urltest",
    "min_moving_avg",
    "min_avg10",
    "min_last_delay",
    "loadbalance",
    "roundrobin",
    "round_robin",
    "balance",
    "fallback",
    "score",
] as const;

/** 判断传入的 policy 字符串是否是 honk 支持的值（大小写不敏感，支持 fixed(N) 写法）。 */
export function isHonkPolicy(raw: string | undefined | null): boolean {
    if (!raw) return false;
    const trimmed = raw.trim().toLowerCase();
    if (HONK_POLICY_VALUES.includes(trimmed)) return true;
    // fixed(N)：手动固定到第 N 个成员，honk 解析器会剥括号后缀。不用正则避免 sonarjs
    // 对 `\([^)]*\)$` 启发式报“super-linear”告警。
    if (!trimmed.startsWith("fixed(") || !trimmed.endsWith(")")) return false;
    const inner = trimmed.slice(6, -1);
    return inner.length > 0 && [...inner].every((ch) => ch >= "0" && ch <= "9");
}
