/**
 * 生成 honk `assets {}` 段落。
 *
 * - `assets.route: direct`：geodata / UI 等资源默认走 direct；
 * - `assets.geodata`：沿用 `builders/geox.ts` 的 CDN URL，与 Clash 分支共享同一份常量；
 * - 订阅相关的默认值（ua/interval/cache）在 `subscription {}` 段里显式给出，
 *   避免两处默认漂移，因此 assets 里不再输出 `subscription {}` 子段。
 */

import { geoxUrl } from "../geox";

export function buildHonkAssets(): string[] {
    return [
        "assets {",
        "    route: direct",
        "    geodata {",
        `        geosite: '${geoxUrl.geosite}'`,
        `        geoip: '${geoxUrl.geoip}'`,
        "        route: direct",
        "    }",
        "}",
    ];
}
