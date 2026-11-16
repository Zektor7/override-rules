/**
 * 生成 honk `assets {}` 段落。
 *
 * honk 的 `assets.geodata` 直接指定 geosite/geoip 数据下载地址；沿用现有
 * `builders/geox.ts` 的 CDN URL，避免与 Clash 分支维护两份常量。
 *
 * `subscription.ua` 沿用 honk 生态通行写法 `clash.meta/1.19.30`——部分机场
 * 会按 UA 判定分发格式，用 mihomo UA 可拿到最完整的 Clash YAML 正文。
 */

import { geoxUrl } from "../geox";

/** 渲染 `assets {}` 段（含首尾大括号）。 */
export function buildHonkAssets(): string[] {
    return [
        "assets {",
        "    route: direct",
        "    subscription {",
        "        ua: 'clash.meta/1.19.30'",
        "        interval: 86400s",
        "        cache: true",
        "    }",
        "    geodata {",
        `        geosite: '${geoxUrl.geosite}'`,
        `        geoip: '${geoxUrl.geoip}'`,
        "        route: direct",
        "    }",
        "}",
    ];
}
