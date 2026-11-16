import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    HONK_GROUP_NAMES,
    HONK_POLICIES,
    HONK_POLICY_VALUES,
    assertHonkCountryMappings,
    honkCountryName,
    isHonkPolicy,
    requireHonkName,
    toHonkName,
} from "../../src/catalog/honk-groups";
import { PROXY_GROUPS } from "../../src/catalog/group-names";

describe("HONK_GROUP_NAMES", () => {
    it("覆盖 PROXY_GROUPS 的每个键", () => {
        const proxyKeys = Object.keys(PROXY_GROUPS).sort();
        const honkKeys = Object.keys(HONK_GROUP_NAMES).sort();
        assert.deepEqual(honkKeys, proxyKeys);
    });

    it("honk 组名只使用 [A-Za-z0-9]", () => {
        for (const [key, value] of Object.entries(HONK_GROUP_NAMES)) {
            if (value === null) continue;
            assert.match(value, /^[A-Za-z0-9]+$/, `${key} 含有 honk 不接受的字符: ${value}`);
        }
    });

    it("落地/前置/Tailscale/GLOBAL/MANUAL/AdBlock/SogouInput 在 honk 无对应", () => {
        assert.equal(HONK_GROUP_NAMES.LANDING, null);
        assert.equal(HONK_GROUP_NAMES.FRONT_PROXY, null);
        assert.equal(HONK_GROUP_NAMES.TAILSCALE, null);
        assert.equal(HONK_GROUP_NAMES.GLOBAL, null);
        assert.equal(HONK_GROUP_NAMES.MANUAL, null);
        assert.equal(HONK_GROUP_NAMES.AD_BLOCK, null);
        assert.equal(HONK_GROUP_NAMES.SOGOU_INPUT, null);
    });
});

describe("toHonkName", () => {
    it("正向命中：Clash 中文名 → honk ASCII 名", () => {
        assert.equal(toHonkName(PROXY_GROUPS.SELECT), "Select");
        assert.equal(toHonkName(PROXY_GROUPS.AI_SERVICE), "AI");
        assert.equal(toHonkName(PROXY_GROUPS.EHENTAI), "EHentai");
        assert.equal(toHonkName(PROXY_GROUPS.TRUTH_SOCIAL), "TruthSocial");
        assert.equal(toHonkName(PROXY_GROUPS.PT_SITE), "PT");
    });

    it("反向空值：无 honk 对应时返回 null", () => {
        assert.equal(toHonkName(PROXY_GROUPS.LANDING), null);
        assert.equal(toHonkName(PROXY_GROUPS.TAILSCALE), null);
        assert.equal(toHonkName(PROXY_GROUPS.AD_BLOCK), null);
    });

    it("未知组名返回 null", () => {
        assert.equal(toHonkName("不存在的组"), null);
    });
});

describe("requireHonkName", () => {
    it("非 null 键返回组名", () => {
        assert.equal(requireHonkName("SELECT"), "Select");
        assert.equal(requireHonkName("FINAL"), "Final");
    });

    it("null 键抛错", () => {
        assert.throws(() => requireHonkName("LANDING"), /honk 组名未映射/);
        assert.throws(() => requireHonkName("AD_BLOCK"), /honk 组名未映射/);
    });
});

describe("honkCountryName", () => {
    it("countriesMeta 的每个地区都有映射", () => {
        assert.doesNotThrow(() => assertHonkCountryMappings());
    });

    it("覆盖常见地区的 ASCII 组名", () => {
        assert.equal(honkCountryName("香港"), "HK");
        assert.equal(honkCountryName("美国"), "US");
        assert.equal(honkCountryName("日本"), "JP");
        assert.equal(honkCountryName("英国"), "UK");
    });

    it("未收录地区回退到 ASCII 剥离，仍为空则用 Region 占位", () => {
        assert.equal(honkCountryName("Singapore"), "Singapore");
        assert.equal(honkCountryName("未知地区"), "Region");
    });
});

describe("HONK_POLICIES", () => {
    it("三种 grouptype 各自映射到 honk policy", () => {
        assert.equal(HONK_POLICIES[0], "select");
        // grouptype=1 默认走 score（honk 侧推荐），与 mihomo 侧“自动选”语义对齐。
        assert.equal(HONK_POLICIES[1], "score");
        assert.equal(HONK_POLICIES[2], "loadbalance");
    });
});

describe("HONK_POLICY_VALUES / isHonkPolicy", () => {
    it("白名单包含规范名与 dae 兼容写法", () => {
        for (const expected of [
            "select",
            "selector",
            "fixed",
            "urltest",
            "min_moving_avg",
            "min_avg10",
            "min_last_delay",
            "loadbalance",
            "roundrobin",
            "round_robin",
            "balance",
            "fallback",
            "score",
        ]) {
            assert.ok(HONK_POLICY_VALUES.includes(expected), `白名单缺少 ${expected}`);
        }
    });

    it("isHonkPolicy 接受白名单值，忽略大小写", () => {
        assert.ok(isHonkPolicy("select"));
        assert.ok(isHonkPolicy("SELECT"));
        assert.ok(isHonkPolicy(" score "));
        assert.ok(isHonkPolicy("min_moving_avg"));
    });

    it("isHonkPolicy 接受 fixed(N) 写法", () => {
        assert.ok(isHonkPolicy("fixed(0)"));
        assert.ok(isHonkPolicy("fixed(3)"));
    });

    it("isHonkPolicy 拒绝非法值与空输入", () => {
        assert.ok(!isHonkPolicy(undefined));
        assert.ok(!isHonkPolicy(""));
        assert.ok(!isHonkPolicy("url-test"));
        assert.ok(!isHonkPolicy("auto"));
        assert.ok(!isHonkPolicy("unknown-policy"));
    });
});
