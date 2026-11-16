/**
 * 生成 honk `global {}` 段落。
 *
 * 参考 kenzok8 与 qichiyuhub 的模板默认值：`lan_interface` 用户按自己网卡改；
 * `data_dir` 默认 `/etc/honk`（OpenWrt 持久化路径），`dial_mode: domain` 让分流
 * 规则可以直接命中域名。
 *
 * 与 Clash 的 `tun` / `keepalive` / `full` 参数无对应：honk 是 eBPF 透明代理，
 * 内核参数由 `auto_config_kernel_parameter` 统一管理。
 */

export function buildHonkGlobal(): string[] {
    return [
        "global {",
        "    wan_interface: auto",
        "    lan_interface: br-lan # 按机器实际网卡修改，`ip a` 查看",
        "    log_level: info",
        "    dial_mode: domain",
        "    allow_insecure: false",
        "    auto_config_kernel_parameter: true",
        "    data_dir: '/etc/honk'",
        "    store_subscribe: true",
        "    nfqueue_enable: true",
        "}",
    ];
}
