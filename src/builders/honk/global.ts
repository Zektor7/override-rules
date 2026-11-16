/**
 * 生成 honk `global {}` 段落。
 *
 * 每个字段的默认值集中在 `args/honk-schema.ts`；URL 参数可以覆盖成机器实际情况
 * （例如把 `lan-iface` 改成 `eth0`、把 `data-dir` 改成 `/var/lib/honk`）。
 *
 * honk 是 eBPF 透明代理，内核参数由 `auto_config_kernel_parameter` 统一管理，
 * 与 Clash 的 `tun` / `keepalive` / `full` 无对应概念。
 */

import type { HonkRuntimeOptions } from "../../types/honk";

export function buildHonkGlobal(opts: HonkRuntimeOptions): string[] {
    return [
        "global {",
        `    wan_interface: ${opts.wanInterface}`,
        `    lan_interface: ${opts.lanInterface} # 通过 #lan-iface=<iface> 覆盖，\`ip a\` 查看`,
        `    log_level: ${opts.logLevel}`,
        `    dial_mode: ${opts.dialMode}`,
        `    allow_insecure: ${opts.allowInsecure}`,
        `    auto_config_kernel_parameter: ${opts.autoConfigKernelParameter}`,
        `    data_dir: '${opts.dataDir}'`,
        `    store_subscribe: ${opts.storeSubscribe}`,
        `    nfqueue_enable: ${opts.nfqueueEnable}`,
        "}",
    ];
}
