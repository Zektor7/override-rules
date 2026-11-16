/**
 * 生成 honk `experimental {}` 段落。
 *
 * honk 的构建变体（full / native-api / clash-api）会各自忽略不支持的块；这里
 * 根据 `opts.enableNativeApi` / `opts.enableClashApi` 决定是否输出，用户如果
 * 用的是精简构建可以关掉对应面板入口。
 *
 * `clash-secret` 默认空串，产物会带一行提示注释让用户设置；不给默认值是为了
 * 避免把示例口令误当生产口令上线。
 */

import type { HonkRuntimeOptions } from "../../types/honk";

export function buildHonkExperimental(opts: HonkRuntimeOptions): string[] {
    const lines: string[] = ["experimental {"];

    if (opts.enableNativeApi) {
        lines.push(
            "    # Doona 面板通过 native_api 连接核心。",
            "    native_api {",
            "        enabled: true",
            `        listen: '${opts.nativeApiListen}'`,
            "        password_auth: true",
            "        allow_anonymous_loopback: false",
            "        config_write: true",
            `        ui: '${opts.nativeApiUi}'`,
            "    }"
        );
    }

    if (opts.enableClashApi) {
        const secretComment =
            opts.clashApiSecret.length === 0
                ? " # TODO: 通过 #clash-secret=<token> 设置访问口令"
                : "";
        lines.push(
            "    # 兼容 zashboard 等 Clash 面板；不需要时可通过 #clash-api=false 关掉。",
            "    clash_api {",
            `        external_controller: '${opts.clashApiController}'`,
            `        external_ui: '${opts.clashApiUi}'`,
            `        secret: '${opts.clashApiSecret}'${secretComment}`,
            "        default_mode: rule",
            "    }"
        );
    }

    lines.push("}");
    return lines;
}
