/**
 * 优先选路节点匹配（本 Fork 新增）。
 *
 * `prefer` 参数匹配的是订阅中的具体节点名称（支持正则），命中的节点会组成
 * 「优先选择」fallback 代理组并置于候选列表首位，节点不可用时自动回退。
 */

import type { ProxyNode } from "../types/proxy";

/**
 * 按正则模式筛选优先节点的名称列表。
 *
 * 对用户输入的正则同时做编译与匹配异常捕获：非法正则或灾难性回溯只会退化
 * 为「不启用优先选择」，不会让整个覆写脚本失败。
 * @param nodes - 上游订阅的节点列表
 * @param patterns - 优先节点正则/名称列表；为 `null` 或空时返回空数组
 */
export function collectPreferNodes(nodes: ProxyNode[], patterns: string[] | null): string[] {
    if (!patterns || patterns.length === 0) return [];

    let regexList: RegExp[];
    try {
        regexList = patterns.map((pattern) => new RegExp(pattern, "i"));
    } catch (error) {
        console.log(
            "[powerfullz 的覆写脚本] 优先节点正则表达式解析失败，已忽略优先选择逻辑。",
            error
        );
        return [];
    }

    const matchedNodes: string[] = [];
    for (const node of nodes) {
        const name = node.name;
        if (!name) continue;

        const isMatch = regexList.some((regex) => {
            try {
                return regex.test(name);
            } catch {
                return false;
            }
        });

        if (isMatch) matchedNodes.push(name);
    }

    return matchedNodes;
}
