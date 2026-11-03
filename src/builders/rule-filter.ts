/**
 * 规则过滤与联动裁剪（本 Fork 新增，对应 `include` / `exclude` 参数）。
 *
 * 过滤链路：`rules` 先按标识裁剪，再由裁剪后的规则反推「被引用的代理组」与
 * 「被引用的规则集」，从而把未使用的服务代理组和 rule-providers 一并剔除，
 * 减少客户端加载的策略组数量与外部规则集下载量。
 */

import { PROXY_GROUPS, countryGroupName } from "../catalog/group-names";
import type { ProxyGroup } from "../types/proxy";

/** 内置策略动作，不会被当作代理组名称。 */
const BUILT_IN_POLICIES = new Set(["DIRECT", "REJECT", "REJECT-DROP"]);

/**
 * 始终保留的基础设施代理组。
 *
 * 这些组是选路系统正常运作的基石，不与某条具体服务规则一一绑定。
 * 其中 `GLOBAL` 由 `builders/config.ts` 在裁剪之后追加，列入此处仅作保险。
 */
const INFRASTRUCTURE_GROUPS: Set<string> = new Set([
    PROXY_GROUPS.SELECT,
    PROXY_GROUPS.MANUAL,
    PROXY_GROUPS.FRONT_PROXY,
    PROXY_GROUPS.LANDING,
    PROXY_GROUPS.AUTO,
    PROXY_GROUPS.FALLBACK,
    PROXY_GROUPS.FINAL,
    PROXY_GROUPS.LOW_COST,
    PROXY_GROUPS.GLOBAL,
    PROXY_GROUPS.PREFER,
    PROXY_GROUPS.TAILSCALE,
]);

/** 从规则中提取可用于 include/exclude 的标识（规则集名、GEOSITE/GEOIP 键、域名后缀）。 */
function extractRuleIdentifiers(rule: string): string[] {
    const identifiers: string[] = [];

    const ruleSetMatch = rule.match(/RULE-SET,(\w+)/);
    if (ruleSetMatch) identifiers.push(ruleSetMatch[1]);

    const geositeMatch = rule.match(/GEOSITE,([\w\-@!]+)/);
    if (geositeMatch) identifiers.push(geositeMatch[1]);

    const geoipMatch = rule.match(/GEOIP,(\w+)/);
    if (geoipMatch) identifiers.push(geoipMatch[1]);

    const domainMatch = rule.match(/DOMAIN-SUFFIX,([\w.]+)/);
    if (domainMatch) identifiers.push(domainMatch[1]);

    return identifiers;
}

/**
 * 判断一条规则是否应当保留。
 *
 * 基础规则（私有地址、CN 直连、MATCH）始终保留，避免过滤后配置无法收尾。
 * @param rule - 单条规则
 * @param includedRules - 白名单；为 `null` 时不启用白名单
 * @param excludedRules - 黑名单
 */
export function shouldKeepRule(
    rule: string,
    includedRules: Set<string> | null,
    excludedRules: Set<string>
): boolean {
    if (rule.includes("GEOIP,private") || rule.includes("GEOIP,cn") || rule.includes("MATCH")) {
        return true;
    }

    const identifiers = extractRuleIdentifiers(rule).map((id) => id.toLowerCase());

    if (includedRules !== null) {
        return identifiers.some((id) => includedRules.has(id));
    }

    return !identifiers.some((id) => excludedRules.has(id));
}

/**
 * 从过滤后的规则列表中收集被引用的代理组名称。
 * @param rules - 经过 include/exclude 过滤后的最终规则列表
 * @returns 被规则引用的代理组名称集合
 */
export function getActiveProxyGroupNames(rules: string[]): Set<string> {
    const names = new Set<string>();

    for (const rule of rules) {
        const parts = rule.split(",");
        // 规则的最后一个有效字段（排除 no-resolve 标记）即为命中的目标
        const target =
            parts[parts.length - 1] === "no-resolve"
                ? parts[parts.length - 2]
                : parts[parts.length - 1];

        if (target && !BUILT_IN_POLICIES.has(target)) names.add(target);
    }

    return names;
}

/** 裁剪代理组所需的订阅信息。 */
export interface GroupFilterContext {
    /** 实际生成了地区组的地区名（不含「节点」后缀）。 */
    countryNames: string[];
    /** 订阅中的真实节点名称，用于区分节点与代理组引用。 */
    allProxyNames: Set<string>;
}

/**
 * 仅保留被规则引用的服务类代理组，并清理指向已删除组的悬空候选。
 *
 * 基础设施组与地区组始终保留；候选被清空且未启用 `include-all` 的组补入 `DIRECT`，
 * 与构造层的空组保护保持一致。
 * @param groups - 已构建的代理组列表
 * @param rules - 过滤后的最终规则列表
 * @param context - 详见 `GroupFilterContext`
 */
export function filterProxyGroupsByRules(
    groups: ProxyGroup[],
    rules: string[],
    context: GroupFilterContext
): ProxyGroup[] {
    const activeNames = getActiveProxyGroupNames(rules);
    const countryGroupNames = new Set(context.countryNames.map(countryGroupName));

    const kept = groups.filter((group) => {
        const name = String(group.name);
        return (
            INFRASTRUCTURE_GROUPS.has(name) || countryGroupNames.has(name) || activeNames.has(name)
        );
    });

    const keptNames = new Set(kept.map((group) => String(group.name)));

    for (const group of kept) {
        if (!group.proxies) continue;

        group.proxies = group.proxies.filter(
            (candidate) =>
                BUILT_IN_POLICIES.has(candidate) ||
                context.allProxyNames.has(candidate) ||
                keptNames.has(candidate)
        );

        if (group.proxies.length === 0 && !group["include-all"]) {
            group.proxies = ["DIRECT"];
        }
    }

    return kept;
}

/**
 * 仅保留被最终规则引用到的 rule-providers。
 * @param ruleProviders - 完整的规则集注册表
 * @param rules - 过滤后的最终规则列表
 */
export function filterRuleSetsByRules<T extends Record<string, unknown>>(
    ruleProviders: T,
    rules: string[]
): T {
    const usedNames = new Set(
        rules.filter((rule) => rule.startsWith("RULE-SET,")).map((rule) => rule.split(",")[1])
    );

    return Object.fromEntries(
        Object.entries(ruleProviders).filter(([name]) => usedNames.has(name))
    ) as T;
}
