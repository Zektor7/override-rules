/**
 * honk 静态配置生成器。
 *
 * 与 `scripts/yaml_generator/generator.ts` 平行：直接使用 `src/` 里的解析与构建函数，
 * 不经过 `convert.js`。产物落在 `honks/`，与 `yamls/` 一样属于本地构建产物，
 * 已被 `.gitignore` 忽略。
 *
 * 参数矩阵（最小有意义集）：
 * - grouptype ∈ {0, 1, 2}（对应 honk policy：select / min_moving_avg / loadbalance）
 * - adblock   ∈ {0, 1}（1 表示启用 `geosite: category-ads-all` 近似）
 * - ipv6      ∈ {0, 1}（0 时在 `dns.routing.request` 里加 `qtype(aaaa) -> reject`）
 * - quic      ∈ {0, 1}（0 时插入 `l4proto(udp) && dport(443) -> block`）
 *
 * 共 3×2×2×2 = 24 个 `.dae` 文件。其他 Clash 参数（landing/fakeip/tun/keepalive/full/regex）
 * 在 honk 输出里要么被丢弃、要么恒定，无需枚举；详见 `docs/ARCHITECTURE.md` 的
 * 「honk 输出模式」小节。
 *
 * 可选环境变量：
 * - `LIMIT_COMBOS`：仅生成前 N 个组合，便于本地调试；
 * - `PREFER_REGEX`：设置后所有产物都追加 Prefer 组（Fork 特性），值为逗号分隔的正则模式。
 */

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildFeatureFlags } from "../../src/args/parse";
import { analyzeNodes } from "../../src/analysis/classify";
import { buildHonkDae } from "../../src/builders/honk";
import type { ClashConfig } from "../../src/types/clash";
import type { InlineRuleSetMap } from "../../src/types/honk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, "../..");
const FAKE_PROXIES_FILE = path.join(BASE_DIR, "scripts", "yaml_generator", "fake_proxies.json");
const RULESET_DIR = path.join(BASE_DIR, "ruleset");
const OUTPUT_DIR = path.join(BASE_DIR, "honks");

/**
 * 项目自维护的规则集，会被读入并内联为 honk `domain(...)` 列表。
 * 键与 `src/catalog/rule-sets.ts` 的 `RuleSetKey` 保持一致。
 */
const OWNED_RULESETS = [
    "TikTok",
    "EHentai",
    "Weibo",
    "PT",
    "SteamFix",
    "AdditionalFilter",
    "AdditionalCDNResources",
] as const;

const GROUPTYPE_VALUES = [0, 1, 2] as const;
const ADBLOCK_VALUES = [0, 1] as const;
const BOOL_VALUES = [false, true] as const;

interface ComboArgs {
    grouptype: (typeof GROUPTYPE_VALUES)[number];
    adblock: (typeof ADBLOCK_VALUES)[number];
    ipv6: boolean;
    quic: boolean;
}

/** adblock 在 honk 侧只用「是否启用」二值：非 0 时统一走 `geosite: category-ads-all`。 */
function comboToScriptArgs(combo: ComboArgs, prefer: string | undefined): Record<string, string> {
    const args: Record<string, string> = {
        grouptype: String(combo.grouptype),
        adblock: String(combo.adblock),
        ipv6: combo.ipv6 ? "true" : "false",
        quic: combo.quic ? "true" : "false",
        // 静态文件永远走 filter 模式，无法预知真实节点。
        regex: "true",
    };
    if (prefer) args.prefer = prefer;
    return args;
}

function generateArgCombos(): ComboArgs[] {
    const combos: ComboArgs[] = [];
    for (const grouptype of GROUPTYPE_VALUES) {
        for (const adblock of ADBLOCK_VALUES) {
            for (const ipv6 of BOOL_VALUES) {
                for (const quic of BOOL_VALUES) {
                    combos.push({ grouptype, adblock, ipv6, quic });
                }
            }
        }
    }
    return combos;
}

function fileNameFromCombo(combo: ComboArgs): string {
    return (
        `config_gt-${combo.grouptype}_adblock-${combo.adblock}` +
        `_ipv6-${Number(combo.ipv6)}_quic-${Number(combo.quic)}.dae`
    );
}

function loadFakeConfig(): ClashConfig {
    if (!existsSync(FAKE_PROXIES_FILE)) {
        throw new Error(`未找到假节点数据: ${FAKE_PROXIES_FILE}`);
    }
    const raw = readFileSync(FAKE_PROXIES_FILE, "utf-8");
    const json = JSON.parse(raw) as ClashConfig;
    if (!json.proxies || !Array.isArray(json.proxies)) {
        throw new Error("fake_proxies.json 缺少 proxies 数组");
    }
    return json;
}

/** 读取项目自维护的 `ruleset/*.list`；文件缺失时打 warning 但不阻断（该 ruleset 会被跳过）。 */
function loadOwnedRuleSets(): InlineRuleSetMap {
    const inlined: Record<string, string[]> = {};
    for (const key of OWNED_RULESETS) {
        const file = path.join(RULESET_DIR, `${key}.list`);
        if (!existsSync(file)) {
            console.warn(`[warn] 缺少自维护规则集文件: ${path.relative(BASE_DIR, file)}`);
            continue;
        }
        const content = readFileSync(file, "utf-8");
        inlined[key] = content.split(/\r?\n/);
    }
    return inlined;
}

function ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}

/** 清理旧命名格式的 `.dae` 文件，避免矩阵调整时留下悬挂产物。 */
function cleanupLegacyDaeFiles(): void {
    const currentPattern = /^config_gt-\d_adblock-\d_ipv6-\d_quic-\d\.dae$/;
    for (const fileName of readdirSync(OUTPUT_DIR)) {
        if (!fileName.endsWith(".dae")) continue;
        if (currentPattern.test(fileName)) continue;
        try {
            unlinkSync(path.join(OUTPUT_DIR, fileName));
        } catch {
            // 单文件删除失败不影响其余清理
        }
    }
}

function resolveLimit(total: number): number {
    const raw = process.env.LIMIT_COMBOS;
    if (!raw) return total;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return total;
    return Math.min(parsed, total);
}

export function main(): void {
    const baseConfig = loadFakeConfig();
    const inlinedRuleSets = loadOwnedRuleSets();
    const rawPrefer = process.env.PREFER_REGEX?.trim();
    const prefer = rawPrefer === undefined || rawPrefer.length === 0 ? undefined : rawPrefer;

    ensureDir(OUTPUT_DIR);
    cleanupLegacyDaeFiles();

    const combos = generateArgCombos();
    const limit = resolveLimit(combos.length);
    console.log(
        `将生成 ${limit} 个 .dae 文件 (共 ${combos.length} 种组合)` +
            (prefer ? ` [prefer=${prefer}]` : "")
    );

    let count = 0;
    for (const combo of combos) {
        if (count >= limit) break;

        const flags = buildFeatureFlags(comboToScriptArgs(combo, prefer));
        const nodes = analyzeNodes(
            baseConfig.proxies ?? [],
            flags.countryThreshold,
            flags.preferPatterns
        );
        const daeText = buildHonkDae({ flags, nodes }, inlinedRuleSets);
        const filePath = path.join(OUTPUT_DIR, fileNameFromCombo(combo));
        writeFileSync(filePath, daeText, "utf-8");
        console.log(`[生成] ${path.relative(process.cwd(), filePath)}`);
        count += 1;
    }

    console.log(`完成：输出 ${count} 个 .dae 文件到 ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

try {
    main();
} catch (error) {
    console.error("生成失败:", error);
    process.exit(1);
}
