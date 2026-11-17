/**
 * honk 侧的地区归类：按中文国名把节点分到 honk 的地区组。
 *
 * 与 Clash 侧 `analysis/classify.ts` 的地区分类是两套独立实现：
 * - Clash 侧只收录 24 个常用地区，且用庞大的同义词正则匹配（节点名未经规范化）；
 * - honk 侧面对的是**已被上游重命名脚本规范化**的节点名（「香港 01」「阿联酋 IPLC 02」），
 *   直接按中文国名匹配即可，并覆盖 `catalog/honk-countries.ts` 里的全部国家/地区。
 *
 * 一个节点只归入首个命中的国家（与 Clash 侧「命中首个地区即停止」的语义一致）。
 */

import { HONK_COUNTRIES } from "../catalog/honk-countries";
import type { ProxyNode } from "../types/proxy";

/** honk 侧一个地区组的归类结果。 */
export interface HonkRegionGroup {
    /** honk 组名（ISO 3166-1 alpha-2），如 `HK` / `AE` / `BR`。 */
    tag: string;
    /** 命中的中文国名；同一组可能有多个别名（「马来」与「马来西亚」）。 */
    names: string[];
    /** 归入该地区的节点。 */
    nodes: ProxyNode[];
}

/**
 * 按中文国名归类节点。
 *
 * 顺序与 `HONK_COUNTRIES` 一致（按常见度），因此地区组的排列顺序稳定。
 * @param nodes - 上游订阅的全部节点
 */
export function classifyHonkRegions(nodes: ProxyNode[]): HonkRegionGroup[] {
    const claimed = new Set<string>();
    const groups: HonkRegionGroup[] = [];

    for (const [country, tag] of HONK_COUNTRIES) {
        const matched = nodes.filter((node) => {
            if (!node.name || claimed.has(node.name)) return false;
            return node.name.includes(country);
        });
        if (matched.length === 0) continue;
        matched.forEach((node) => claimed.add(node.name));
        groups.push({ tag, names: [country], nodes: matched });
    }

    return groups;
}
