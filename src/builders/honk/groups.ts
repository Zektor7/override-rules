/**
 * 生成 honk `group {}` 段落。
 *
 * honk 组只包含「节点集合 + 策略」两个维度：`filter` 决定成员，`policy` 决定选点。
 * Clash 侧的候选列表（引用其他组）在 honk 没有等价物，因此 Select/Auto/Fallback/Final
 * 都直接以 `ALL_NODES_FILTER` 覆盖全订阅，用户在 Doona 面板里各挑一个即可。
 *
 * 落地/前置/Tailscale/AdBlock/SogouInput 等 Clash 概念在 honk 没有对应：
 * - 落地/前置/Tailscale：跳过（`HONK_GROUP_NAMES` 对应值为 `null`）；
 * - AdBlock/SogouInput：不建组，路由规则直接指向 `block` / `direct`。
 */

import {
    HONK_POLICIES,
    honkCountryName,
    requireHonkName,
    toHonkName,
} from "../../catalog/honk-groups";
import { serviceGroups } from "../../catalog/service-groups";
import { ALL_NODES_FILTER, countryFilter, lowCostFilter, preferFilter } from "./filter";
import type { HonkBuildContext, HonkGroupSpec } from "../../types/honk";

/** 单个 honk 组的字段渲染顺序：filter → policy → final → interrupt_connections。 */
function renderGroup(spec: HonkGroupSpec): string[] {
    const lines = [
        `    ${spec.name} {`,
        `        filter: ${spec.filter}`,
        `        policy: ${spec.policy}`,
    ];
    if (spec.final) lines.push(`        final: ${spec.final}`);
    if (spec.interruptConnections) lines.push(`        interrupt_connections: true`);
    lines.push(`    }`);
    return lines;
}

/**
 * 组装完整的 honk 组声明（未加 `group {` 外壳）。
 *
 * 顺序：Prefer（若启用）→ 三大主选择器 → 服务组 → 地区组 → LowCost → Final。
 * 与 Clash 侧的顺序基本对齐，方便人工比对；honk 本身不在意组声明顺序。
 */
export function buildHonkGroupSpecs(ctx: HonkBuildContext): HonkGroupSpec[] {
    const policy = HONK_POLICIES[ctx.flags.groupType];
    const specs: HonkGroupSpec[] = [];

    // Prefer（本 Fork 新增）：命中 prefer 时置于首位，不可用时回退到 Auto。
    const prefer = preferFilter(ctx.flags.preferPatterns);
    if (prefer) {
        specs.push({
            name: requireHonkName("PREFER"),
            filter: prefer,
            policy: "fallback",
            final: requireHonkName("AUTO"),
        });
    }

    // 主选择器：Select 手动、Auto 走 grouptype、Fallback 走首个存活。
    specs.push({
        name: requireHonkName("SELECT"),
        filter: ALL_NODES_FILTER,
        policy: "select",
        interruptConnections: true,
    });
    specs.push({ name: requireHonkName("AUTO"), filter: ALL_NODES_FILTER, policy });
    specs.push({ name: requireHonkName("FALLBACK"), filter: ALL_NODES_FILTER, policy: "fallback" });

    // 服务组：沿用 serviceGroups 目录，逐个转成 ASCII 组名；
    // 未映射的（当前只有 SogouInput/AdBlock 被主动置为 null）跳过建组，
    // 由 `builders/honk/rules.ts` 把命中的规则直接路由到 `block` / `direct`。
    for (const svc of serviceGroups) {
        const honkName = toHonkName(svc.name);
        if (!honkName) continue;
        // 服务组与 Select 走同一份 filter，让用户按服务单独挑节点；
        // FINANCE/MICROSOFT 这类「默认直连优先」的语义在 honk 里通过用户手动选
        // direct（Doona 面板支持）或路由规则覆盖，不再区分建组默认。
        specs.push({ name: honkName, filter: ALL_NODES_FILTER, policy: "select" });
    }

    // 地区组：按 `regionLayout.groupedCountries` 顺序，展平模式下这里为空、
    // 由 Select/Auto/Fallback 直接兜住全部非落地节点。
    for (const country of ctx.nodes.regionLayout.groupedCountries) {
        specs.push({
            name: honkCountryName(country),
            filter: countryFilter(country),
            policy,
        });
    }

    // LowCost：无论订阅是否命中低倍率节点都建组（对齐 `yamls/` 的 regex=true 模式），
    // 避免静态产物因假节点集合过窄而缺失该组。
    specs.push({
        name: requireHonkName("LOW_COST"),
        filter: lowCostFilter(),
        policy: "min_moving_avg",
    });

    // Final：honk 侧兜底，`policy: score` 参考 kenzok8 模板按实际业务观察打分。
    specs.push({
        name: requireHonkName("FINAL"),
        filter: ALL_NODES_FILTER,
        policy: "score",
        interruptConnections: true,
    });

    return specs;
}

/** 渲染 `group {}` 段（含首尾大括号）为字符串数组，便于上层按行拼接。 */
export function buildHonkGroups(ctx: HonkBuildContext): string[] {
    const lines = ["group {"];
    for (const spec of buildHonkGroupSpecs(ctx)) {
        lines.push(...renderGroup(spec));
    }
    lines.push("}");
    return lines;
}
