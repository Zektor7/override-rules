import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectPreferNodes } from "../../src/analysis/prefer-nodes";

describe("collectPreferNodes", () => {
    const nodes = [{ name: "香港 01" }, { name: "香港 02" }, { name: "美国 01" }];

    it("无模式时返回空数组", () => {
        assert.deepEqual(collectPreferNodes(nodes, null), []);
        assert.deepEqual(collectPreferNodes(nodes, []), []);
    });

    it("按正则模式命中节点且大小写不敏感", () => {
        assert.deepEqual(collectPreferNodes(nodes, ["香港 01"]), ["香港 01"]);
        assert.deepEqual(collectPreferNodes(nodes, ["香港.*0[12]"]), ["香港 01", "香港 02"]);
        assert.deepEqual(collectPreferNodes(nodes, ["^US", "香港 02"]), ["香港 02"]);
    });

    it("非法正则时忽略优先选择逻辑而不是抛错", () => {
        assert.deepEqual(collectPreferNodes(nodes, ["[unclosed"]), []);
    });

    it("跳过没有名称的节点", () => {
        assert.deepEqual(collectPreferNodes([{ name: "" }, { name: "香港 01" }], ["香港"]), [
            "香港 01",
        ]);
    });
});
