/**
 * 分流规则
 *
 * 规则中引用的规则集名称通过 `ruleSet()` 生成，受 `RuleSetKey` 类型约束，
 * 不会出现引用未注册规则集的静默错误。
 */

import { PROXY_GROUPS } from "../catalog/group-names";
import { ruleSet } from "../catalog/rule-sets";
import { shouldKeepRule } from "./rule-filter";
import { isNotNull } from "../utils/primitives";
import { ARG_DEFAULTS } from "../args/schema";
import type { AdblockSource } from "../types/args";

export interface BuildRulesInput {
    quicEnabled: boolean;
    hasTailscale: boolean;
    /** 仅保留这些规则标识（本 Fork 新增）；为 `null` 时不启用白名单。 */
    includedRules?: Set<string> | null;
    /** 需要排除的规则标识（本 Fork 新增）。 */
    excludedRules?: Set<string>;
    adblockSource?: AdblockSource;
}

/**
 * 构建最终的规则列表。
 * @param input.quicEnabled - 是否允许 QUIC（未启用时插入 UDP:443 拦截规则）
 * @param input.hasTailscale - 是否存在 Tailscale 节点（决定是否生成 Tailscale 分流规则）
 * @param input.includedRules - 详见 `BuildRulesInput`，本 Fork 的 `include` 参数
 * @param input.excludedRules - 详见 `BuildRulesInput`，本 Fork 的 `exclude` 参数
 * @param input.adblockSource - 去广告规则来源（0=关闭，1=adrules.top，2=217heidai，3=AWAvenue）
 */
export function buildRules({
    quicEnabled,
    hasTailscale,
    includedRules = null,
    excludedRules = new Set<string>(),
    adblockSource = ARG_DEFAULTS.adblockSource,
}: BuildRulesInput): string[] {
    // 基础与分流规则：受 include/exclude 参数裁剪
    const serviceRules = [
        `GEOIP,private,DIRECT,no-resolve`,
        adblockSource > 0 ? ruleSet("ADBlock", PROXY_GROUPS.AD_BLOCK) : null,
        adblockSource > 0 ? ruleSet("AdditionalFilter", PROXY_GROUPS.AD_BLOCK) : null,
        ruleSet("SogouInput", PROXY_GROUPS.SOGOU_INPUT),
        `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
        ruleSet("StaticResources", PROXY_GROUPS.STATIC_RESOURCES),
        ruleSet("CDNResources", PROXY_GROUPS.STATIC_RESOURCES),
        ruleSet("AdditionalCDNResources", PROXY_GROUPS.STATIC_RESOURCES),
        `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
        `GEOSITE,category-finance,${PROXY_GROUPS.FINANCE}`,
        `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
        `GEOSITE,bilibili,${PROXY_GROUPS.BILIBILI}`,
        `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
        `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
        `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
        `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
        `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
        `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
        `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
        `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
        `GEOSITE,spotify,${PROXY_GROUPS.SPOTIFY}`,
        `GEOSITE,bahamut,${PROXY_GROUPS.BAHAMUT}`,
        `GEOSITE,pikpak,${PROXY_GROUPS.PIKPAK}`,
        ruleSet("PT", PROXY_GROUPS.PT_SITE),
        `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
        ruleSet("Weibo", PROXY_GROUPS.WEIBO),
        ruleSet("EHentai", PROXY_GROUPS.EHENTAI),
        ruleSet("TikTok", PROXY_GROUPS.TIKTOK),
        ruleSet("SteamFix", "DIRECT"),
        `GEOSITE,google-play@cn,DIRECT`,
        `GEOSITE,microsoft@cn,DIRECT`,
        `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
        `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
        `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
        ruleSet("GFWList", PROXY_GROUPS.SELECT),
        `GEOIP,cn,DIRECT`,
        `MATCH,${PROXY_GROUPS.FINAL}`,
    ].filter((rule) => rule !== null && shouldKeepRule(rule, includedRules, excludedRules));

    // 拦截与定向分流规则不参与裁剪，始终置于列表前部
    return [
        !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
        hasTailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        hasTailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
        hasTailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
        ...serviceRules,
    ].filter(isNotNull);
}
