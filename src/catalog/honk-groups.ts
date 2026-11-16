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

import { countriesMeta } from "./countries";
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
    // honk 的 Select 组直接承担「手动选一个节点」的能力，不再需要「手动选择」变体。
    MANUAL: null,
    AUTO: "Auto",
    FALLBACK: "Fallback",
    // honk 没有 dialer-proxy 链式代理，落地/前置组无对应。
    LANDING: null,
    FRONT_PROXY: null,
    LOW_COST: "LowCost",
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
 * 中文地区名 → honk 组英文名，优先 ISO 3166 alpha-2；未收录时回退到去非 ASCII 后的字符串。
 *
 * 与 `countriesMeta` 独立维护，避免展示层的地区重命名牵动 honk 组名稳定性。
 */
const HONK_COUNTRY_CODES: Readonly<Record<string, string>> = {
    香港: "HK",
    澳门: "MO",
    台湾: "TW",
    新加坡: "SG",
    日本: "JP",
    韩国: "KR",
    美国: "US",
    加拿大: "CA",
    英国: "UK",
    澳大利亚: "AU",
    德国: "DE",
    法国: "FR",
    俄罗斯: "RU",
    泰国: "TH",
    印度: "IN",
    马来西亚: "MY",
    阿根廷: "AR",
    芬兰: "FI",
    埃及: "EG",
    菲律宾: "PH",
    土耳其: "TR",
    乌克兰: "UA",
};

/**
 * 将中文地区名映射为 honk 允许的 ASCII 组名。
 *
 * 未收录时回退到「去除非 ASCII 字符」的兜底逻辑；若结果为空则用 `Region` 占位，
 * 保证任何新增地区都不会阻塞构建。真正的完整性检查交给 `assertHonkCountryMappings()`
 * 在测试里跑，避免生产路径抛错。
 * @param country - 中文地区名（`countriesMeta` 的键）
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
 * `grouptype` → honk 组 policy。
 *
 * - 0（select 手动）→ `select`；
 * - 1（url-test 自动测速）→ `min_moving_avg`（对齐 dae/honk 的滚动延迟最低策略）；
 * - 2（load-balance）→ `loadbalance`。
 */
export const HONK_POLICIES: Record<GroupType, "select" | "min_moving_avg" | "loadbalance"> = {
    0: "select",
    1: "min_moving_avg",
    2: "loadbalance",
};
