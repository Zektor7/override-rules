/**
 * 最终配置组装：将节点、代理组、规则、DNS、TUN、Geo 数据源及上游字段拼装为最终 `ClashConfig`。
 */

import { PROXY_GROUPS } from "../catalog/group-names";
import { ICONS } from "../catalog/icons";
import { adblockAlternatives, ruleSets } from "../catalog/rule-sets";
import { buildDns } from "./dns";
import { buildFullConfig } from "./full-config";
import { geoxUrl } from "./geox";
import { filterProxyGroupsByRules, filterRuleSetsByRules } from "./rule-filter";
import { buildRules } from "./rules";
import { snifferConfig } from "./sniffer";
import { buildTunConfig } from "./tun";
import type { FeatureFlags } from "../types/args";
import type { ClashConfig } from "../types/clash";
import type { NodeAnalysis, ProxyGroup } from "../types/proxy";

/**
 * 追加 GLOBAL 代理组：其候选为它之前的所有代理组。
 */
function appendGlobalGroup(groups: ProxyGroup[]): ProxyGroup[] {
    const global: ProxyGroup = {
        name: PROXY_GROUPS.GLOBAL,
        icon: ICONS.global,
        "include-all": true,
        type: "select",
        proxies: groups.map((group) => String(group.name)),
    };

    return [...groups, global];
}

/** 组装最终配置所需的上下文数据。 */
export interface AssembleConfigInput {
    flags: FeatureFlags;
    nodes: NodeAnalysis;
    proxyGroups: ProxyGroup[];
}

/**
 * 将各部分拼装为最终配置。
 *
 * 上游 `hosts` 始终保留；`full=true` 时追加完整内核参数；
 * DNS 会按字段规则继承上游配置。
 * @param config - 上游订阅配置
 * @param input - 组装上下文
 */
export function assembleConfig(
    config: ClashConfig,
    { flags, nodes, proxyGroups }: AssembleConfigInput
): ClashConfig {
    const rules = buildRules({
        quicEnabled: flags.quicEnabled,
        hasTailscale: nodes.hasTailscale,
        includedRules: flags.includedRules,
        excludedRules: flags.excludedRules,
        adblockSource: flags.adblockSource,
    });

    // 上游新增：按 adblock 级别选择去广告规则集来源（0=关闭）。
    const { ADBlock, AdditionalFilter, ...baseRuleSets } = ruleSets;
    type AdblockProvider =
        typeof ADBlock | (typeof adblockAlternatives)[keyof typeof adblockAlternatives];
    let adblockProvider: AdblockProvider | undefined;
    if (flags.adblockSource === 2) {
        adblockProvider = ADBlock;
    } else if (flags.adblockSource !== 0) {
        adblockProvider = adblockAlternatives[flags.adblockSource];
    }

    // 本 Fork 新增：启用 include/exclude 时，由剩余规则反推未被使用的代理组与规则集并一并剔除。
    const isRuleFiltering = flags.includedRules !== null || flags.excludedRules.size > 0;
    const finalProxyGroups = isRuleFiltering
        ? filterProxyGroupsByRules(proxyGroups, rules, {
              countryNames: nodes.regionLayout.groupedCountries,
              allProxyNames: new Set(nodes.allNodes.map((node) => node.name)),
          })
        : proxyGroups;
    // 上游 adblock 替换源先应用到规则集，再交由 Fork 的过滤逻辑裁剪未使用项。
    const providerRuleSets = {
        ...baseRuleSets,
        ...(adblockProvider && { ADBlock: adblockProvider, AdditionalFilter }),
    };
    const finalRuleSets = isRuleFiltering
        ? filterRuleSetsByRules(providerRuleSets, rules)
        : providerRuleSets;

    return {
        proxies: config.proxies,
        ...(config.hosts !== undefined && { hosts: config.hosts }),
        ...(flags.fullConfig && buildFullConfig(flags)),
        "proxy-groups": appendGlobalGroup(finalProxyGroups),
        "rule-providers": finalRuleSets,
        rules,
        sniffer: snifferConfig,
        dns: buildDns({
            fakeIPEnabled: flags.fakeIPEnabled,
            ipv6Enabled: flags.ipv6Enabled,
            upstreamDns: config.dns,
        }),
        tun: buildTunConfig(flags.tunEnabled, nodes.hasTailscale),
        "geodata-mode": true,
        "geox-url": geoxUrl,
    };
}
