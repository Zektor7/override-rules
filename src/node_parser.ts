import {
    LANDING_NODE_MATCHER,
    NODE_SUFFIX,
    LOW_COST_NODE_MATCHER,
    countriesMeta,
} from "./constants";
import type { ClashConfig, CountryInfoItem } from "./types";

const COUNTRY_REGEX_MAP = Object.fromEntries(
    Object.entries(countriesMeta).map(([country, meta]) => {
        return [country, new RegExp(meta.pattern.replace(/^\(\?i\)/, ""))];
    })
) as Record<string, RegExp>;

/**
 * 从 Clash 配置中筛选出所有低价节点的名称。
 * @param config - 当前的 Clash 配置对象，需包含 `proxies` 字段
 * @returns 匹配低价节点正则的节点名称数组
 */
export function parseLowCost(config: ClashConfig): string[] {
    return (config.proxies || [])
        .filter((proxy) => LOW_COST_NODE_MATCHER.regex.test(proxy.name || ""))
        .map((proxy) => proxy.name)
        .filter((name): name is string => Boolean(name));
}

/**
 * 将订阅中的所有节点按是否为落地节点进行分类。
 * @param config - 当前的 Clash 配置对象，需包含 `proxies` 字段
 * @returns 包含 `landingNodes`（落地节点名称列表）和 `nonLandingNodes`（非落地节点名称列表）的对象
 */
export function parseNodesByLanding(config: ClashConfig): {
    landingNodes: string[];
    nonLandingNodes: string[];
} {
    const landingNodes: string[] = [];
    const nonLandingNodes: string[] = [];

    for (const proxy of config.proxies || []) {
        const name = proxy.name;
        if (!name) continue;

        if (LANDING_NODE_MATCHER.regex.test(name)) {
            landingNodes.push(name);
            continue;
        }

        nonLandingNodes.push(name);
    }

    return { landingNodes, nonLandingNodes };
}

/**
 * 遍历订阅中的所有节点，按 `countriesMeta` 中定义的地区进行归类。
 * @param config - 当前的 Clash 配置对象，需包含 `proxies` 字段
 * @param landing - 是否启用落地节点模式；为 `true` 时将跳过落地节点，默认为 `false`
 * @returns 按地区归类后的节点信息数组，每项包含 `country`（地区名）和 `nodes`（节点名称列表）
 */
export function parseCountries(config: ClashConfig, landing = false): CountryInfoItem[] {
    const proxies = config.proxies || [];
    const countryNodes: Record<string, string[]> = Object.create(null);

    for (const proxy of proxies) {
        const name = proxy.name || "";

        if (landing && LANDING_NODE_MATCHER.regex.test(name)) continue;

        for (const [country, regex] of Object.entries(COUNTRY_REGEX_MAP)) {
            if (!regex.test(name)) continue;

            if (!countryNodes[country]) {
                countryNodes[country] = [];
            }
            countryNodes[country].push(name);
            break;
        }
    }

    return Object.entries(countryNodes).map(([country, nodes]) => ({ country, nodes }));
}

/**
 * 根据最小节点数量阈值过滤地区，并按权重排序后返回带后缀的地区分组名称列表。
 * @param countryInfo - 由 `parseCountries` 返回的地区节点信息数组
 * @param minCount - 地区节点数量的最小阈值，节点数不足该值的地区将被过滤掉
 * @returns 按权重升序排列、附加了节点后缀（`NODE_SUFFIX`）的地区分组名称数组
 */
export function getCountryGroupNames(countryInfo: CountryInfoItem[], minCount: number): string[] {
    const filtered = countryInfo.filter((item) => item.nodes.length >= minCount);

    filtered.sort((a, b) => {
        const wa = countriesMeta[a.country]?.weight ?? Infinity;
        const wb = countriesMeta[b.country]?.weight ?? Infinity;
        return wa - wb;
    });

    return filtered.map((item) => item.country + NODE_SUFFIX);
}

/**
 * 移除分组名称末尾的节点后缀（`NODE_SUFFIX`），还原为纯地区名称。
 * @param groupNames - 带节点后缀的分组名称数组，通常来自 `getCountryGroupNames`
 * @returns 去除后缀后的地区名称数组
 */
export function stripNodeSuffix(groupNames: string[]): string[] {
    const suffixPattern = new RegExp(`${NODE_SUFFIX}$`);
    return groupNames.map((name) => name.replace(suffixPattern, ""));
}

/**
 * 根据优先节点正则表达式，筛选出匹配的订阅节点名称。
 * 对正则表达式编译和匹配进行了异常捕获以防御 ReDoS 攻击。
 *
 * @param config - 原始 Clash 配置
 * @param patterns - 优先节点正则/名称列表
 * @returns 匹配到的底层节点名称列表
 */
export function parsePreferNodes(config: ClashConfig, patterns: string[] | null): string[] {
    if (!patterns || patterns.length === 0) return [];
    const proxies = config.proxies || [];
    const matchedNodes: string[] = [];

    try {
        // 将用户的输入编译为 RegExp 对象，捕获可能的正则语法错误
        const regexList = patterns.map((p) => new RegExp(p, "i"));

        for (const proxy of proxies) {
            const name = proxy.name;
            if (!name) continue;
            // 匹配任何一个正则即判定匹配成功
            const isMatch = regexList.some((rx) => {
                try {
                    return rx.test(name);
                } catch {
                    return false; // 防御匹配期间的异常
                }
            });
            if (isMatch) {
                matchedNodes.push(name);
            }
        }
    } catch (e) {
        console.log("[powerfullz 的覆写脚本] 优先节点正则表达式解析失败，已忽略优先选择逻辑。", e);
        return [];
    }

    return matchedNodes;
}
