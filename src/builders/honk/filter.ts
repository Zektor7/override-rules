/**
 * honk `filter` 表达式的构造工具。
 *
 * honk 的 `filter` 沿用 dae 语法：`name(regex: '…')` 匹配节点名，`!name(...)` 取反，
 * `&&` / `||` 组合多个谓词。这里把 `countriesMeta`、`prefer` 参数等来源转成
 * honk 的 filter 字符串。
 */

import { HONK_COUNTRIES } from "../../catalog/honk-countries";

/**
 * 排除订阅中的非代理节点（机场官网/流量提醒等）——沿用 qichiyuhub / kenzok8 通行写法。
 *
 * 这类条目通常在订阅里以「剩余流量」「到期时间」「官网」等出现，
 * 若不排除会让 Manual 组误把「官网链接」当作可用节点。
 */
const UTILITY_NODE_EXCLUDE =
    "官网|剩余|流量|套餐|免费|订阅|到期时间|直连|Expire Date|Traffic|ExpireDate|Expire|Official|Announcement|Notice|登录|充值";

/** 判断节点名是否属于「机场元信息条目」（不是真正的代理节点）。 */
export function isUtilityNode(name: string): boolean {
    return new RegExp(UTILITY_NODE_EXCLUDE).test(name);
}

/**
 * 所有已知地区名的合并正则源串（中文国名，取自 `catalog/honk-countries.ts`）。
 *
 * 上游节点通常已经过重命名脚本规范化（节点名形如「香港 01」「🇭🇰 香港 IPLC 02」），
 * 地区关键词固定出现在名字里，因此地区匹配不必再用庞大的同义词正则——
 * 按中文国名匹配即可。
 */
const REGION_NAMES_PATTERN = HONK_COUNTRIES.map(([country]) => country).join("|");

/** 「匹配全部订阅节点，但排除机场元信息条目」的通用 filter；用于 Manual 组。 */
export const ALL_NODES_FILTER = `!name(regex: '${UTILITY_NODE_EXCLUDE}')`;

/**
 * 把注入的 `direct` 出站收进候选。
 *
 * honk 的 `direct` / `block` 是出站而不是节点池成员：无过滤器的组、`keyword:`、
 * `regex:` 与 `subtag(...)` 都不会选中它们，**只有按名字写出的过滤器才会收入**
 * （`filter: name(direct)`）。mihomo 侧服务组候选里的 `DIRECT` 对应到这里。
 */
export const DIRECT_FILTER = "name(direct)";

/**
 * 生成引用其它组的 filter 表达式。
 *
 * honk 的 `filter: group('tag', …)` 会把嵌套组 tag 加入候选：每个嵌套组贡献它
 * 自身策略当前选出的那个叶节点。这正是 mihomo 侧「候选列表里写其它代理组名」
 * 的等价语义——服务组要「挑地区 / 挑手动选择」而不是「全都用同一批节点」，
 * 就必须用 `group(...)`，否则所有组的成员会退化成同一张全量候选池。
 *
 * 注意：honk 只接受**单独一行**的 `group(...)`，与其它谓词写在同一行会被忽略。
 * @param tags - 嵌套组 tag 列表（组名），按书写顺序排列
 */
export function groupFilter(tags: readonly string[]): string {
    const quoted = tags.map((tag) => `'${tag}'`).join(", ");
    return `group(${quoted})`;
}

/**
 * 生成地区组的 filter 表达式。
 *
 * 节点名经上游重命名脚本规范化后以中文国名开头（如「香港 01」「🇭🇰 香港 IPLC 02」），
 * 因此按国名匹配即可——不必套用 `countriesMeta.pattern` 那套庞大的同义词正则。
 * 同一组可能有多个国名别名（如「马来」与「马来西亚」），用 `|` 并列。
 * @param country - 中文地区名（可并列多个）
 */
export function countryFilter(country: string): string {
    return `name(regex: '${country}')`;
}

/**
 * 生成「未分类」组的 filter 表达式：不属于任何已知地区、也不是机场元信息的节点。
 *
 * 用「排除所有已知国名」来表达，比逐个列出节点名更短也更稳定（订阅换节点也不用重算）。
 */
export function unclassifiedFilter(): string {
    return `!name(regex: '${REGION_NAMES_PATTERN}') && !name(regex: '${UTILITY_NODE_EXCLUDE}')`;
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
