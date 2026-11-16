/**
 * honk `filter` 表达式的构造工具。
 *
 * honk 的 `filter` 沿用 dae 语法：`name(regex: '…')` 匹配节点名，`!name(...)` 取反，
 * `&&` / `||` 组合多个谓词。这里把 `countriesMeta`、`LOW_COST_NODE_MATCHER`、
 * `prefer` 参数等来源转成 honk 的 filter 字符串。
 */

import { countriesMeta } from "../../catalog/countries";
import { LOW_COST_NODE_MATCHER } from "../../catalog/low-cost";

/**
 * 排除订阅中的非代理节点（机场官网/流量提醒等）——沿用 qichiyuhub / kenzok8 通行写法。
 *
 * 这类条目通常在订阅里以「剩余流量」「到期时间」「官网」等出现，
 * 若不排除会让 Select/Auto/Final 组误把「官网链接」当作可用节点。
 */
export const UTILITY_NODE_EXCLUDE =
    "官网|剩余|流量|套餐|免费|订阅|到期时间|直连|Expire Date|Traffic|ExpireDate|Expire|Official|Announcement|Notice|登录|充值";

/** 「匹配全部订阅节点，但排除机场元信息条目」的通用 filter；用于 Select/Auto/Fallback/Final。 */
export const ALL_NODES_FILTER = `!name(regex: '${UTILITY_NODE_EXCLUDE}')`;

/**
 * 生成地区组的 filter 表达式。
 *
 * 无 `excludePattern` 时直接返回 `name(regex: '<pattern>')`；
 * 有则拼接 `&& !name(regex: '<exclude>')`，与 Clash 侧的 include+exclude 语义一致。
 * `country` 上游已保证属于 `countriesMeta` 的键（来自 `analyzeNodes` 的 `groupedCountries`），
 * 若传入未知地区，`meta.pattern` 会在运行时报错，不再额外做存在性检查。
 * @param country - 中文地区名（`countriesMeta` 的键）
 */
export function countryFilter(country: string): string {
    const meta = countriesMeta[country];
    const include = `name(regex: '${meta.pattern}')`;
    return meta.excludePattern ? `${include} && !name(regex: '${meta.excludePattern}')` : include;
}

/** 低倍率组的 filter；直接复用 `LOW_COST_NODE_MATCHER.source` 保持与 Clash 侧一致。 */
export function lowCostFilter(): string {
    return `name(regex: '${LOW_COST_NODE_MATCHER.source}')`;
}

/**
 * 由 `prefer` 参数解析出的模式列表构造 filter。
 *
 * 多个模式用 `|` 拼成一个正则；与 Clash 侧的 fallback 组语义等价（任一命中即入组）。
 * @param patterns - 至少一条非空字符串；空数组时返回 `null` 表示不启用 Prefer 组
 */
export function preferFilter(patterns: readonly string[] | null): string | null {
    if (!patterns) return null;
    const cleaned = patterns.map((pattern) => pattern.trim()).filter(Boolean);
    if (cleaned.length === 0) return null;
    return `name(regex: '${cleaned.join("|")}')`;
}
