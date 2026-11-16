/**
 * 生成 honk `experimental {}` 段落。
 *
 * - `native_api`：Doona 面板接入点，默认监听 `0.0.0.0:9527`；
 * - `clash_api`：兼容 zashboard 等 Clash 面板，`secret` 留空由用户填。
 *
 * 两个块同时输出；honk 的构建变体（full / native-api / clash-api）会各自忽略
 * 不支持的部分，模板保持通用。
 */

export function buildHonkExperimental(): string[] {
    return [
        "experimental {",
        "    native_api {",
        "        enabled: true",
        "        listen: '0.0.0.0:9527'",
        "        password_auth: true",
        "        allow_anonymous_loopback: false",
        "        config_write: true",
        "        ui: 'embedded'",
        "    }",
        "    clash_api {",
        "        external_controller: '0.0.0.0:9090'",
        "        external_ui: 'zashboard'",
        "        secret: '' # 请设置访问口令",
        "        default_mode: rule",
        "    }",
        "}",
    ];
}
