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
        assert.equal(opts.lanInterface, "br-lan");
        assert.equal(opts.wanInterface, "auto");
        assert.equal(opts.dialMode, "domain");
        assert.equal(opts.dataDir, "/etc/honk");
        assert.equal(opts.logLevel, "info");
        assert.equal(opts.allowInsecure, false);
        assert.equal(opts.storeSubscribe, true);
        assert.equal(opts.nfqueueEnable, true);
        assert.equal(opts.autoConfigKernelParameter, true);
        assert.equal(opts.dnsRemoteExit, "Select");
        assert.equal(opts.dnsClientSubnet, "auto");
        assert.equal(opts.enableNativeApi, true);
        assert.equal(opts.enableClashApi, true);
        assert.equal(opts.clashApiSecret, "");
    });
});

describe("buildHonkRuntimeOptions 覆盖与规整", () => {
    it("字符串字段 trim 后写入，空串/仅空白回退默认值", () => {
        const opts = buildHonkRuntimeOptions({
            "lan-iface": "  eth0  ",
            "data-dir": "   ",
            subtag: "airport-a",
        } satisfies HonkScriptArgs);
        assert.equal(opts.lanInterface, "eth0");
        assert.equal(opts.dataDir, HONK_ARG_DEFAULTS.dataDir);
        assert.equal(opts.subscriptionTag, "airport-a");
    });

    it("布尔字段接受 true/false/1/0（大小写不敏感）", () => {
        assert.equal(buildHonkRuntimeOptions({ nfqueue: "false" }).nfqueueEnable, false);
        assert.equal(buildHonkRuntimeOptions({ nfqueue: "0" }).nfqueueEnable, false);
        assert.equal(buildHonkRuntimeOptions({ "allow-insecure": "true" }).allowInsecure, true);
        assert.equal(buildHonkRuntimeOptions({ "allow-insecure": "1" }).allowInsecure, true);
        assert.equal(buildHonkRuntimeOptions({ "native-api": "0" }).enableNativeApi, false);
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

    it("clash-secret 允许显式空串，与默认值一致", () => {
        assert.equal(buildHonkRuntimeOptions({ "clash-secret": "" }).clashApiSecret, "");
        assert.equal(buildHonkRuntimeOptions({ "clash-secret": "abc" }).clashApiSecret, "abc");
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
});
