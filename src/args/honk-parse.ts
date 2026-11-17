/**
 * honk 侧 URL 参数解析。
 *
 * 与 `parse.ts` 里的 `buildFeatureFlags()` 平行：`buildFeatureFlags` 负责 mihomo 与
 * honk **共用**的开关（grouptype / include / exclude / prefer / adblock / ipv6 / quic /
 * threshold），`buildHonkRuntimeOptions()` 只处理 honk **独有**的策略字段
 * （订阅、policy、URLTest 调优、DNS 上游）。`global {}` 与 `experimental {}` 属于部署层，
 * 交给用户的 `system.dae`，本项目不再解析相关参数。
 *
 * 布尔字段沿用 `parseBool`：接受 `true/false` 与 `1/0`（大小写不敏感）。
 * 字符串字段除 `subscription` 会尝试 URL 解码外，其余按 trim 后的原样取值；
 * 空字符串视为"未提供"，回退到默认值。
 */

import { HONK_ARG_DEFAULTS } from "./honk-schema";
import { HONK_POLICIES, isHonkPolicy } from "../catalog/honk-groups";
import { parseBool, parseNumber } from "../utils/primitives";
import type { FeatureFlags } from "../types/args";
import type {
    HonkFileContext,
    HonkRequestContext,
    HonkRuntimeOptions,
    HonkScriptArgs,
} from "../types/honk";

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
 * 取 `sub-base` 基础地址：允许 URL 编码，空/未提供回退到空串（表示未启用自动关联）。
 * 与 `readSubscriptionUrl` 不同，这里用空串做 fallback，避免占位 URL 被误当成基础地址。
 */
function readBaseUrl(raw: string | undefined): string {
    const value = readString(raw, "");
    if (!value) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** 去掉结尾多余斜杠，保证与 `/download/...` 拼接时不出现双斜杠。 */
function trimTrailingSlashes(base: string): string {
    let trimmed = base.trim();
    while (trimmed.endsWith("/")) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
}

/**
 * 拼出 SubStore 的通用下载链接（`.../download/...`），供 honk 周期重拉同一份来源。
 *
 * 组合订阅（collection）与单条订阅（subscription）在 SubStore 里的下载路径不同：
 * collection → `/download/collection/<name>`；subscription → `/download/<name>`。
 * `local` / `remote` / `none` 等来源没有独立的可重拉地址，返回 `null` 表示无法自动关联。
 */
function buildDownloadUrl(base: string, sourceType: string, sourceName: string): string | null {
    const trimmed = trimTrailingSlashes(base);
    if (sourceType === "collection") {
        return `${trimmed}/download/collection/${sourceName}`;
    }
    if (sourceType === "subscription") {
        return `${trimmed}/download/${sourceName}`;
    }
    return null;
}

/**
 * 从文件自身的远程地址里认出 SubStore 的下载链接。
 *
 * 「文件」类型下 `$file.url` 就是组合订阅的下载地址（用户填的远程 URL），
 * 它本身就是 honk 该周期重拉的地址，去掉查询串（`?target=clash` 等只影响
 * SubStore 的输出格式）后直接可用。非下载链接（外部 Clash 配置等）返回 `null`。
 */
function readDownloadUrlFromFile(fileContext: HonkFileContext | null): string | null {
    const raw = fileContext?.url?.trim();
    if (!raw) return null;
    if (!/\/download\/(?:collection\/)?[^/?#]+/.test(raw)) return null;
    return raw.split("#")[0].split("?")[0];
}

/** 读取请求头（大小写不敏感，多值时取第一个）。 */
function readHeader(
    headers: Record<string, string | string[] | undefined> | undefined,
    name: string
): string | undefined {
    if (!headers) return undefined;
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== target) continue;
        if (Array.isArray(value)) return value[0];
        return value;
    }
    return undefined;
}

/**
 * 从 Sub-Store 的请求快照反推服务基础地址（协议 + host + 后端路径前缀）。
 *
 * 文件下载走 `/api/file/<name>`（或分享用的 `/share/file/<name>`），把这一段
 * 去掉剩下的就是基础地址，例如 `http://sub.example.com/tdtVuezFG`。
 * 这样用户不必再手填 `#sub-base=`；协议优先取 `x-forwarded-proto`（反代场景），
 * 其余按 `http` 处理（局域网自建 Sub-Store 的常见形态）。
 */
function deriveBaseFromRequest(requestContext: HonkRequestContext | null): string {
    const raw = requestContext?.url?.trim();
    if (!raw) return "";

    const headers = requestContext?.headers;
    let protocol = "";
    let host = "";
    let path = "";

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            protocol = parsed.protocol.replace(":", "");
            host = parsed.host;
            path = parsed.pathname;
        } catch {
            return "";
        }
    } else {
        path = raw.split("?")[0];
        host = readHeader(headers, "host") ?? "";
        if (!host) return "";
        const forwarded = readHeader(headers, "x-forwarded-proto");
        const trimmed = forwarded?.split(",")[0]?.trim();
        protocol = trimmed && trimmed.length > 0 ? trimmed : "http";
    }

    const matched = /^(.*)\/(?:api|share)\/file\/[^/]*$/.exec(path);
    const basePath = matched ? matched[1] : "";
    return `${protocol}://${host}${basePath}`;
}

/**
 * 解析订阅 URL 的最终取值，优先级：
 * 1. 显式 `#subscription=`（最高，兼容旧行为）；
 * 2. 文件自身的下载地址（「文件」类型下 `$file.url` 就是组合订阅下载链接）；
 * 3. 基础地址（`#sub-base=` 或从请求 URL 反推）+ `$file` 的来源信息自动拼接；
 * 4. 占位 URL（提示用户手动替换）。
 */
function resolveSubscriptionUrl(
    args: HonkScriptArgs,
    fileContext: HonkFileContext | null,
    requestContext: HonkRequestContext | null
): string {
    const explicit = readSubscriptionUrl(args.subscription);
    if (explicit !== HONK_ARG_DEFAULTS.subscriptionUrl) return explicit;

    const fromFile = readDownloadUrlFromFile(fileContext);
    if (fromFile) return fromFile;

    const base = readBaseUrl(args["sub-base"]) || deriveBaseFromRequest(requestContext);
    const sourceType = fileContext?.sourceType;
    const sourceName = fileContext?.sourceName;
    if (base && sourceType && sourceName) {
        const url = buildDownloadUrl(base, sourceType, sourceName);
        if (url) return url;
    }

    return HONK_ARG_DEFAULTS.subscriptionUrl;
}

/**
 * 取正整数：非法值（NaN / 负数 / 0 视场景）返回 `null` 让 honk 侧走默认；
 * honk 明确 `tolerance >= 1ms`、`idle_timeout` 允许 0（每次选择后进入空闲）。
 */
function readPositiveInt(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    const parsed = parseNumber(trimmed, Number.NaN);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
}

/**
 * 决定最终 policy。
 *
 * 优先级：显式 `#policy=<value>`（需通过白名单）> `#grouptype=<0|1|2>` 的映射 > 默认 `score`。
 * 保留 `fixed(N)` 的括号后缀，honk 自己会剥离。
 * 这样保持与 mihomo 分支的向后兼容：只传 grouptype 的用户拿到映射结果；
 * 只传 policy 的用户拿到精确策略；都不传时 honk 侧走推荐的 score。
 */
function readPolicy(raw: string | undefined, flags: FeatureFlags): string {
    const fallback = HONK_POLICIES[flags.groupType];
    if (raw === undefined) return fallback;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0) return fallback;
    // fixed(N) 保留括号后缀，honk 解析器会自己处理。
    if (/^fixed\(\d+\)$/.test(trimmed)) return trimmed;
    if (isHonkPolicy(trimmed)) return trimmed;
    return fallback;
}

/**
 * 解析 honk 独有参数。
 * @param args - `$arguments` 原始对象（只取 honk 独有字段，共用字段由 `buildFeatureFlags` 处理）
 * @param flags - 已经过 `buildFeatureFlags` 的共用参数解析结果，用于 grouptype → policy 回退
 * @param fileContext - SubStore 文件处理作用域暴露的 `$file`；非 SubStore 环境传 `null`
 * @param requestContext - SubStore 暴露的 `$options._req`；用于反推服务基础地址
 */
export function buildHonkRuntimeOptions(
    args: HonkScriptArgs,
    flags: FeatureFlags,
    fileContext: HonkFileContext | null = null,
    requestContext: HonkRequestContext | null = null
): HonkRuntimeOptions {
    const checkUrlRaw = args["check-url"]?.trim();
    return {
        subscriptionUrl: resolveSubscriptionUrl(args, fileContext, requestContext),
        subscriptionTag: readString(args.subtag, HONK_ARG_DEFAULTS.subscriptionTag),
        subscriptionInterval: readString(
            args["sub-interval"],
            HONK_ARG_DEFAULTS.subscriptionInterval
        ),
        subscriptionRoute: readString(args["sub-route"], HONK_ARG_DEFAULTS.subscriptionRoute),
        subscriptionCache: readBool(args["sub-cache"], HONK_ARG_DEFAULTS.subscriptionCache),
        subscriptionUa: readString(args["sub-ua"], HONK_ARG_DEFAULTS.subscriptionUa),

        policy: readPolicy(args.policy, flags),
        tolerance: readPositiveInt(args.tolerance),
        idleTimeout: readPositiveInt(args["idle-timeout"]),
        checkUrl: checkUrlRaw && checkUrlRaw.length > 0 ? checkUrlRaw : null,
        interruptConnections: readBool(args.interrupt, HONK_ARG_DEFAULTS.interruptConnections),

        dnsDefaultUpstream: readString(args["dns-default"], HONK_ARG_DEFAULTS.dnsDefaultUpstream),
        dnsRemoteUpstream: readString(args["dns-remote"], HONK_ARG_DEFAULTS.dnsRemoteUpstream),
        dnsRemoteExit: readString(args["dns-remote-exit"], HONK_ARG_DEFAULTS.dnsRemoteExit),
        dnsClientSubnet: readString(args["dns-client-subnet"], HONK_ARG_DEFAULTS.dnsClientSubnet),
    };
}
