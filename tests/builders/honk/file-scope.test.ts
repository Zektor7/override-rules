import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { buildHonkFileScope } from "../../../src/builders/honk/file-scope";
import type { HonkEntryArgs } from "../../../src/builders/honk/script";
import type { HonkFileContext, HonkRequestContext } from "../../../src/types/honk";

/**
 * Sub-Store 会把 YAML 解析器以 `yaml` 注入脚本作用域；这里用同名全局变量模拟，
 * 让 `file-scope.ts` 里的自由变量能解析到。
 */
(globalThis as Record<string, unknown>).yaml = { parse: parseYaml };

const CLASH_YAML = stringifyYaml({
    proxies: [
        { name: "香港01", type: "ss", server: "a.example.com", port: 443 },
        { name: "香港02", type: "ss", server: "b.example.com", port: 443 },
        { name: "美国01", type: "ss", server: "c.example.com", port: 443 },
        { name: "美国02", type: "ss", server: "d.example.com", port: 443 },
    ],
});

const FILE_CONTEXT: HonkFileContext = {
    type: "mihomoConfig",
    sourceType: "collection",
    sourceName: "full",
};

const REQUEST_CONTEXT: HonkRequestContext = {
    url: "/tdtVuezFG/api/file/honk",
    headers: { host: "sub.192-168-1-184.nip.io" },
};

describe("buildHonkFileScope 文件作用域", () => {
    it("把上游 Clash YAML 转成 config.dae 文本", () => {
        const result = buildHonkFileScope(CLASH_YAML, {}, FILE_CONTEXT, REQUEST_CONTEXT);
        assert.equal(typeof result, "string");
        assert.match(result, /^# 由 override-rules 的 honk 覆写动态生成/);
        assert.match(result, /group \{[\s\S]*Final \{/);
        assert.ok(!result.includes("proxies:"), "产物应是 dae 文本而不是 Clash YAML");
    });

    it("从请求地址反推 SubStore 基础地址，自动关联组合订阅下载地址", () => {
        const result = buildHonkFileScope(CLASH_YAML, {}, FILE_CONTEXT, REQUEST_CONTEXT);
        assert.match(
            result,
            /my_sub: 'http:\/\/sub\.192-168-1-184\.nip\.io\/tdtVuezFG\/download\/collection\/full'/
        );
    });

    it("文件自身的下载地址优先于请求地址反推", () => {
        const result = buildHonkFileScope(
            CLASH_YAML,
            {},
            {
                type: "file",
                url: "http://sub.example.com/base/download/collection/full?target=clash",
            },
            REQUEST_CONTEXT
        );
        assert.match(
            result,
            /my_sub: 'http:\/\/sub\.example\.com\/base\/download\/collection\/full'/
        );
    });

    it("显式 subscription 参数优先级最高", () => {
        const args: HonkEntryArgs = { subscription: "https://explicit.example/token" };
        const result = buildHonkFileScope(CLASH_YAML, args, FILE_CONTEXT, REQUEST_CONTEXT);
        assert.match(result, /my_sub: 'https:\/\/explicit\.example\/token'/);
    });

    it("上游内容解析不出节点时给出明确报错", () => {
        assert.throws(
            () => buildHonkFileScope("这不是节点列表", {}, FILE_CONTEXT, REQUEST_CONTEXT),
            /无法从 Sub-Store 传入的上游内容里解析出节点/
        );
    });
});
