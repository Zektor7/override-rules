import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFeatureFlags } from "../../src/args/parse";
import { buildHonkRuntimeOptions } from "../../src/args/honk-parse";
import { HONK_ARG_DEFAULTS } from "../../src/args/honk-schema";
import type { HonkFileContext, HonkScriptArgs } from "../../src/types/honk";
import type { ScriptArgs } from "../../src/types/args";

type Args = ScriptArgs & HonkScriptArgs;

function parse(args: Args = {}) {
    const flags = buildFeatureFlags(args);
    return buildHonkRuntimeOptions(args, flags);
}

describe("buildHonkRuntimeOptions 默认值", () => {
    it("空参数返回全部默认值，policy 走 score", () => {
        const opts = parse();
        assert.equal(opts.subscriptionUrl, HONK_ARG_DEFAULTS.subscriptionUrl);
        assert.equal(opts.subscriptionTag, "my_sub");
        assert.equal(opts.subscriptionInterval, "86400s");
        assert.equal(opts.subscriptionRoute, "direct");
        assert.equal(opts.subscriptionCache, true);
        assert.equal(opts.subscriptionUa, "clash.meta/1.19.30");
        // policy 默认 = HONK_POLICIES[grouptype=1] = score
        assert.equal(opts.policy, "score");
        assert.equal(opts.tolerance, null);
        assert.equal(opts.idleTimeout, null);
        assert.equal(opts.checkUrl, null);
        assert.equal(opts.interruptConnections, false);
        assert.equal(
            opts.dnsDefaultUpstream,
            "https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com"
        );
        assert.equal(
            opts.dnsRemoteUpstream,
            "https://8.8.8.8/dns-query?tls_server_name=dns.google"
        );
        assert.equal(opts.dnsRemoteExit, "Select");
        assert.equal(opts.dnsClientSubnet, "auto");
    });

    it("HonkRuntimeOptions 只包含策略字段，不再涉及 global/experimental", () => {
        const keys = Object.keys(parse()).sort();
        assert.deepEqual(keys, [
            "checkUrl",
            "dnsClientSubnet",
            "dnsDefaultUpstream",
            "dnsRemoteExit",
            "dnsRemoteUpstream",
            "idleTimeout",
            "interruptConnections",
            "policy",
            "subscriptionCache",
            "subscriptionInterval",
            "subscriptionRoute",
            "subscriptionTag",
            "subscriptionUa",
            "subscriptionUrl",
            "tolerance",
        ]);
    });
});

describe("buildHonkRuntimeOptions policy", () => {
    it("显式 #policy 覆盖 grouptype 映射", () => {
        assert.equal(parse({ policy: "urltest" }).policy, "urltest");
        assert.equal(parse({ policy: "loadbalance" }).policy, "loadbalance");
        assert.equal(parse({ policy: "min_moving_avg" }).policy, "min_moving_avg");
        assert.equal(parse({ policy: "fallback" }).policy, "fallback");
    });

    it("policy 大小写不敏感", () => {
        assert.equal(parse({ policy: "URLTEST" }).policy, "urltest");
        assert.equal(parse({ policy: " Score " }).policy, "score");
    });

    it("fixed(N) 保留括号后缀交给 honk 解析", () => {
        assert.equal(parse({ policy: "fixed(0)" }).policy, "fixed(0)");
    });

    it("非法 policy 回退到 grouptype 映射", () => {
        assert.equal(parse({ policy: "not-a-policy" }).policy, "score");
        assert.equal(parse({ policy: "not-a-policy", grouptype: "0" }).policy, "select");
        assert.equal(parse({ policy: "not-a-policy", grouptype: "2" }).policy, "loadbalance");
    });

    it("grouptype 未显式覆盖时按映射给出 policy", () => {
        assert.equal(parse({ grouptype: "0" }).policy, "select");
        assert.equal(parse({ grouptype: "1" }).policy, "score");
        assert.equal(parse({ grouptype: "2" }).policy, "loadbalance");
    });
});

describe("buildHonkRuntimeOptions URLTest 调优", () => {
    it("tolerance 接受非负整数，非法值回退到 null", () => {
        assert.equal(parse({ tolerance: "100" }).tolerance, 100);
        assert.equal(parse({ tolerance: "0" }).tolerance, 0);
        assert.equal(parse({ tolerance: "-1" }).tolerance, null);
        assert.equal(parse({ tolerance: "abc" }).tolerance, null);
        assert.equal(parse({ tolerance: "" }).tolerance, null);
    });

    it("idle-timeout 语义同 tolerance", () => {
        assert.equal(parse({ "idle-timeout": "60" }).idleTimeout, 60);
        assert.equal(parse({ "idle-timeout": "-5" }).idleTimeout, null);
        assert.equal(parse({}).idleTimeout, null);
    });

    it("check-url 是字符串，trim 后写入；空串归 null", () => {
        assert.equal(
            parse({ "check-url": " https://cp.cloudflare.com " }).checkUrl,
            "https://cp.cloudflare.com"
        );
        assert.equal(parse({ "check-url": "   " }).checkUrl, null);
    });

    it("interrupt 布尔接受 true/false/1/0", () => {
        assert.equal(parse({ interrupt: "true" }).interruptConnections, true);
        assert.equal(parse({ interrupt: "1" }).interruptConnections, true);
        assert.equal(parse({ interrupt: "false" }).interruptConnections, false);
    });
});

describe("buildHonkRuntimeOptions 订阅与 DNS", () => {
    it("subscription URL 编码后会自动 decode", () => {
        const raw = "https%3A%2F%2Fsub.example%2Ftoken%3Fa%3D1%26b%3D2";
        assert.equal(
            parse({ subscription: raw }).subscriptionUrl,
            "https://sub.example/token?a=1&b=2"
        );
    });

    it("subscription 明文 URL 保持原样", () => {
        assert.equal(
            parse({ subscription: "https://sub.example/token" }).subscriptionUrl,
            "https://sub.example/token"
        );
    });

    it("subscription 解码失败时保留原文（避免非法编码整体吞掉）", () => {
        assert.equal(parse({ subscription: "https://a/%zz" }).subscriptionUrl, "https://a/%zz");
    });

    it("布尔字段接受 true/false/1/0（大小写不敏感）", () => {
        assert.equal(parse({ "sub-cache": "false" }).subscriptionCache, false);
        assert.equal(parse({ "sub-cache": "0" }).subscriptionCache, false);
        assert.equal(parse({ "sub-cache": "true" }).subscriptionCache, true);
        assert.equal(parse({ "sub-cache": "1" }).subscriptionCache, true);
    });

    it("dns 参数会覆盖 upstream 与出口组", () => {
        const opts = parse({
            "dns-default": "udp://119.29.29.29:53",
            "dns-remote": "https://dns.google/dns-query",
            "dns-remote-exit": "Auto",
            "dns-client-subnet": "off",
        });
        assert.equal(opts.dnsDefaultUpstream, "udp://119.29.29.29:53");
        assert.equal(opts.dnsRemoteUpstream, "https://dns.google/dns-query");
        assert.equal(opts.dnsRemoteExit, "Auto");
        assert.equal(opts.dnsClientSubnet, "off");
    });

    it("部署层参数（lan-iface / data-dir / native-api 等）被静默忽略", () => {
        // 这些参数以前会影响 HonkRuntimeOptions；迁移到 system.dae 之后不再解析。
        // 传仍包含它们的 hash 不应 crash，但也不会影响输出。
        const legacy = {
            "lan-iface": "eth0",
            "data-dir": "/etc/custom-honk",
            "native-api": "false",
            "clash-secret": "hunter2",
        } as unknown as Args;
        const opts = parse(legacy);
        assert.equal(opts.subscriptionUrl, HONK_ARG_DEFAULTS.subscriptionUrl);
        assert.ok(!("lanInterface" in opts));
        assert.ok(!("clashApiSecret" in opts));
    });
});

describe("buildHonkRuntimeOptions 订阅连接自动关联（sub-base + $file）", () => {
    const BASE = "http://sub.192-168-1-184.nip.io/tdtVuezFG";

    function parseWithFile(args: Args, fileContext: HonkFileContext | null) {
        const flags = buildFeatureFlags(args);
        return buildHonkRuntimeOptions(args, flags, fileContext);
    }

    it("collection 来源自动拼出 /download/collection/<name>", () => {
        const opts = parseWithFile(
            { "sub-base": BASE },
            {
                sourceType: "collection",
                sourceName: "full",
            }
        );
        assert.equal(opts.subscriptionUrl, `${BASE}/download/collection/full`);
    });

    it("subscription 来源自动拼出 /download/<name>", () => {
        const opts = parseWithFile(
            { "sub-base": BASE },
            {
                sourceType: "subscription",
                sourceName: "sub",
            }
        );
        assert.equal(opts.subscriptionUrl, `${BASE}/download/sub`);
    });

    it("显式 subscription 优先于 sub-base 自动拼接", () => {
        const opts = parseWithFile(
            { subscription: "https://explicit.example/token", "sub-base": BASE },
            { sourceType: "collection", sourceName: "full" }
        );
        assert.equal(opts.subscriptionUrl, "https://explicit.example/token");
    });

    it("只有 sub-base、缺 $file 时回退占位 URL", () => {
        assert.equal(
            parseWithFile({ "sub-base": BASE }, null).subscriptionUrl,
            HONK_ARG_DEFAULTS.subscriptionUrl
        );
    });

    it("只有 $file、缺 sub-base 时回退占位 URL", () => {
        assert.equal(
            parseWithFile({}, { sourceType: "collection", sourceName: "full" }).subscriptionUrl,
            HONK_ARG_DEFAULTS.subscriptionUrl
        );
    });

    it("非可重拉来源（local）不自动关联", () => {
        assert.equal(
            parseWithFile({ "sub-base": BASE }, { sourceType: "local", sourceName: "x" })
                .subscriptionUrl,
            HONK_ARG_DEFAULTS.subscriptionUrl
        );
    });

    it("sub-base 尾部多余斜杠会被规整", () => {
        const opts = parseWithFile(
            { "sub-base": `${BASE}/` },
            {
                sourceType: "collection",
                sourceName: "full",
            }
        );
        assert.equal(opts.subscriptionUrl, `${BASE}/download/collection/full`);
    });
});
