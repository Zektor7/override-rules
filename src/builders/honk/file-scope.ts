/**
 * Sub-Store 文件作用域的胶水层。
 *
 * Sub-Store 处理「文件」时，会把上游内容作为 `$content` 交给脚本；脚本执行完后
 * `$content` 就是响应体（`backend/src/restful/sync.js` 里 `produceArtifact` 的
 * `type === 'file'` 分支）。因此 honk 覆写只要把生成的 `config.dae` 写回
 * `$content`，客户端就能拿到裸的 dae 文本。
 *
 * 节点来源与 mihomo 覆写完全一致：`$content` 是同一份组合订阅的 Clash YAML，
 * 这里解析出 `proxies` 后走同一条分类流水线。
 */

import { buildHonkFromConfig } from "./script";
import type { HonkEntryArgs } from "./script";
import type { ClashConfig } from "../../types/clash";
import type { ProxyNode } from "../../types/proxy";
import type { HonkFileContext, HonkRequestContext } from "../../types/honk";

/**
 * Sub-Store 注入的 YAML 解析器（`ProxyUtils.yaml`，与 `yaml.parse` 同义）。
 *
 * 只在 Sub-Store 脚本作用域里存在；这里是自由变量，靠运行时作用域解析。
 */
declare const yaml: { parse(text: string): unknown } | undefined;

/**
 * Sub-Store 注入的 `ProxyUtils`；其 `parse` 能解析任意订阅格式，用作兜底。
 */
declare const ProxyUtils: { parse?: (raw: string) => unknown[] } | undefined;

/** 用 Sub-Store 注入的 YAML 解析器读上游配置；解析不出来返回 `null`。 */
function parseWithYaml(raw: string): ClashConfig | null {
    if (typeof yaml === "undefined" || typeof yaml.parse !== "function") return null;
    try {
        const parsed = yaml.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // 不是合法 YAML，交给下一级兜底
    }
    return null;
}

/** 用 `ProxyUtils.parse` 解析上游内容（支持 Clash YAML / base64 订阅等多种格式）。 */
function parseWithProxyUtils(raw: string): ProxyNode[] | null {
    if (typeof ProxyUtils === "undefined" || typeof ProxyUtils.parse !== "function") {
        return null;
    }
    try {
        const parsed = ProxyUtils.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed as ProxyNode[];
        }
    } catch {
        // 解析失败，走错误提示
    }
    return null;
}

/**
 * 把 Sub-Store 传入的上游内容转换成完整的 `config.dae`。
 * @param raw - `$content` 原文（上游组合订阅的 Clash YAML）
 * @param args - `$arguments` 原始参数
 * @param fileContext - Sub-Store 暴露的 `$file`
 * @param requestContext - Sub-Store 暴露的 `$options._req`
 */
export function buildHonkFileScope(
    raw: string,
    args: HonkEntryArgs,
    fileContext: HonkFileContext | null = null,
    requestContext: HonkRequestContext | null = null
): string {
    const config = parseWithYaml(raw);
    if (config) {
        return buildHonkFromConfig(config, args, fileContext, requestContext);
    }

    const proxies = parseWithProxyUtils(raw);
    if (proxies) {
        return buildHonkFromConfig({ proxies }, args, fileContext, requestContext);
    }

    throw new Error(
        "[powerfullz 的 honk 覆写] 错误：无法从 Sub-Store 传入的上游内容里解析出节点" +
            "（$content 既不是合法的 Clash 配置，也没解析出节点）"
    );
}
