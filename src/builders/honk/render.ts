/**
 * 拼接完整的 honk `config.dae` 文本。
 *
 * 段落顺序：文件头 banner → subscription → group → dns → routing → global →
 * assets → experimental。banner 里带一份参数指纹（含订阅 URL、grouptype 映射结果等），
 * 让 curl 下来的 .dae 自带"用哪些参数生成"的元信息，排障时不用回头翻 Sub-Store 配置。
 */

import { HONK_POLICIES } from "../../catalog/honk-groups";
import { buildHonkAssets } from "./assets";
import { buildHonkDns } from "./dns";
import { buildHonkExperimental } from "./experimental";
import { buildHonkGlobal } from "./global";
import { buildHonkGroups } from "./groups";
import { buildHonkRoutingLines } from "./rules";
import type { HonkBuildContext, InlineRuleSetMap } from "../../types/honk";

/**
 * `subscription {}` 段。
 *
 * honk 会在 interval 周期内自动重拉 URL；`sub-cache` 决定是否写入本地状态库；
 * `sub-route` 决定用哪个出口去拉订阅（默认 `direct`，避免"订阅拉取依赖订阅节点"的循环）。
 */
function renderSubscriptionBlock(ctx: HonkBuildContext): string[] {
    const { opts } = ctx;
    const isPlaceholder = opts.subscriptionUrl.startsWith("https://example.com/");
    const lines: string[] = ["subscription {"];
    if (isPlaceholder) {
        lines.push(
            "    # TODO: 通过 Sub-Store URL hash `#subscription=<url-encoded>` 传入你的订阅地址。"
        );
    }
    lines.push(
        `    ${opts.subscriptionTag}: '${opts.subscriptionUrl}' {`,
        `        interval: ${opts.subscriptionInterval}`,
        `        route: ${opts.subscriptionRoute}`,
        `        cache: ${opts.subscriptionCache}`,
        `        ua: '${opts.subscriptionUa}'`,
        "    }",
        "}"
    );
    return lines;
}

/** 参数指纹：让用户从 .dae 顶部就能反推出订阅 URL 与关键开关。 */
function renderParameterFingerprint(ctx: HonkBuildContext): string {
    const { flags, opts } = ctx;
    const includeLabel = flags.includedRules ? Array.from(flags.includedRules).join("|") : "-";
    const excludeLabel =
        flags.excludedRules.size > 0 ? Array.from(flags.excludedRules).join("|") : "-";
    const preferLabel = flags.preferPatterns ? flags.preferPatterns.join("|") : "-";
    return [
        `subscription=${opts.subscriptionUrl}`,
        `grouptype=${flags.groupType} (${HONK_POLICIES[flags.groupType]})`,
        `adblock=${flags.adblockSource}`,
        `ipv6=${flags.ipv6Enabled ? "on" : "off"}`,
        `quic=${flags.quicEnabled ? "on" : "off"}`,
        `include=${includeLabel}`,
        `exclude=${excludeLabel}`,
        `prefer=${preferLabel}`,
        `lan-iface=${opts.lanInterface}`,
        `dial-mode=${opts.dialMode}`,
        `data-dir=${opts.dataDir}`,
    ].join(", ");
}

function renderBanner(ctx: HonkBuildContext): string[] {
    return [
        "# 由 override-rules 的 honk 覆写动态生成，请勿直接编辑。",
        "# 入口：src/main-honk.ts → convert-honk.min.js（Sub-Store 覆写）。",
        "# 目标客户端：honk (https://github.com/daeuniverse/honk)，dae 兼容语法。",
        `# 参数：${renderParameterFingerprint(ctx)}`,
        "# honk 侧无对应概念、已从 mihomo 语义裁剪的字段：landing / dialer-proxy 链式代理、",
        "# Tailscale outbound、fake-ip、sniffer、tcp-keepalive、tun、manual、GLOBAL。",
        "",
    ];
}

/**
 * 渲染完整的 `config.dae` 文本（末尾含换行）。
 * @param ctx - honk 构建上下文
 * @param inlinedRuleSets - 已读取的 `ruleset/*.list`；运行时覆写通常传空对象，
 *   自维护 ruleset 会退化到 geosite 近似或注释提示
 */
export function renderHonkConfig(ctx: HonkBuildContext, inlinedRuleSets: InlineRuleSetMap): string {
    const routingLines = buildHonkRoutingLines(ctx, inlinedRuleSets);

    const sections: string[][] = [
        renderBanner(ctx),
        renderSubscriptionBlock(ctx),
        buildHonkGroups(ctx),
        buildHonkDns(ctx.flags, ctx.opts),
        ["routing {", ...routingLines, "}"],
        buildHonkGlobal(ctx.opts),
        buildHonkAssets(),
        buildHonkExperimental(ctx.opts),
    ];

    return `${sections.map((lines) => lines.join("\n")).join("\n\n")}\n`;
}
