/**
 * 外部资源与测速服务的端点地址。
 */

/** 默认使用的 jsDelivr CDN 前缀。 */
export const CDN_URL = "https://cdn.jsdelivr.net";

/**
 * 本项目自有资源（`ruleset/*.list` 与 `icons/*.png`）的 jsDelivr 基址。
 *
 * 指向哪个仓库/分支由这里统一控制：上游主仓库为 `powerfullz/override-rules@master`，
 * Fork 私有部署需改成自己的仓库与分支，否则新增的 ruleset 文件会因上游不存在而 404。
 */
export const PROJECT_URL = `${CDN_URL}/gh/Zektor7/override-rules@main`;

/** 用于 url-test / fallback 代理组的测速地址。 */
export const SPEEDTEST_URL = "https://cp.cloudflare.com";
