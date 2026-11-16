/**
 * honk 侧 URL 参数解析。
 *
 * 与 `parse.ts` 里的 `buildFeatureFlags()` 平行：`buildFeatureFlags` 负责 mihomo 与
 * honk **共用**的开关（grouptype / include / exclude / prefer / adblock / ipv6 / quic /
 * threshold），`buildHonkRuntimeOptions()` 只处理 honk **独有**的策略字段
 * （订阅与 DNS 上游）。`global {}` 与 `experimental {}` 属于部署层，交给
 * 用户的 `system.dae`，本项目不再解析相关参数。
 *
 * 布尔字段沿用 `parseBool`：接受 `true/false` 与 `1/0`（大小写不敏感）。
 * 字符串字段除 `subscription` 会尝试 URL 解码外，其余按 trim 后的原样取值；
 * 空字符串视为"未提供"，回退到默认值。
 */

import { HONK_ARG_DEFAULTS } from "./honk-schema";
import { parseBool } from "../utils/primitives";
import type { HonkRuntimeOptions, HonkScriptArgs } from "../types/honk";

/** 取字符串：空/仅空白视为未提供，回退到 `fallback`。 */
function readString(raw: string | undefined, fallback: string): string {
    if (raw === undefined) return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * 取订阅 URL：允许用户传 URL 编码后的地址（Sub-Store hash 里 `#subscription=https%3A%2F%2F...`）。
 * 解码失败时保留原文，避免把非法编码整体吞掉。
 */
function readSubscriptionUrl(raw: string | undefined): string {
    const value = readString(raw, HONK_ARG_DEFAULTS.subscriptionUrl);
    if (value === HONK_ARG_DEFAULTS.subscriptionUrl) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** 取布尔：`undefined` 走默认值；否则交给 `parseBool` 处理 `true/false/1/0`。 */
function readBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    return parseBool(raw, fallback);
}

/**
 * 解析 honk 独有参数。
 * @param args - `$arguments` 原始对象（只取 honk 独有字段，共用字段由 `buildFeatureFlags` 处理）
 */
export function buildHonkRuntimeOptions(args: HonkScriptArgs): HonkRuntimeOptions {
    return {
        subscriptionUrl: readSubscriptionUrl(args.subscription),
        subscriptionTag: readString(args.subtag, HONK_ARG_DEFAULTS.subscriptionTag),
        subscriptionInterval: readString(
            args["sub-interval"],
            HONK_ARG_DEFAULTS.subscriptionInterval
        ),
        subscriptionRoute: readString(args["sub-route"], HONK_ARG_DEFAULTS.subscriptionRoute),
        subscriptionCache: readBool(args["sub-cache"], HONK_ARG_DEFAULTS.subscriptionCache),
        subscriptionUa: readString(args["sub-ua"], HONK_ARG_DEFAULTS.subscriptionUa),

        dnsDefaultUpstream: readString(args["dns-default"], HONK_ARG_DEFAULTS.dnsDefaultUpstream),
        dnsRemoteUpstream: readString(args["dns-remote"], HONK_ARG_DEFAULTS.dnsRemoteUpstream),
        dnsRemoteExit: readString(args["dns-remote-exit"], HONK_ARG_DEFAULTS.dnsRemoteExit),
        dnsClientSubnet: readString(args["dns-client-subnet"], HONK_ARG_DEFAULTS.dnsClientSubnet),
    };
}
