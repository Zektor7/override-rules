/**
 * honk 覆写的共享生成逻辑。
 *
 * 两条入口都走这里，保证产物完全一致：
 * - 文件作用域（Sub-Store 把脚本内联进 `operator`）：见 `builders/honk/file-scope.ts`；
 * - 独立调用（`main(config)`）：见 `src/main-honk.ts`。
 */

import { buildFeatureFlags } from "../../args/parse";
import { buildHonkRuntimeOptions } from "../../args/honk-parse";
import { analyzeNodes } from "../../analysis/classify";
import { buildHonkDae } from "./index";
import { INLINED_HONK_RULESETS } from "../../generated/honk-rulesets";
import type { ScriptArgs } from "../../types/args";
import type { ClashConfig } from "../../types/clash";
import type { HonkFileContext, HonkRequestContext, HonkScriptArgs } from "../../types/honk";

/** honk 入口收到的全部参数：mihomo 共用字段 + honk 独有字段。 */
export type HonkEntryArgs = ScriptArgs & HonkScriptArgs;

/**
 * 从上游 Clash 配置生成完整的 `config.dae` 文本。
 * @param config - 上游 Clash 配置（需含 `proxies`）
 * @param args - `$arguments` 原始参数
 * @param fileContext - Sub-Store 文件作用域的 `$file`；非 SubStore 环境传 `null`
 * @param requestContext - Sub-Store 暴露的 `$options._req`；用于反推服务基础地址
 */
export function buildHonkFromConfig(
    config: ClashConfig,
    args: HonkEntryArgs,
    fileContext: HonkFileContext | null = null,
    requestContext: HonkRequestContext | null = null
): string {
    if (!config.proxies || !Array.isArray(config.proxies)) {
        throw new Error("[powerfullz 的 honk 覆写] 错误：Clash 配置中缺少有效的 proxies 字段");
    }

    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args, flags, fileContext, requestContext);
    const nodes = analyzeNodes(config.proxies, flags.countryThreshold, flags.preferPatterns);

    return buildHonkDae({ flags, opts, nodes }, INLINED_HONK_RULESETS);
}
