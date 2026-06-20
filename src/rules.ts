import { PROXY_GROUPS } from "./constants";

const baseRules = [
    `DST-PORT,22,${PROXY_GROUPS.SSH}`,
    `GEOIP,private,DIRECT,no-resolve`,
    `RULE-SET,ADBlock,${PROXY_GROUPS.AD_BLOCK}`,
    `RULE-SET,AdditionalFilter,${PROXY_GROUPS.AD_BLOCK}`,
    `RULE-SET,SogouInput,${PROXY_GROUPS.SOGOU_INPUT}`,
    `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
    `RULE-SET,StaticResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
    `RULE-SET,CDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
    `RULE-SET,AdditionalCDNResources,${PROXY_GROUPS.STATIC_RESOURCES}`,
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
    `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
    `RULE-SET,Weibo,${PROXY_GROUPS.WEIBO}`,
    `RULE-SET,EHentai,${PROXY_GROUPS.EHENTAI}`,
    `RULE-SET,TikTok,${PROXY_GROUPS.TIKTOK}`,
    `RULE-SET,SteamFix,DIRECT`,
    `RULE-SET,GoogleFCM,DIRECT`,
    `GEOSITE,google-play@cn,DIRECT`,
    `GEOSITE,microsoft@cn,DIRECT`,
    `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
    `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
    `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
    `RULE-SET,Crypto,${PROXY_GROUPS.CRYPTO}`,
    `RULE-SET,GFWList,${PROXY_GROUPS.SELECT}`,
    `GEOIP,cn,DIRECT`,
    `MATCH,${PROXY_GROUPS.FINAL}`,
];

/**
 * 提取规则名称标识符（用于过滤）
 * 从规则字符串中提取可用于 include/exclude 的标识
 */
function extractRuleIdentifiers(rule: string): string[] {
    const identifiers: string[] = [];

    // 从 RULE-SET 提取规则集名称
    const ruleSetMatch = rule.match(/RULE-SET,(\w+)/);
    if (ruleSetMatch) {
        identifiers.push(ruleSetMatch[1]);
    }

    // 从 GEOSITE 提取地区标识
    const geositeMatch = rule.match(/GEOSITE,([\w\-@!]+)/);
    if (geositeMatch) {
        identifiers.push(geositeMatch[1]);
    }

    // 从 GEOIP 提取 IP 标识
    const geoipMatch = rule.match(/GEOIP,(\w+)/);
    if (geoipMatch) {
        identifiers.push(geoipMatch[1]);
    }

    // 从 DOMAIN-SUFFIX 提取域名
    const domainMatch = rule.match(/DOMAIN-SUFFIX,([\w.]+)/);
    if (domainMatch) {
        identifiers.push(domainMatch[1]);
    }

    return identifiers;
}

/**
 * 检查规则是否应被保留
 */
function shouldKeepRule(
    rule: string,
    includedRules: Set<string> | null,
    excludedRules: Set<string>
): boolean {
    // 始终保留基础规则
    if (
        rule.includes("DST-PORT,22") ||
        rule.includes("GEOIP,private") ||
        rule.includes("GEOIP,cn") ||
        rule.includes("MATCH")
    ) {
        return true;
    }

    const identifiers = extractRuleIdentifiers(rule);

    // 如果指定了包含列表，只保留在列表中的规则
    if (includedRules !== null) {
        return identifiers.some((id) => includedRules.has(id.toLowerCase()));
    }

    // 否则排除指定的规则
    return !identifiers.some((id) => excludedRules.has(id.toLowerCase()));
}

/**
 * 构建最终的规则列表。
 *
 * @param {Object} params - 构建参数
 * @param {boolean} params.quicEnabled - 是否启用 QUIC（如未启用会插入 UDP:443 拦截规则）
 * @param {Set<string> | null} params.includedRules - 包含的规则集合（null 表示不使用包含列表）
 * @param {Set<string>} params.excludedRules - 排除的规则集合
 * @returns {string[]} 规则字符串数组
 */
export function buildRules({
    quicEnabled,
    includedRules,
    excludedRules,
}: {
    quicEnabled: boolean;
    includedRules: Set<string> | null;
    excludedRules: Set<string>;
}): string[] {
    const ruleList = baseRules.filter((rule) => shouldKeepRule(rule, includedRules, excludedRules));

    if (!quicEnabled) {
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}

/**
 * 从过滤后的规则列表中，提取所有被引用的代理组名称。
 * 用于联动过滤 proxy-groups：仅保留至少有一条规则指向的代理组。
 * @param rules - 经过 include/exclude 过滤后的最终规则列表
 * @returns 被规则引用的代理组名称集合
 */
export function getActiveProxyGroupNames(rules: string[]): Set<string> {
    const names = new Set<string>();
    for (const rule of rules) {
        const parts = rule.split(",");
        // 规则的最后一个有效字段（排除 no-resolve 标记）即为代理组名称
        const target =
            parts[parts.length - 1] === "no-resolve"
                ? parts[parts.length - 2]
                : parts[parts.length - 1];
        if (target && target !== "DIRECT" && target !== "REJECT" && target !== "REJECT-DROP") {
            names.add(target);
        }
    }
    return names;
}
