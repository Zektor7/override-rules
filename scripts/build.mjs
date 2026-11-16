import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";

// 先确保 src/generated/honk-rulesets.ts 与 ruleset/*.list 保持同步，
// 再进入 esbuild；这样 main-honk.ts 里的 import 拿到的始终是最新内联内容。
execFileSync(process.execPath, ["scripts/generate-honk-rulesets.mjs"], { stdio: "inherit" });

/**
 * 从指定入口的顶部 `/*! ... *\/` banner 提取注释块，作为产物文件头。
 * @param {string} entryPath
 */
function extractBanner(entryPath) {
    const code = fs.readFileSync(entryPath, "utf8");
    const match = code.match(/\/\*![\s\S]*?\*\//);
    return match ? match[0] : "";
}

const entries = [
    { input: "src/main.ts", base: "convert" },
    { input: "src/main-honk.ts", base: "convert-honk" },
];

const commonOptions = {
    bundle: true,
    platform: "neutral",
    format: "iife",
    target: "ES2025",
    legalComments: "none",
    charset: "utf8",
};

const jobs = [];
for (const { input, base } of entries) {
    const banner = extractBanner(input);
    const opts = { ...commonOptions, entryPoints: [input], banner: { js: banner } };
    jobs.push(esbuild.build({ ...opts, outfile: `${base}.js` }));
    jobs.push(
        esbuild.build({
            ...opts,
            minify: true,
            outfile: `${base}.min.js`,
            drop: ["debugger"],
        })
    );
}

Promise.all(jobs).catch((err) => {
    console.error(err);
    process.exit(1);
});
