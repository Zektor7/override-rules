/**
 * 从 `ruleset/*.list` 生成 `src/generated/honk-rulesets.ts`。
 *
 * honk 覆写跑在 Sub-Store 里、没有文件系统访问；而 honk 又不支持 rule-provider，
 * 所以项目自维护的 `.list` 只能编译期内联到 JS bundle 里。本脚本是这条链的入口：
 * 读文件 → 转义 → 写 TypeScript 模块 → 由 `src/main-honk.ts` 直接 import。
 *
 * 修改 `ruleset/*.list` 后请重跑 `npm run generate:honk-rulesets` 或直接 `npm run build`
 * （`prebuild` 钩子已经把它挂在 build 前面）；生成文件已提交到 git，方便 `npm test`
 * 在干净克隆下立刻可跑。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, "..");
const RULESET_DIR = path.join(BASE_DIR, "ruleset");
const OUTPUT_FILE = path.join(BASE_DIR, "src", "generated", "honk-rulesets.ts");

/** 与 `scripts/honk_generator`（已废弃）保持同步：项目自维护、可以内联的 ruleset 键。 */
const OWNED_RULESETS = [
    "TikTok",
    "EHentai",
    "Weibo",
    "PT",
    "SteamFix",
    "AdditionalFilter",
    "AdditionalCDNResources",
];

function main() {
    mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

    /** @type {Record<string, string[]>} */
    const inlined = {};
    for (const key of OWNED_RULESETS) {
        const file = path.join(RULESET_DIR, `${key}.list`);
        const raw = readFileSync(file, "utf-8");
        inlined[key] = raw.split(/\r?\n/);
    }

    const body = [
        "/**",
        " * 自动生成，请勿手工编辑。",
        " *",
        " * 来源：`ruleset/*.list`；生成脚本：`scripts/generate-honk-rulesets.mjs`。",
        " * 修改自维护规则后请重跑 `npm run generate:honk-rulesets`（`npm run build` 会自动执行）。",
        " */",
        "",
        'import type { InlineRuleSetMap } from "../types/honk";',
        "",
        "/** 供 honk 覆写运行时使用的自维护 ruleset 内联集合；键与 `RuleSetKey` 一致。 */",
        "export const INLINED_HONK_RULESETS: InlineRuleSetMap = " +
            JSON.stringify(inlined, null, 4) +
            ";",
        "",
    ].join("\n");

    writeFileSync(OUTPUT_FILE, body, "utf-8");
    console.log(
        `[generate:honk-rulesets] 写入 ${path.relative(process.cwd(), OUTPUT_FILE)}（${Object.keys(inlined).length} 个 ruleset）`
    );
}

main();
