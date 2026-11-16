import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runHonkEntry } from "../src/main-honk";
import type { ClashConfig } from "../src/types/clash";
import type { HonkScriptArgs } from "../src/types/honk";
import type { ScriptArgs } from "../src/types/args";

type EntryArgs = ScriptArgs & HonkScriptArgs;

const CONFIG: ClashConfig = {
    proxies: [
        { name: "香港01" },
        { name: "香港02" },
        { name: "美国01" },
        { name: "美国02" },
        { name: "官网链接" },
    ],
};

describe("runHonkEntry 契约", () => {
    it("返回 config.dae 字符串（不是对象），交给 Sub-Store 原样吐出", () => {
        const result = runHonkEntry(CONFIG, {});
        assert.equal(typeof result, "string");
        assert.match(result, /^# 由 override-rules 的 honk 覆写动态生成/);
        assert.match(result, /^include \{\n {4}system\.dae\n\}$/m);
        assert.match(result, /subscription \{[\s\S]*?\}/);
        assert.match(result, /group \{[\s\S]*Final \{/);
        assert.match(result, /routing \{[\s\S]*fallback: Final\s*\}/);
    });

    it("只输出策略骨架，不含 global / experimental 段", () => {
        const result = runHonkEntry(CONFIG, {});
        assert.ok(!/^global \{/m.test(result), "不应包含 global {} 段");
        assert.ok(!/^experimental \{/m.test(result), "不应包含 experimental {} 段");
    });

    it("proxies 缺失时抛错", () => {
        assert.throws(() => runHonkEntry({ proxies: undefined }, {}), /缺少有效的 proxies 字段/);
        assert.throws(() => runHonkEntry({}, {}), /缺少有效的 proxies 字段/);
    });

    it("参数会同时反映到 subscription 与 banner", () => {
        const result = runHonkEntry(CONFIG, {
            subscription: "https://sub.example/token",
            subtag: "airport-a",
            "sub-interval": "3600s",
            grouptype: "2",
        } satisfies EntryArgs);
        assert.match(result, /subscription=https:\/\/sub\.example\/token/);
        assert.match(result, /policy=loadbalance \(grouptype=2\)/);
        assert.match(result, /airport-a: 'https:\/\/sub\.example\/token'/);
        assert.match(result, /interval: 3600s/);
    });

    it("默认自动类组 policy=score，与 mihomo 侧 grouptype=1 同义", () => {
        const result = runHonkEntry(CONFIG, {});
        assert.match(result, /policy=score \(grouptype=1\)/);
        // 自动类组里实际写入 policy: score
        const autoIdx = result.indexOf("    Auto {");
        const autoBlock = result.slice(autoIdx, result.indexOf("\n    }", autoIdx));
        assert.match(autoBlock, /policy: score/);
    });

    it("#policy 直接覆盖 grouptype 映射", () => {
        const result = runHonkEntry(CONFIG, { grouptype: "0", policy: "urltest" });
        assert.match(result, /policy=urltest \(override grouptype=0\)/);
        const hkIdx = result.indexOf("    HK {");
        const hkBlock = result.slice(hkIdx, result.indexOf("\n    }", hkIdx));
        assert.match(hkBlock, /policy: urltest/);
        // icon 也一并写入
        assert.match(hkBlock, /icon: 'https?:\/\//);
    });

    it("自维护 ruleset 会内联到 routing 段（PT/TikTok 等）", () => {
        const result = runHonkEntry(CONFIG, {});
        // PT.list 里的 byr.pt / m-team.cc 等后缀来自 src/generated/honk-rulesets.ts
        assert.match(result, /domain\(suffix:[^)]*byr\.pt[^)]*\) -> PT/);
        // TikTok.list 里包含 tiktok.com
        assert.match(result, /domain\([^)]*tiktok\.com[^)]*\) -> TikTok/);
    });

    it("include/exclude/prefer 与 mihomo 分支语义一致", () => {
        const excludeResult = runHonkEntry(CONFIG, { exclude: "netflix" });
        assert.ok(!excludeResult.includes("domain(geosite: netflix)"));

        const includeResult = runHonkEntry(CONFIG, { include: "netflix" });
        assert.match(includeResult, /domain\(geosite: netflix\) -> Netflix/);
        assert.ok(!includeResult.includes("domain(geosite: youtube)"));

        const preferResult = runHonkEntry(CONFIG, { prefer: "香港.*01" });
        assert.match(preferResult, /Prefer \{[\s\S]*filter: name\(regex: '香港\.\*01'\)/);
        assert.match(preferResult, /final: Auto/);
    });

    it("honk 忽略 mihomo 独有参数（fakeip/tun/sniffer/keepalive）不影响输出", () => {
        const baseline = runHonkEntry(CONFIG, {});
        const withIgnored = runHonkEntry(CONFIG, {
            fakeip: "false",
            tun: "true",
            keepalive: "true",
            full: "true",
            regex: "false",
        });
        assert.equal(withIgnored, baseline);
    });

    it("honk 忽略迁移到 system.dae 的部署参数（lan-iface/data-dir/native-* 等）", () => {
        const baseline = runHonkEntry(CONFIG, {});
        const withDeploymentArgs = runHonkEntry(CONFIG, {
            "lan-iface": "eth0",
            "data-dir": "/var/lib/honk",
            "native-api": "false",
            "clash-secret": "hunter2",
        } as unknown as EntryArgs);
        assert.equal(
            withDeploymentArgs,
            baseline,
            "部署层参数已经从策略层剥离，不应影响 config.dae 输出"
        );
    });
});
