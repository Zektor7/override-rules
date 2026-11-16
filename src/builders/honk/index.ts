/**
 * honk 输出对外 API。
 *
 * 目前唯一的外部消费者是 `scripts/honk_generator/generator.ts`，只需要 `buildHonkDae`。
 * 其他 helper（`buildHonkGroupSpecs` / `translateRule` / `renderHonkConfig` 等）
 * 由各自的构建模块直接 `import`，测试也是这样按子模块路径引用，避免在 facade 里
 * 无差别 re-export 引入 knip 的「未使用导出」告警。
 */

import { renderHonkConfig } from "./render";
import type { HonkBuildContext, InlineRuleSetMap } from "../../types/honk";

/** 一步生成完整 `config.dae` 文本；语义与 `renderHonkConfig` 相同，命名对外更直观。 */
export function buildHonkDae(
    ctx: HonkBuildContext,
    inlinedRuleSets: InlineRuleSetMap = {}
): string {
    return renderHonkConfig(ctx, inlinedRuleSets);
}
