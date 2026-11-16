## powerfullz 的 Mihomo/Substore 覆写规则

![](img/cover.png)

[![](https://data.jsdelivr.com/v1/package/gh/powerfullz/override-rules/badge?style=rounded)](https://www.jsdelivr.com/package/gh/powerfullz/override-rules)

本仓库为 Mihomo/Substore 设计，提供高效、灵活的覆写规则（**不建议用于 Stash**）。核心特色如下：

* 集成 [SukkaW/Surge](https://github.com/SukkaW/Surge) 与 [217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) 等优质规则，兼容性强，覆盖面广。
* 针对 Truth Social、E-Hentai、TikTok、加密货币等场景，新增专用分流规则，满足多样化需求。
* 精简冗余，结构清晰，维护便捷。
* 深度融合 [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat) GeoSite/GeoIP，分流更精准。
* IP 规则默认添加 `no-resolve`，有效减少本地 DNS 解析，提升速度与隐私。
* 动态覆写：自动识别节点国家/地区，仅生成实际存在的分组，节点名称实时枚举，配置更智能。

> 本项目为本人自用，欢迎交流建议（Issue/PR）。如无特殊反馈，将优先满足个人需求与体验优化。

[点击访问 Forgejo 上的镜像](https://git.l3zc.com/powerfullz/override-rules)

### AFF

#### FlowerCloud

[注册链接](https://api-flowercloud.com/aff.php?aff=4352)

目前我的主力机场，也是一家老牌一线机场了，线路扎实，冗余足够，实验性节点0.2倍率，部分地区的高级节点是家宽落地，用起来还是很舒服的。

#### CNIX

[注册链接](https://nozomi.wtf/auth/register?code=2d50f605de)

开了很多年的一家机场，目前有各种针对不同运营商的优化线路。可玩性还是很高的，缺点就是审计规则比较多，而且禁止测速。

### 使用方法

**Clash Party/Sparkle**

> [!TIP]
> Clash Party 不支持给脚本传入参数，如果需要传入参数，请使用集成的 Substore。

1.  推荐直接使用 JS 动态覆写：`https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js`
2.  打开 Clash Party → 左侧「覆写」→ 粘贴上述链接导入。
3.  打开「订阅管理」→ 目标订阅右上角三个点 → 「编辑信息」→ 选择该覆写脚本 → 保存。

需要注意，Clash Party 在默认设置下还会接管 DNS 和 SNI（域名嗅探），需要手动在设置中关闭「控制 DNS 设置」和「控制域名嗅探」两个选项。

**Clash Verge 系（Clash Verge Rev、Clash Nyanpasu 等）**

直接复制需要的 YAML 格式覆写粘贴到覆写规则部分（无法自动更新）。

**SubStore**

参考[最速 Substore 订阅管理指南](https://blog.l3zc.com/2025/03/clash-subscription-convert/)。

2025/06/17 更新：新增 JavaScript 格式覆写，更易于维护，已经成为首选方式。JavaScript 格式覆写支持在脚本链接末尾加入`#`以传入参数，传入多个参数时，用`&`分隔，例如`#grouptype=2`。

目前支持的参数：

*   `grouptype`：地区代理组类型（0=手动选择 select，1=自动测速 url-test，2=负载均衡 load-balance，默认 1）
*   `ipv6`：启用 IPv6 支持（默认 false）
*   `full`：生成完整配置（适合纯内核启动，默认 false）
*   `keepalive`：启用 TCP Keep Alive（默认 false）[^fn2]
*   `fakeip`：DNS 增强模式使用 `fake-ip` 而不是 `redir-host`（开启后可能有助于解决 TUN 模式无法上网的问题；未传参时默认 `true`，显式传 `false` 时使用 `redir-host`）
*   `quic`：允许 QUIC 流量（UDP 443，默认 false）[^quic]
*   `regex`：各国家/地区代理组与分组模式下的「手动选择」组改用 `include-all` 模式，由 Mihomo 内核在运行时动态填充节点（地区组再附加正则 `filter`）；展平模式下的各服务组也直接使用同一套展平节点候选（`regex=true` 时为 `include-all`，并通过 `exclude-filter` 排除落地节点与 Tailscale 节点），而非在脚本执行时枚举节点名称（默认 false）[^regex]
*   `tun`：启用 TUN 模式（gvisor 栈，自动配置路由排除地址与 DNS 劫持，默认 false）
*   `threshold`：国家/地区节点数量小于该值时不显示分组（默认 2）；过滤后不足 2 个地区时自动展平，不再生成地区组
*   `include`：只使用指定的规则，多个用逗号分隔。例如 `#include=ADBlock,Netflix,YouTube` 只使用广告、Netflix 和 YouTube 规则
*   `exclude`：排除指定的规则，多个用逗号分隔。例如 `#exclude=EHentai,Weibo` 排除E-Hentai和微博规则。与 `include` 冲突时 `include` 优先
*   `prefer`：优先选择指定节点（匹配的是具体节点名称而非策略组），多个用逗号分隔，支持正则。匹配到的节点将组成 `fallback` 优先选路组并置于代理组首位，指定节点不可用时自动回退到「自动选择」组，节点恢复后自动切回。未指定或无匹配节点时不创建该组。例如 `#prefer=香港.*01,台湾.*02`

##### 可用的规则值参考

以下是 `include`/`exclude` 参数支持的所有规则值（大小写不敏感）：

**广告过滤：** `ADBlock`、`AdditionalFilter`、`SogouInput`

**CDN/静态资源：** `StaticResources`、`CDNResources`、`AdditionalCDNResources`

**流媒体：** `youtube`、`netflix`、`spotify`、`bilibili`、`twitch`、`bahamut`、`pikpak`

**社交媒体：** `telegram`、`twitter`、`Weibo`、`truthsocial.com`

**通用服务：** `google`、`microsoft`、`apple`、`github`、`xbox`、`category-ai-!cn`、`category-cryptocurrency`、`category-finance`、`google-play@cn`、`microsoft@cn`

**其他：** `EHentai`、`TikTok`、`SteamFix`、`GFWList`

**PT：** `PT`

**说明：** 基础规则（私有IP、CN直连、MATCH）始终保留，无需指定。建议使用 `include` 时配合你的实际需求，避免加载过多不需要的规则。
*   `adblock`：去广告规则（0=关闭，1=adrules.top，2=217heidai，3=AWAvenue，默认 3）

> **向后兼容**：旧的 `loadbalance` 参数仍然可用。当 `grouptype` 未指定时，`loadbalance=true` 等价于 `grouptype=2`，`loadbalance=false` 等价于 `grouptype=1`。

> **地区组展平**：`threshold` 过滤后不足 2 个地区时，`选择代理`、`自动选择`、`故障转移` 会直接使用非落地节点（存在落地节点时还会引用「落地节点」组），不会生成 `XX节点` 地区组，也不会生成与 `选择代理` 高度重合的「手动选择」组；各服务组也不再引用 `选择代理`，而是直接使用同一份展平节点来源。Tailscale 节点不会进入这些展平候选。`threshold=1` 且至少 2 个地区达标时仍按地区分组，并保留「手动选择」组。当某个代理组的候选列表为空时，构造层会自动补入 `DIRECT`（启用 `include-all` 的组除外），因此空订阅或全落地也不会产生空组。

[^quic]: 默认屏蔽了 QUIC 流量防止节点 UDP 性能不佳影响上网体验，如果确信节点质量良好，建议设置为 true。
[^regex]: 默认情况下覆写脚本会直接把节点都筛选好，如果想让内核来筛（比如，你在 Clash Party 客户端里额外添加了自建节点，想直接通过正则表达式筛选进入配置文件）那就打开吧。展平模式下同样使用 `include-all`，并通过 `exclude-filter` 排除落地节点与 Tailscale 节点，避免链式代理形成循环，也避免 Tailscale 混入通用选择列表。

说明：支持字符串 true/false 或 1/0；。注：预生成的 YAML 格式覆写（`yamls/` 目录）固定使用正则模式，不受此参数影响。

[^fn2]: 无特殊需求不要启用，否则会造成[移动设备异常耗电问题](https://github.com/vernesong/OpenClash/issues/2614)。

#### JS 覆写使用示例

想要国家/地区代理组自动选择延迟最低的节点，使用`grouptype=1`参数，在 Substore「脚本操作」处填入脚本链接：

```
https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert.min.js#grouptype=1
```

> 以下 `include` / `exclude` / `prefer` 与「PT站点」分流属于本 Fork 的扩展，只有本 Fork 构建的产物才认识这些参数（引用上游 `powerfullz` 的产物时它们会被静默忽略），因此示例链接指向 `Zektor7/override-rules`。

只想使用广告、Netflix 和 YouTube 规则，减少规则集数量，使用`include=ADBlock,Netflix,YouTube`参数：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#include=ADBlock,Netflix,YouTube
```

不想要 E-Hentai 和微博规则，使用`exclude=EHentai,Weibo`参数：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#exclude=EHentai,Weibo
```

组合多个参数，例如启用自动测速并排除某些规则：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#grouptype=1&exclude=EHentai,TikTok
```

不想要 PT 站点规则（同时不加载 `PT` 规则集与「PT站点」代理组），使用`exclude=PT`参数：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#exclude=PT
```

需要刷 PT 站、做种，可以使用`include`参数只保留 PT 与必需规则，减少规则集数量：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#include=PT,GFWList
```

想让某些节点（如香港01、台湾02）优先使用，不可用时自动切回自动选择：

```
https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert.min.js#prefer=香港.*01,台湾.*02
```

> `prefer` 匹配的是订阅中的具体节点名称，不是策略组名称。如果节点名称不匹配，不会创建优先选择组。

如果想第一时间体验最新加入的 ~~Bug~~ 功能，可以使用 preview 分支的 Github Raw 链接：

```
https://raw.githubusercontent.com/powerfullz/override-rules/refs/heads/preview/convert.min.js
```

### 关于 DNS 泄露的说明

很多人问用了这覆写规则跑 DNS 泄露测试说会泄露，为此我写了一篇文章澄清一些误解，具体请看[「关于 DNS 泄露及其相关误解的说明」](https://blog.l3zc.com/2026/05/dns-leak-misunderstanding/)。

### 关于部分特殊代理组的说明

**静态资源**：包含所有常见静态资源 CDN 域名、对象存储域名。大部分网站的静态资源（如图片、视频、音频、字体、JS、CSS）都有独立域名、不设置风控措施、不设置鉴权，这些静态资源可以使用 IP 不一定干净（例如 IDC 类 IP）、但是带宽更大、延时更低、而且有和大部分主流 CDN（如 Cloudflare、Akamai、Fastly、EdgeCast）在 IXP 有互联的网络出口。一般就实践经验来看，在正常上网中这部分域名产生的流量占据约 70% 左右。如果你在使用商业性质的远端策略服务提供商、且该服务上提供了低倍率节点，你可以将这部分域名分流至低倍率节点以节省流量。检测到「低倍率节点」组时，本组会自动将其置于候选首位，其余候选保持正常顺序。[^fn1]

[^fn1]: 来源：[我有特别的 Surge 配置和使用技巧](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)

**搜狗输入**：默认放行，作用是避免搜狗输入法将你输入的每一个字符自动收集并通过`get.sogou.com/q`等域名回传。隐私担忧者可以将其设置为`REJECT`，开启后会影响搜狗输入法账号同步、词库更新、问题反馈，但语音输入等其他功能可以正常使用。

~~**Play 商店修复**：~~ 修复国行设备因使用`services.googleapis.cn`域名导致的 Google Play 下载应用时的「等待中…」问题。详见：[「Google Play 商店的国内 CDN：从密码学入门到分流策略优化」](https://blog.l3zc.com/2025/03/chinese-cdn-used-by-playstore/)，已经是默认行为。

~~**Steam 修复**：~~ 用于让 Steam 客户端调用国内 CDN 及 P2P 网络下载，节省大量流量，已经是默认行为。

### 关于 PT 站点与 PT 流量的说明

默认启用。`PT` 规则集包含国内外常见 PT 站（M-Team、HDSky、CHDBits、HDHome、OurBits、PTer、TTG 等）与部分公共 Tracker/动漫资源站的域名，源文件为仓库内的`ruleset/PT.list`，Fork 后可自行增删站点。不需要的用户可直接使用`exclude=PT` 关闭，此时「PT站点」代理组与规则集也不会被输出。

**PT站点**：`select` 类型的代理组，默认以`DIRECT`优先（PT 站普遍依赖回源 IP 做连接与分享率统计，走机场 IP 容易触发异常登录或被判定为刷流）。如果需要固定出口 IP、在境外 seedbox 上管理站点，或访问被 DNS 污染/屏蔽的站点，可手动切到具体节点或地区组。

需要说明的是，本规则只处理**域名层面**的 PT 站点分流。BT/PT 下载的数据传输面向公网 peer，目标端口由对端随机分配，无法靠域名或端口规则可靠地识别，因此不会注入任何内网或端口的强制直连规则。如果需要让下载机的全部流量直连，建议在下层设备上给下载机单独指定网关，或使用客户端层面的进程分流。

### 关于链式代理的说明

对于使用机场线路配合自行购买的落地机进行链式代理的情况，在 Substore 添加自建节点时，加入`dialer-proxy: "前置代理"`脚本即可自动识别，并新增「前置代理」和「落地节点」两个代理组。检测到落地节点后，地区分类只扫描非落地节点；若订阅全部由落地节点组成，「前置代理」组仅保留 `DIRECT`。

![新增的代理组](img/dialer-group.png) ![如何配置自建节点](img/dialer-example.png)

### 关于 Tailscale 的说明

Mihomo 内核在近期的更新中支持了 Tailscale 出站，这覆写规则也做出了更新，当检测到订阅中存在`tailscale`类型的节点时，会自动配置相关的代理组、Tun 配置和分流规则，开箱即用，支持 Magic DNS，以下是 Tailscale 节点配置的示例：

「Tailscale」代理组默认带有 `hidden: true`，不会显示在客户端的代理组列表中；Tailscale 节点也不会进入「手动选择」、展平模式下的 `选择代理` / `自动选择` / `故障转移` / 各服务组，以及「前置代理」等常规候选列表，仅通过 `100.64.0.0/10`、`fd7a:115c:a1e0::/48` 和 `ts.net` 的定向分流规则使用。

```yaml
proxies:
  - name: "Tailscale出口"   # 注意节点名称不能为 Tailscale，否则会和代理组重名造成启动出错
    type: tailscale
    auth-key: tskey-auth-xxxxxxxx
    control-url: https://controlplane.tailscale.com
    ephemeral: true
    udp: true
```

### 关于自动生成的 YAML 格式覆写

除了直接引用动态构建的 JS 覆写脚本外，你也可以使用预先生成好的静态 YAML 覆写文件。这适用于某些不支持执行 JS 的客户端（例如旧版的 Clash Verge）。

> [!NOTE]
> 为了保持代码仓库的纯净，`main` 主分支不再跟踪和提交生成的产物文件（如 `convert.js` 和 `yamls/`）。
> 这些构建产物目前统一由 Github Actions 的 Release 工作流在发布 `v*` 版本时，构建并自动推送到当前分支及 Release 中；工作流会自动根据 Tag（例如 `v2.1.0`）同步 `package.json` / `package-lock.json` 的版本号，无需手动改版本。

获取 YAML 覆写文件的链接格式如下：

- **最新正式版**：`/yamls/*.yaml` (默认主分支或不带分支名)
- **特定历史版本**：`@vX.Y.Z/yamls/*.yaml`

文件命名规则依据支持的开关参数穷举，格式如下：

```text
config_gt-{0|1|2}_adblock-{0|1|2|3}_ipv6-{0|1}_full-{0|1}_keepalive-{0|1}_fakeip-{0|1}_quic-{0|1}_tun-{0|1}.yaml
```

**获取示例（开启 full，其余关闭）：**
```text
https://cdn.jsdelivr.net/gh/powerfullz/override-rules/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

**固定版本获取示例：**
```text
https://cdn.jsdelivr.net/gh/powerfullz/override-rules@v0.1.0/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
```

如果使用镜像：
```text
https://git.l3zc.com/powerfullz/override-rules/raw/branch/dist/yamls/config_gt-0_adblock-0_ipv6-0_full-1_keepalive-0_fakeip-0_quic-0_tun-0.yaml
``````

*注：CI 仅套用了一份虚拟的 `fake_proxies.json` 来模拟生成 YAML，因此它无法像 JS 动态脚本那样根据你的实际节点智能生成专属分组策略，只能保守地包含常用的国家/地区。为了最高效的分流体验，仍强烈推荐使用 JS 覆写。*

### 关于 honk 客户端的动态覆写（convert-honk.min.js）

[honk](https://github.com/daeuniverse/honk) 是 dae 的 Rust + eBPF 重写（Linux 6.12+，常见于 OpenWrt / 软路由），配置文件为 `config.dae`（dae 语法），与 Clash/Mihomo 的 YAML 存在语义鸿沟。本项目为 honk 提供一个与 `convert.min.js` **同构**的动态覆写入口 `convert-honk.min.js`：同样绑到 Sub-Store 里作为 JS Override，`main(config)` 拿到上游 Clash 对象后**直接返回一段 `config.dae` 文本**，Sub-Store 会把字符串原样吐到响应体，honk `wget` 下来就是能用的配置。

#### 使用方式（跟 mihomo 完全同构）

1. 在 Sub-Store 里新建一个 **Override**，Source 选 URL：
   ```
   https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert-honk.min.js#subscription=<url-encoded-sub>&grouptype=1&lan-iface=br-lan
   ```
2. 新建一个专给 honk 用的 **Subscription**（可以复用你现有的 collection），把上面的 Override 绑上去。
3. 客户端 GET 这个 Subscription 的 download URL，返回的就是 `config.dae` 全文，直接落到 `/etc/honk/config.dae`：
   ```bash
   wget -qO /etc/honk/config.dae.new "https://substore.example/xxx/api/subscription/<id>/download" \
     && honk-core config validate --config /etc/honk/config.dae.new \
     && mv /etc/honk/config.dae.new /etc/honk/config.dae \
     && kill -HUP $(pidof honk-core)
   ```

#### 骨架与订阅两条链分开

- **骨架**（本文件生成的 `config.dae` 本身）：**一次性 curl**。改参数、改分流规则才需要重跑；一年改不了几次。
- **节点集合**（骨架里 `subscription {}` 那个 URL）：honk **原生定时重拉**（默认 `interval: 86400s`，可通过 `#sub-interval=3600s` 缩短），机场加/减节点你不需要动 honk 或 Sub-Store，到点自己刷。想立刻刷新：`kill -HUP $(pidof honk-core)`。

推荐 `subscription` 参数指向**你现有 mihomo 那边用的 Sub-Store collection 下载 URL**（已经带 `include/exclude/prefer` 处理过的那份 Clash YAML）——这样两条链共用同一个上游，honk/mihomo 拿到的节点集合天然一致；`config.dae` 里的 `filter: name(regex: '…')` 会再对节点名字做二次匹配落到不同策略组。

#### honk 支持的传参

URL hash 里的参数用 `&` 分隔，与 mihomo 侧完全兼容。分三类：**与 mihomo 同义**、**honk 独有**、**honk 会忽略的 mihomo 参数**。

**与 mihomo 完全同义（详见上文「JS 覆写使用示例」，此处只列差异）：**

| 参数 | honk 语义 | 备注 |
| --- | --- | --- |
| `grouptype` | 0→`policy: select`；1→`policy: min_moving_avg`；2→`policy: loadbalance` | 默认 1 |
| `threshold` | 地区节点数阈值；不足 2 个地区时展平 | 默认 2 |
| `ipv6` | 控制 `dns.routing.request` 是否加 `qtype(aaaa) -> reject` | 默认 false |
| `quic` | 控制 `routing` 是否插入 `l4proto(udp) && dport(443) -> block` | 默认 false |
| `adblock` | 0 关闭；1/2/3 都近似为 `domain(geosite: category-ads-all) -> block`（honk 侧无远程规则源，三个源无法区分） | 默认 3 |
| `include` / `exclude` | 与 mihomo 侧共用 `shouldKeepRule()` 语义，作用于 `routing {}` 段落 | Fork 特性 |
| `prefer` | 命中时生成 `Prefer` 组：`policy: fallback` + `final: Auto` | Fork 特性 |

**honk 独有（详写）：**

订阅：

- `subscription`（**关键**）：honk 会按 interval 自动重拉的订阅 URL。**建议 URL 编码后传入**（Sub-Store hash 里含 `:` `?` `&` 会破坏解析），本覆写会自动 decode 一次。例：`subscription=https%3A%2F%2Fsub.example%2Ftoken`。缺省时产物里写占位 `https://example.com/your-subscription` 并带一行提示。
- `subtag`：订阅 tag 名，默认 `my_sub`；honk 里的 `subtag(...)` 过滤器可以按它精确挑节点。
- `sub-interval`：拉订阅间隔，默认 `86400s`；honk 接受 `30m` / `1h` / 秒数等格式。
- `sub-route`：拉订阅的出口，默认 `direct`；也可以是某个组名（比如 `Select`），首次启动时如果这个组还没有可用节点会拉取失败——推荐保持 `direct`。
- `sub-cache`：是否把订阅正文缓存到本地状态库（离线可用），默认 `true`。
- `sub-ua`：拉订阅的 User-Agent，默认 `clash.meta/1.19.30`（部分机场按 UA 判定分发格式，用 mihomo UA 可拿到最完整的 Clash YAML 正文）。

`global {}` 段（对应 honk 内核运行环境）：

- `lan-iface`：LAN 网卡，默认 `br-lan`（OpenWrt x86 常见值）。用 `ip a` 查你自己的网卡名后覆盖，如 `#lan-iface=eth0`。
- `wan-iface`：WAN 网卡，默认 `auto`（honk 自动探测）。
- `dial-mode`：默认 `domain`（分流规则可直接命中域名，兼容 DoH/DoT）；`ip` 更省资源但会丢失域名分流能力；`domain_strict` 严格要求域名解析；`fallback` 域名失败回退 IP。
- `data-dir`：honk 状态目录（面板选择、订阅缓存），默认 `/etc/honk`。OpenWrt 上 `/var` 是内存盘，重启会丢；放 `/etc/honk` 才持久化。
- `log-level`：默认 `info`；可选 `fatal`/`error`/`warn`/`debug`/`trace`。
- `allow-insecure`：全局允许自签/TLS 跳过验证，默认 `false`。仅在自建节点没配好证书时临时开。
- `store-subscribe`：是否启用订阅正文持久化，默认 `true`。
- `nfqueue`：是否启用 NFQUEUE 兼容层（部分内核特性下用来兜住 eBPF 漏过的流量），默认 `true`。
- `auto-kernel`：honk 启动时自动改内核参数（`net.ipv4.ip_forward` 等），默认 `true`；如果你已经在系统 init 里手工配好可关闭。

`dns {}` 段：

- `dns-default`：国内 DNS 上游，默认 `https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com`；honk upstream 支持 `udp://` / `https://` / `tcp://` / `quic://` / `dot://`。
- `dns-remote`：国外 DNS 上游，默认 `https://8.8.8.8/dns-query?tls_server_name=dns.google`。
- `dns-remote-exit`：`dns-remote` 绑定的出口组名，默认 `Select`（在面板切 Select 就等于切所有 DNS 出口）。可以改成 `Auto` 让 DNS 流量也走自动测速。
- `dns-client-subnet`：向 upstream 携带 ECS 头，默认 `auto`（honk 按节点位置推断）；`off` 关闭；`<ipv4/24>` 手工指定。

`experimental {}` 段（面板 API）：

- `native-api`：是否输出 `native_api {}` 块（Doona 面板接入），默认 `true`。honk 的 `native-api` 或 `full` 构建变体才有这个能力，`clash-api` 变体请设 `native-api=false`。
- `native-listen`：`native_api.listen`，默认 `0.0.0.0:9527`（局域网可访问；公网暴露请自行加防火墙）。仅本机访问用 `127.0.0.1:9527`。
- `native-ui`：`native_api.ui`，默认 `embedded`（内嵌 doona）；也可选 `embedded-lite`（轻量预览版）或磁盘路径。
- `clash-api`：是否输出 `clash_api {}` 块（zashboard 等 Clash 面板兼容），默认 `true`。honk `native-api` 变体请设 `clash-api=false`。
- `clash-controller`：`clash_api.external_controller`，默认 `0.0.0.0:9090`。
- `clash-ui`：`clash_api.external_ui`，默认 `zashboard`（首次启动自动下载）。
- `clash-secret`：`clash_api.secret` 面板口令，**默认空**——产物里会带一行提示注释要求设置；生产环境一定要给。

**honk 会忽略的 mihomo 参数**（传了没效果）：

- `landing` / 前置代理链（honk 无 `dialer-proxy`）；
- `fakeip`（honk 无 FakeIP 引擎）；
- `tun`（honk 是 eBPF 透明代理，走 `nfqueue` 与内核参数）；
- `keepalive`（honk 无独立开关，由内核管理）；
- `full`（本项目的 `full=true` 是给 Clash 加一批内核参数，honk 侧不适用）；
- `sniffer`（honk 的域名嗅探是 eBPF 层内建，无用户配置项）；
- `regex`（honk 天然靠 `filter: name(regex: '…')` 匹配节点，无枚举 vs 正则之分）；
- 「手动选择」/ `GLOBAL` 组（honk 侧由 `Select` 与 `Final` 分别承担）；
- AdBlock / SogouInput 代理组（外部 rule-provider 无等价物，路由层直接落到 `block` / `direct`）；
- Tailscale 节点与 `100.64.0.0/10` 定向分流（honk 无 tailscale outbound）。

#### 完整 URL 示例

假设你现有 mihomo 用的 Sub-Store collection 下载 URL 是 `https://substore.example/sadsd/download/abc?target=xyz`，想给 honk 用同一份订阅，且：

- 地区组走 `min_moving_avg`（默认，不用写 `grouptype=1`）；
- 排除 E-Hentai 与微博；
- LAN 网卡 `eth0`，数据目录 `/var/lib/honk`；
- Clash 面板口令设为 `mytoken`；
- 关掉 Doona 面板（`native-api=false`）；
- 每小时刷一次订阅。

对应的 Sub-Store Override URL：

```text
https://cdn.jsdelivr.net/gh/powerfullz/override-rules/convert-honk.min.js
  #subscription=https%3A%2F%2Fsubstore.example%2Fsadsd%2Fdownload%2Fabc%3Ftarget%3Dxyz
  &exclude=EHentai,Weibo
  &lan-iface=eth0
  &data-dir=/var/lib/honk
  &clash-secret=mytoken
  &native-api=false
  &sub-interval=3600s
```

（示例里的换行只是为了看，实际写在同一行）。

更多细节见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#honk-动态覆写convert-honkjs) 与 [`docs/HOW_TO_CUSTOMISE.md`](docs/HOW_TO_CUSTOMISE.md#自定义-honk-输出)。

### 如何自定义与贡献

**如果你想基于本项目深度定制自己专属的覆写规则：**

请阅读 [如何自定义专属覆写规则](docs/HOW_TO_CUSTOMISE.md)。里面详细介绍了如何修改默认参数、调整代理组及增添自定义的 Rule Providers。

**如果你想为本项目贡献代码或新增特性：**

请阅读 [贡献指南](docs/HOW_TO_CONTRIBUTE.md)。里面包含关于代码规范、开发流与提交 PR 的要求。

**如果你是 AI AGENT：**

请阅读 [`./AGENTS.md`](./AGENTS.md)。
