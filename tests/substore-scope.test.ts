import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as esbuild from "esbuild";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * 端到端验证 honk 覆写与 Sub-Store 的对接契约。
 *
 * 这里完整复刻 Sub-Store `ScriptOperator.nodeFunc` 的执行方式：脚本被原样内联进
 * `operator` 函数体，文件作用域里拿到 `$content` / `$file` / `$options`。
 * 断言的是 Sub-Store 真正会看到的行为，而不是我们内部的实现细节。
 */

/** 构建与发布产物完全一致的 bundle（IIFE，无外部依赖）。 */
async function buildBundle(): Promise<string> {
    const result = await esbuild.build({
        entryPoints: ["src/main-honk.ts"],
        bundle: true,
        format: "iife",
        platform: "neutral",
        target: "ES2025",
        legalComments: "none",
        charset: "utf8",
        write: false,
    });
    return result.outputFiles[0].text;
}

/**
 * 复刻 Sub-Store 注入的脚本作用域。
 *
 * 关键点：mihomoConfig 类型下 Sub-Store 会执行 `YAML.safeDump(await main(config))`，
 * 只有当全局没有 `main` 函数时才会保留脚本写回的 `$content`。
 */
function createSubStoreOperator(script: string): Function {
    return new Function(
        "$arguments",
        "$options",
        "$substore",
        "lodash",
        "ProxyUtils",
        "yaml",
        "Buffer",
        "b64d",
        "b64e",
        "DOMAIN_RESOLVERS",
        "scriptResourceCache",
        "flowUtils",
        "produceArtifact",
        "require",
        `async function operator(input = [], targetPlatform, context) {
            if (input && (input.$files || input.$content)) {
                let { $content, $files, $options, $file } = input
                if (['mihomoConfig', 'mihomoProfile'].includes($file?.type)) {
                    ${script}
                    if (typeof main === 'function') {
                        let config;
                        if ($content) {
                            try {
                                config = ProxyUtils.yaml.safeLoad($content);
                            } catch (e) {
                                console.log(e.message ?? e);
                            }
                        }
                        $content = ProxyUtils.yaml.safeDump(await main(config || {}))
                    }
                } else {
                    ${script}
                }
                return { $content, $files, $options, $file }
            } else {
                let proxies = input
                let list = []
                for await (let $server of proxies) {
                    ${script}
                    list.push($server)
                }
                return list
            }
        }
        return operator;`
    );
}

/** 按 Sub-Store 的调用方式执行一次脚本。 */
async function runInSubStore(
    script: string,
    input: unknown
): Promise<{ $content?: string; $files?: string[]; $file?: unknown } | unknown[]> {
    const factory = createSubStoreOperator(script);
    const operator = factory(
        {}, // $arguments
        (input as { $options?: unknown }).$options ?? {}, // $options
        {}, // $substore
        {}, // lodash
        PROXY_UTILS, // ProxyUtils
        YAML_MODULE, // yaml
        Buffer,
        (value: string) => value, // b64d
        (value: string) => value, // b64e
        [], // DOMAIN_RESOLVERS
        {}, // scriptResourceCache
        {}, // flowUtils
        undefined, // produceArtifact
        undefined // require
    ) as (payload: unknown) => Promise<unknown>;
    return (await operator(input)) as never;
}

/** Sub-Store 的 `utils/yaml` 默认导出：`parse` 是 `safeLoad` 的别名。 */
const YAML_MODULE = {
    safeLoad: parseYaml,
    safeDump: stringifyYaml,
    parse: parseYaml,
    stringify: stringifyYaml,
};

const PROXY_UTILS = {
    yaml: YAML_MODULE,
};

const CLASH_YAML = stringifyYaml({
    proxies: [
        { name: "香港01", type: "ss", server: "a.example.com", port: 443 },
        { name: "香港02", type: "ss", server: "b.example.com", port: 443 },
        { name: "美国01", type: "ss", server: "c.example.com", port: 443 },
        { name: "美国02", type: "ss", server: "d.example.com", port: 443 },
    ],
});

const FILE_INPUT = {
    $files: [CLASH_YAML],
    $content: CLASH_YAML,
    $options: {
        _req: {
            url: "/tdtVuezFG/api/file/honk",
            headers: { host: "sub.192-168-1-184.nip.io" },
        },
    },
    $file: {
        type: "mihomoConfig",
        sourceType: "collection",
        sourceName: "full",
    },
};

describe("honk 覆写与 Sub-Store 的对接契约", () => {
    it("文件作用域返回裸 config.dae，而不是被 YAML 化", async () => {
        const script = await buildBundle();
        const output = (await runInSubStore(script, FILE_INPUT)) as { $content: string };

        assert.equal(typeof output.$content, "string");
        assert.match(output.$content, /^# 由 override-rules 的 honk 覆写动态生成/);
        assert.match(output.$content, /^include \{\n {4}system\.dae\n\}$/m);
        assert.ok(!output.$content.includes("proxies:"), "响应体应是 dae 文本，不能是 Clash YAML");
        assert.ok(!output.$content.startsWith("|-"), "不应被包成 YAML 块标量");
    });

    it("自动关联组合订阅的下载地址并写入 subscription 段", async () => {
        const script = await buildBundle();
        const output = (await runInSubStore(script, FILE_INPUT)) as { $content: string };

        assert.match(
            output.$content,
            /my_sub: 'http:\/\/sub\.192-168-1-184\.nip\.io\/tdtVuezFG\/download\/collection\/full'/
        );
    });

    it("全局 main 存在（mihomo 脚本残留）时也不会把 config.dae 覆盖成 YAML", async () => {
        const script = await buildBundle();
        const scope = globalThis as Record<string, unknown>;
        scope.main = () => ({ proxies: [{ name: "mihomo-node" }] });

        try {
            const output = (await runInSubStore(script, FILE_INPUT)) as { $content: string };
            assert.match(output.$content, /^# 由 override-rules 的 honk 覆写动态生成/);
            assert.ok(!output.$content.includes("mihomo-node"));
        } finally {
            delete scope.main;
        }
    });

    it("脚本在 Sub-Store 作用域里不注册全局 main", async () => {
        const script = await buildBundle();
        const scope = globalThis as Record<string, unknown>;
        delete scope.main;

        await runInSubStore(script, FILE_INPUT);

        assert.equal(typeof scope.main, "undefined");
    });

    it("挂在节点列表上时原样返回节点，并给出挂载位置提示", async () => {
        const script = await buildBundle();
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (message: unknown) => {
            warnings.push(String(message));
        };

        try {
            const nodes = [{ name: "香港01" }, { name: "美国01" }];
            const output = (await runInSubStore(script, nodes)) as unknown[];
            assert.deepEqual(output, nodes);
            assert.equal(warnings.length, 1);
            assert.match(warnings[0], /挂到「文件」上/);
        } finally {
            console.warn = originalWarn;
        }
    });
});
