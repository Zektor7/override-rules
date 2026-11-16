/**
 * 拼接完整的 honk `config.dae` 文本。
 *
 * 段落顺序：文件头 banner → subscription 占位 → group → dns → routing → global →
 * assets → experimental → 尾部被丢弃字段说明。banner 里带一份参数指纹，方便
 * 用户把 `honks/*.dae` 与 URL 参数一一对应。
 */

import { HONK_POLICIES } from "../../catalog/honk-groups";
import { buildHonkAssets } from "./assets";
import { buildHonkDns } from "./dns";
import { buildHonkExperimental } from "./experimental";
import { buildHonkGlobal } from "./global";
import { buildHonkGroups } from "./groups";
import { buildHonkRoutingLines } from "./rules";
import type { HonkBuildContext, InlineRuleSetMap } from "../../types/honk";

/** `subscription {}` 占位块；用户替换 URL 后即可运行。 */
const SUBSCRIPTION_BLOCK: readonly string[] = [
    "subscription {",
    "    # 将下方 URL 替换为你自己的订阅地址（Sub-Store 生成的 Clash YAML 或机场原始链接均可）；",
    "    # honk 原生识别分享链接列表 / Clash YAML / sing-box JSON。",
    "    my_sub: 'https://example.com/your-subscription' {",
    "        interval: 86400s",
    "        route: direct",
    "    }",
    "}",
];

/** 尾部「被丢弃字段」注释，让排障时能一眼看出 honk 与 Clash 输出的语义差。 */
const DISCARDED_FIELDS_NOTE: readonly string[] = [
    "# ------------------------------------------------------------",
    "# 以下 Clash/Mihomo 字段在 honk 输出中无对应概念，已按 honk 语义丢弃：",
    "#   - landing / dialer-proxy 链式代理（honk 无 dialer-proxy）",
    "#   - front-proxy / 前置代理组",
    "#   - tailscale 节点与 100.64.0.0/10 定向分流（honk 无 tailscale outbound）",
    "#   - fake-ip 引擎、sniffer、TCP keepalive",
    "#   - tun 段（honk 是 eBPF 透明代理，走 global.nfqueue_enable 与内核参数）",
    "#   - manual（手动选择）：Select 组已承担同类作用",
    "#   - GLOBAL 汇总组：Final 组负责兜底",
    "#   - AdBlock / SogouInput 组：外部 rule-provider 无等价物，路由层直接落到",
    "#     `block` / `direct`；如需精确去广告列表，请在 routing {} 手工补充。",
    "# ------------------------------------------------------------",
];

/** 参数指纹，方便把产物文件名与实际渲染的 flags 对齐。 */
function renderParameterFingerprint(ctx: HonkBuildContext): string {
    const { flags } = ctx;
    const includeLabel = flags.includedRules ? Array.from(flags.includedRules).join("|") : "-";
    const excludeLabel =
        flags.excludedRules.size > 0 ? Array.from(flags.excludedRules).join("|") : "-";
    const preferLabel = flags.preferPatterns ? flags.preferPatterns.join("|") : "-";
    return [
        `grouptype=${flags.groupType} (${HONK_POLICIES[flags.groupType]})`,
        `adblock=${flags.adblockSource}`,
        `ipv6=${flags.ipv6Enabled ? "on" : "off"}`,
        `quic=${flags.quicEnabled ? "on" : "off"}`,
        `include=${includeLabel}`,
        `exclude=${excludeLabel}`,
        `prefer=${preferLabel}`,
    ].join(", ");
}

function renderBanner(ctx: HonkBuildContext): string[] {
    return [
        "# 由 override-rules 静态生成器产出，请勿直接编辑。",
        "# 生成器入口：scripts/honk_generator/generator.ts",
        "# 目标客户端：honk (https://github.com/daeuniverse/honk)，dae 兼容语法。",
        `# 参数：${renderParameterFingerprint(ctx)}`,
        "# 使用前请：",
        "#   1. 替换 subscription {} 里的示例 URL 为你的订阅地址；",
        "#   2. 按需调整 global {} 的 lan_interface / data_dir；",
        "#   3. 首次运行前执行 `honk-core config validate --config config.dae` 校验。",
        "",
    ];
}

/**
 * 渲染完整的 `config.dae` 文本（末尾含换行）。
 * @param ctx - honk 构建上下文
 * @param inlinedRuleSets - 已读取的 `ruleset/*.list`，供 `RULE-SET` 分支展开
 */
export function renderHonkConfig(ctx: HonkBuildContext, inlinedRuleSets: InlineRuleSetMap): string {
    const routingLines = buildHonkRoutingLines(ctx, inlinedRuleSets);

    const sections: string[][] = [
        renderBanner(ctx),
        [...SUBSCRIPTION_BLOCK],
        buildHonkGroups(ctx),
        buildHonkDns(ctx.flags),
        ["routing {", ...routingLines, "}"],
        buildHonkGlobal(),
        buildHonkAssets(),
        buildHonkExperimental(),
        [...DISCARDED_FIELDS_NOTE],
    ];

    return `${sections.map((lines) => lines.join("\n")).join("\n\n")}\n`;
}
