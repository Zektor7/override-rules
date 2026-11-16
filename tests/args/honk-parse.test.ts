import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildHonkRuntimeOptions } from "../../src/args/honk-parse";
import { HONK_ARG_DEFAULTS } from "../../src/args/honk-schema";
import type { HonkScriptArgs } from "../../src/types/honk";

describe("buildHonkRuntimeOptions 默认值", () => {
    it("空参数返回全部默认值", () => {
        const opts = buildHonkRuntimeOptions({});
        assert.equal(opts.subscriptionUrl, HONK_ARG_DEFAULTS.subscriptionUrl);
        assert.equal(opts.subscriptionTag, "my_sub");
        assert.equal(opts.subscriptionInterval, "86400s");
        assert.equal(opts.subscriptionRoute, "direct");
        assert.equal(opts.subscriptionCache, true);
        assert.equal(opts.subscriptionUa, "clash.meta/1.19.30");
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
        const opts = buildHonkRuntimeOptions({});
        const keys = Object.keys(opts).sort();
        // 6 个订阅字段 + 4 个 DNS 字段
        assert.deepEqual(keys, [
            "dnsClientSubnet",
            "dnsDefaultUpstream",
            "dnsRemoteExit",
            "dnsRemoteUpstream",
            "subscriptionCache",
            "subscriptionInterval",
            "subscriptionRoute",
            "subscriptionTag",
            "subscriptionUa",
            "subscriptionUrl",
        ]);
    });
});

describe("buildHonkRuntimeOptions 覆盖与规整", () => {
    it("字符串字段 trim 后写入，空串/仅空白回退默认值", () => {
        const opts = buildHonkRuntimeOptions({
            "dns-default": "  udp://119.29.29.29:53  ",
            "dns-remote-exit": "   ",
            subtag: "airport-a",
        } satisfies HonkScriptArgs);
        assert.equal(opts.dnsDefaultUpstream, "udp://119.29.29.29:53");
        assert.equal(opts.dnsRemoteExit, HONK_ARG_DEFAULTS.dnsRemoteExit);
        assert.equal(opts.subscriptionTag, "airport-a");
    });

    it("布尔字段接受 true/false/1/0（大小写不敏感）", () => {
        assert.equal(buildHonkRuntimeOptions({ "sub-cache": "false" }).subscriptionCache, false);
        assert.equal(buildHonkRuntimeOptions({ "sub-cache": "0" }).subscriptionCache, false);
        assert.equal(buildHonkRuntimeOptions({ "sub-cache": "true" }).subscriptionCache, true);
        assert.equal(buildHonkRuntimeOptions({ "sub-cache": "1" }).subscriptionCache, true);
    });

    it("subscription 是 URL 编码时会自动 decode", () => {
        const raw = "https%3A%2F%2Fsub.example%2Ftoken%3Fa%3D1%26b%3D2";
        const opts = buildHonkRuntimeOptions({ subscription: raw });
        assert.equal(opts.subscriptionUrl, "https://sub.example/token?a=1&b=2");
    });

    it("subscription 已经是明文 URL 时也保持原样", () => {
        const opts = buildHonkRuntimeOptions({ subscription: "https://sub.example/token" });
        assert.equal(opts.subscriptionUrl, "https://sub.example/token");
    });

    it("subscription 解码失败时保留原文（避免非法编码整体吞掉）", () => {
        // `%zz` 不是合法的 percent-encoding
        const opts = buildHonkRuntimeOptions({ subscription: "https://a/%zz" });
        assert.equal(opts.subscriptionUrl, "https://a/%zz");
    });

    it("dns 参数会覆盖 upstream 与出口组", () => {
        const opts = buildHonkRuntimeOptions({
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
        const opts = buildHonkRuntimeOptions({
            "lan-iface": "eth0",
            "data-dir": "/etc/custom-honk",
            "native-api": "false",
            "clash-secret": "hunter2",
        } as HonkScriptArgs);
        assert.equal(
            opts.subscriptionUrl,
            HONK_ARG_DEFAULTS.subscriptionUrl,
            "部署层参数不应污染策略默认值"
        );
        assert.ok(!("lanInterface" in opts), "HonkRuntimeOptions 不应再有 lanInterface 字段");
        assert.ok(!("clashApiSecret" in opts), "HonkRuntimeOptions 不应再有 clashApiSecret 字段");
    });
});
