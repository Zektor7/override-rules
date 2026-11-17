/**
 * honk 输出对外 API。
 *
 * 入口是 `src/main-honk.ts`（Sub-Store 侧的 `convert-honk.min.js`），
 * 由 `renderHonkConfig` 拼装完整 `.dae`。这里再包一层 `buildHonkDae`，
 * 让测试可以显式传入 `inlinedRuleSets`（静态生成场景），运行时覆写默认走空对象。
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
