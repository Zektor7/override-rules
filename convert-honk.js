/*!
powerfullz 的 Substore → honk 覆写脚本（config.dae 动态生成）
https://github.com/powerfullz/override-rules

用法（操作路径与 mihomo 覆写完全一致）：
1. 在 Sub-Store 里新建「文件」，类型选「Clash Config」，来源选你的组合订阅
   —— 和 mihomo 那边用的是同一个文件、同一份来源；
2. 给这个文件加一条「脚本操作」，指向本脚本：
   https://cdn.jsdelivr.net/gh/Zektor7/override-rules/convert-honk.min.js
3. 客户端 GET 这个文件的下载链接，拿到的是一份可直接放进 /etc/honk/config.dae 的
   策略骨架（裸文本，不是 YAML）。

为什么脚本要自己写回 $content：
Sub-Store 在「Clash Config」类型下会执行 `YAML.safeDump(await main(config))`，
返回的字符串会被包成 `|-` 块标量，honk 解析不了；而文件作用域里脚本是被原样内联进
`operator` 的，可以直接把 config.dae 写回 `$content`，Sub-Store 会原样作为响应体吐出。
所以本脚本在 Sub-Store 里不会注册全局 `main`（注册了就会被 YAML 化）。

产物只包含策略段：subscription / group / dns / routing；`global {}` 与
`experimental {}` 属于机器/部署参数，交给同目录下的 `system.dae`，本文件顶部固定
输出 `include { system.dae }` 引入。这样部署侧改网卡或面板口令不需要动本项目产物。

组语义（honk 的组成员只由 filter 决定，层级与 mihomo 侧一一对应）：
- HK / TW / JP / US … 地区组：name(regex: '<中文国名>')，有节点就建组；
- Other 未分类：不属于任何已知地区的节点（名字里没有国名等），避免被忽略；
- Auto 自动选择：候选是各地区组与未分类组；
- Manual 手动选择：唯一持有全部节点的组；
- Select 选择代理：优先选择 / 自动选择 / 地区 / 未分类 / 手动选择；
- AI / Netflix / Youtube … 服务组：选择代理 / 地区 / 未分类 / 手动选择 / 直连；
- Final 兜底：选择代理 / 地区 / 未分类 / 手动选择 / 直连，默认停在选择代理；
- honk 侧不生成「故障转移」「低倍率节点」组；include / exclude 裁掉规则后不再被引用的
  服务组不生成。

与 mihomo 分支共享的参数（含义完全一致，此处只列名字，详义见 convert.min.js banner）：
- grouptype: 地区代理组类型（0=select 手动, 1=min_moving_avg 自动测速, 2=loadbalance 负载均衡，默认 1）
- threshold: 地区节点数量小于该值时不显示分组（默认 2；不足 2 个地区时自动展平）
- ipv6: 启用 IPv6（false 时 dns 段写 `ipversion_prefer: 4` 偏好 IPv4，但**不禁用** v6 地址；默认 false）
- quic: 允许 QUIC（false 时插入 `l4proto(udp) && dport(443) -> block`；默认 false）
- adblock: 去广告（0=关闭，1/2/3=对应远程源；honk 侧统一近似为 `geosite: category-ads-all`，默认 3）
- include: 只使用指定规则，逗号分隔（与 exclude 冲突时优先）
- exclude: 排除指定规则，逗号分隔
- prefer: 优先选路节点正则，逗号分隔；命中时生成 Prefer 组（policy=fallback, final=Auto）

honk 独有参数（策略层）：
- subscription: honk 的订阅 URL（URL 编码），会写入 subscription { my_sub: '<URL>' }；honk 按 interval 自动重拉
- sub-base: SubStore 服务基础地址（host + 后端路径，不含 /download/...）。不传时会从当前下载请求的
  地址反推，所以一般不需要手动指定；显式 subscription 仍优先
- subtag: 订阅 tag 名，默认 `my_sub`
- sub-interval: 订阅刷新间隔，默认 `86400s`；honk 接受 `30m` / `1h` 等
- sub-route: 拉订阅的出口（`direct` 或组名），默认 `direct`
- sub-cache: 是否缓存订阅正文到本地状态库，默认 true
- sub-ua: 拉订阅的 User-Agent，默认 `clash.meta/1.19.30`
- policy: Auto/地区/服务/LowCost/Final 组的 honk 策略，默认 `score`；可选：select / fixed / urltest / min_moving_avg / min_avg10 / min_last_delay / loadbalance / roundrobin / fallback / score；非法值回退到 HONK_POLICIES[grouptype]（默认就是 score）
- tolerance: URLTest/Score 切换阈值（毫秒，纯整数），默认不写（honk 侧 50）
- idle-timeout: URLTest 组空闲多少秒后暂停探测（纯整数），默认不写（honk 侧 1800）
- check-url: 非 Selector 策略的按组健康检查 URL（可带逗号分隔字面 IP），默认不写
- interrupt: 自动选择类组是否在成员变化时中断已有连接（`true/false/1/0`），默认 `false`
- dns-default: honk dns.upstream.default 的 URL，默认阿里 DoH
- dns-remote: honk dns.upstream.remote 的 URL，默认 Cloudflare DoH
- dns-remote-exit: remote 绑定的出口组名，默认 `Select`
- dns-client-subnet: honk dns.client_subnet，默认 `auto`

honk 无对应概念、显式忽略的 mihomo 参数：
- landing / 前置代理链（dialer-proxy）
- fakeip / sniffer / tun / keepalive / full / regex / manual / GLOBAL / tailscale

honk 侧交由 system.dae 处理的段（本覆写不再输出）：
- global {}：网卡、dial_mode、data_dir、log_level、内核参数等部署项
- experimental {}：native_api / clash_api / cache_file 面板与持久化配置

dns 段的两个要点：
- 不使用系统自身的 DNS——请求路由里没有 `-> asis`，所有查询都落在 default / remote 两个
  命名上游上；第一条规则是 `qname(suffix: nip.io) -> default`（内网域名直连查询）；
- 不禁用 IPv6——`#ipv6=false` 时用 `ipversion_prefer: 4` 表达「偏好 IPv4」，仍保留 v6 回退。

源码位于 `src/`，入口为 `src/main-honk.ts`。
*/
"use strict";
(() => {
  // src/utils/primitives.ts
  function parseBool(value, defaultValue = false) {
    if (typeof value === "undefined") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return false;
  }
  function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
      return defaultValue;
    }
    const num = parseInt(String(value), 10);
    return Number.isNaN(num) ? defaultValue : num;
  }
  function isNotNull(value) {
    return value !== null;
  }

  // src/args/schema.ts
  var ARG_DEFAULTS = {
    /** 地区代理组类型：0=select，1=url-test，2=load-balance。 */
    groupType: 1,
    /** 地区节点数量小于该值时不生成地区组。 */
    countryThreshold: 2,
    /** 启用 IPv6 支持。 */
    ipv6Enabled: false,
    /** 输出完整内核配置。 */
    fullConfig: false,
    /** 启用 TCP keep-alive。 */
    keepAliveEnabled: false,
    /** 使用 fake-ip 增强模式。 */
    fakeIPEnabled: true,
    /** 允许 QUIC（UDP 443）流量。 */
    quicEnabled: false,
    /** 使用正则过滤模式。 */
    regexFilter: false,
    /** 启用 TUN 模式。 */
    tunEnabled: false,
    /** 去广告规则来源：0=关闭，1=adrules.top，2=217heidai，3=AWAvenue。 */
    adblockSource: 3
  };

  // src/args/parse.ts
  function parseGroupType(args) {
    const raw = parseNumber(args.grouptype, Number.NaN);
    if (raw === 0 || raw === 1 || raw === 2) return raw;
    if (typeof args.loadbalance !== "undefined") {
      return parseBool(args.loadbalance) ? 2 : 1;
    }
    return ARG_DEFAULTS.groupType;
  }
  function parseRuleFilters(args) {
    const toSet = (value) => new Set(
      value.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean)
    );
    if (args.include) {
      const includedRules = toSet(args.include);
      return {
        includedRules: includedRules.size > 0 ? includedRules : null,
        excludedRules: /* @__PURE__ */ new Set()
      };
    }
    return { includedRules: null, excludedRules: toSet(args.exclude ?? "") };
  }
  function parsePreferPatterns(args) {
    if (!args.prefer) return null;
    return args.prefer.split(",").map((pattern) => pattern.trim()).filter(Boolean);
  }
  function parseAdblockSource(args) {
    const raw = parseNumber(args.adblock, ARG_DEFAULTS.adblockSource);
    return raw === 0 || raw === 1 || raw === 2 || raw === 3 ? raw : ARG_DEFAULTS.adblockSource;
  }
  function buildFeatureFlags(args) {
    const { includedRules, excludedRules } = parseRuleFilters(args);
    return {
      groupType: parseGroupType(args),
      ipv6Enabled: parseBool(args.ipv6, ARG_DEFAULTS.ipv6Enabled),
      fullConfig: parseBool(args.full, ARG_DEFAULTS.fullConfig),
      keepAliveEnabled: parseBool(args.keepalive, ARG_DEFAULTS.keepAliveEnabled),
      fakeIPEnabled: parseBool(args.fakeip, ARG_DEFAULTS.fakeIPEnabled),
      quicEnabled: parseBool(args.quic, ARG_DEFAULTS.quicEnabled),
      regexFilter: parseBool(args.regex, ARG_DEFAULTS.regexFilter),
      tunEnabled: parseBool(args.tun, ARG_DEFAULTS.tunEnabled),
      countryThreshold: parseNumber(args.threshold, ARG_DEFAULTS.countryThreshold),
      includedRules,
      excludedRules,
      preferPatterns: parsePreferPatterns(args),
      adblockSource: parseAdblockSource(args)
    };
  }

  // src/args/honk-schema.ts
  var HONK_ARG_DEFAULTS = {
    /** 未传 `#subscription=` 时使用的占位 URL；产物会保留且额外写一行注释提醒替换。 */
    subscriptionUrl: "https://example.com/your-subscription",
    subscriptionTag: "my_sub",
    subscriptionInterval: "86400s",
    subscriptionRoute: "direct",
    subscriptionCache: true,
    subscriptionUa: "clash.meta/1.19.30",
    /** 自动选择类组的默认策略；honk 推荐 `score`（基于实际可靠性与有界验证）。 */
    policy: "score",
    /** `tolerance` / `idleTimeout` / `checkUrl` 未传时留空，交给 honk 侧默认。 */
    tolerance: null,
    idleTimeout: null,
    checkUrl: null,
    /** `interrupt_connections` 默认关闭，避免切节点时打断业务连接。 */
    interruptConnections: false,
    dnsDefaultUpstream: "https://223.5.5.5/dns-query?tls_server_name=dns.alidns.com",
    dnsRemoteUpstream: "https://8.8.8.8/dns-query?tls_server_name=dns.google",
    /** remote 走 Select：honk 面板上切 Select 节点等同于切所有 DNS 出口。 */
    dnsRemoteExit: "Select",
    dnsClientSubnet: "auto"
  };

  // src/catalog/endpoints.ts
  var CDN_URL = "https://cdn.jsdelivr.net";
  var PROJECT_URL = `${CDN_URL}/gh/Zektor7/override-rules@main`;

  // src/catalog/countries.ts
  var QURE = `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color`;
  var COUNTRY_KEYS = {
    hongKong: "香港",
    taiwan: "台湾",
    unitedStates: "美国"
  };
  var countriesMeta = {
    [COUNTRY_KEYS.hongKong]: {
      weight: 10,
      pattern: "香港|港|\\b(?:HK|hk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Hong Kong|HongKong|hongkong|HONG KONG|HONGKONG|深港|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌|🇭🇰",
      icon: `${QURE}/Hong_Kong.png`
    },
    澳门: {
      pattern: "澳门|\\b(?:MO|mo)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Macau|🇲🇴",
      icon: `${QURE}/Macao.png`
    },
    [COUNTRY_KEYS.taiwan]: {
      weight: 20,
      pattern: "台|新北|彰化|\\b(?:TW|tw)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TAIWAN|TWN|TPE|ROC|🇹🇼|🇼🇸",
      icon: `${QURE}/Taiwan.png`
    },
    新加坡: {
      weight: 30,
      pattern: "新加坡|坡|狮城|\\b(?:SG|sg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SINGAPORE|SIN|🇸🇬",
      icon: `${QURE}/Singapore.png`
    },
    日本: {
      weight: 40,
      pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\\b(?:JP|jp)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JAPAN|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai|KANSAI|🇯🇵",
      icon: `${QURE}/Japan.png`
    },
    韩国: {
      weight: 45,
      pattern: "韩国|韩|韓|春川|Chuncheon|首尔|\\b(?:KR|kr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOREA|KOR|ICN|🇰🇷",
      icon: `${QURE}/Korea.png`
    },
    [COUNTRY_KEYS.unitedStates]: {
      weight: 50,
      pattern: "美国|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|亚特兰大|迈阿密|华盛顿|\\b(?:US|us)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|UNITED STATES|USA|America|AMERICA|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC|🇺🇸",
      icon: `${QURE}/United_States.png`,
      excludePattern: "美属|亚美尼亚|圣多美|普林西比"
    },
    加拿大: {
      weight: 55,
      pattern: "加拿大|渥太华|温哥华|卡尔加里|蒙特利尔|Montreal|\\b(?:CA|ca)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Canada|CANADA|CAN|YVR|YYZ|YUL|🇨🇦",
      icon: `${QURE}/Canada.png`
    },
    英国: {
      weight: 60,
      pattern: "英国|伦敦|曼彻斯特|Manchester|\\b(?:UK|uk)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Britain|United Kingdom|UNITED KINGDOM|England|GBR|LHR|MAN|🇬🇧",
      icon: `${QURE}/United_Kingdom.png`
    },
    澳大利亚: {
      pattern: "澳洲|澳大利亚|\\b(?:AU|au)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Australia|🇦🇺",
      icon: `${QURE}/Australia.png`
    },
    德国: {
      weight: 70,
      pattern: "德国|德|柏林|法兰克福|慕尼黑|Munich|\\b(?:DE|de)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Germany|GERMANY|DEU|MUC|🇩🇪",
      icon: `${QURE}/Germany.png`,
      excludePattern: "瓜德罗普"
    },
    法国: {
      weight: 80,
      pattern: "法国|法|巴黎|马赛|Marseille|\\b(?:FR|fr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|France|FRANCE|FRA|CDG|MRS|🇫🇷",
      icon: `${QURE}/France.png`,
      excludePattern: "法属|布基纳法索|法罗"
    },
    俄罗斯: {
      pattern: "俄罗斯|俄|\\b(?:RU|ru)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Russia|🇷🇺",
      icon: `${QURE}/Russia.png`,
      excludePattern: "埃塞俄比亚|白俄罗斯"
    },
    泰国: {
      pattern: "泰国|泰|\\b(?:TH|th)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Thailand|🇹🇭",
      icon: `${QURE}/Thailand.png`,
      excludePattern: "巴泰"
    },
    印度: {
      pattern: "印度|\\b(?:IN|in)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|India|🇮🇳",
      icon: `${QURE}/India.png`,
      excludePattern: "印度洋"
    },
    马来西亚: {
      pattern: "马来西亚|马来|\\b(?:MY|my)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Malaysia|🇲🇾",
      icon: `${QURE}/Malaysia.png`
    },
    阿根廷: {
      pattern: "阿根廷|布宜诺斯艾利斯|\\b(?:AR|ar)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Argentina|EZE|🇦🇷",
      icon: `${QURE}/Argentina.png`
    },
    芬兰: {
      pattern: "芬兰|赫尔辛基|\\b(?:FI|fi)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Finland|HEL|🇫🇮",
      icon: `${QURE}/Finland.png`
    },
    埃及: {
      pattern: "埃及|开罗|\\b(?:EG|eg)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Egypt|CAI|🇪🇬",
      icon: `${QURE}/Egypt.png`
    },
    菲律宾: {
      pattern: "菲律宾|马尼拉|\\b(?:PH|ph)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Philippines|MNL|🇵🇭",
      icon: `${QURE}/Philippines.png`
    },
    土耳其: {
      pattern: "土耳其|伊斯坦布尔|\\b(?:TR|tr)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Turkey|Türkiye|IST|🇹🇷",
      icon: `${QURE}/Turkey.png`
    },
    乌克兰: {
      pattern: "乌克兰|基辅|\\b(?:UA|ua)(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Ukraine|KBP|🇺🇦",
      icon: `${QURE}/Ukraine.png`
    }
  };
  var countryRegexMap = Object.fromEntries(
    Object.entries(countriesMeta).map(([country, meta]) => [country, new RegExp(meta.pattern)])
  );
  var countryExcludeRegexMap = Object.fromEntries(
    Object.entries(countriesMeta).flatMap(
      ([country, meta]) => meta.excludePattern ? [[country, new RegExp(meta.excludePattern)]] : []
    )
  );

  // src/catalog/honk-countries.ts
  var HONK_COUNTRIES = [
    ["香港", "HK"],
    ["澳门", "MO"],
    ["台湾", "TW"],
    ["日本", "JP"],
    ["韩国", "KR"],
    ["新加坡", "SG"],
    ["美国", "US"],
    ["英国", "UK"],
    ["法国", "FR"],
    ["德国", "DE"],
    ["澳大利亚", "AU"],
    ["阿联酋", "AE"],
    ["阿富汗", "AF"],
    ["阿尔巴尼亚", "AL"],
    ["阿尔及利亚", "DZ"],
    ["安哥拉", "AO"],
    ["阿根廷", "AR"],
    ["亚美尼亚", "AM"],
    ["奥地利", "AT"],
    ["阿塞拜疆", "AZ"],
    ["巴林", "BH"],
    ["孟加拉国", "BD"],
    ["白俄罗斯", "BY"],
    ["比利时", "BE"],
    ["伯利兹", "BZ"],
    ["贝宁", "BJ"],
    ["不丹", "BT"],
    ["玻利维亚", "BO"],
    ["波斯尼亚和黑塞哥维那", "BA"],
    ["博茨瓦纳", "BW"],
    ["巴西", "BR"],
    ["英属维京群岛", "VG"],
    ["文莱", "BN"],
    ["保加利亚", "BG"],
    ["布基纳法索", "BF"],
    ["布隆迪", "BI"],
    ["柬埔寨", "KH"],
    ["喀麦隆", "CM"],
    ["加拿大", "CA"],
    ["佛得角", "CV"],
    ["开曼群岛", "KY"],
    ["中非共和国", "CF"],
    ["乍得", "TD"],
    ["智利", "CL"],
    ["哥伦比亚", "CO"],
    ["科摩罗", "KM"],
    ["刚果(布)", "CG"],
    ["刚果(金)", "CD"],
    ["哥斯达黎加", "CR"],
    ["克罗地亚", "HR"],
    ["塞浦路斯", "CY"],
    ["捷克", "CZ"],
    ["丹麦", "DK"],
    ["吉布提", "DJ"],
    ["多米尼加共和国", "DO"],
    ["厄瓜多尔", "EC"],
    ["埃及", "EG"],
    ["萨尔瓦多", "SV"],
    ["赤道几内亚", "GQ"],
    ["厄立特里亚", "ER"],
    ["爱沙尼亚", "EE"],
    ["埃塞俄比亚", "ET"],
    ["斐济", "FJ"],
    ["芬兰", "FI"],
    ["加蓬", "GA"],
    ["冈比亚", "GM"],
    ["格鲁吉亚", "GE"],
    ["加纳", "GH"],
    ["希腊", "GR"],
    ["格陵兰", "GL"],
    ["危地马拉", "GT"],
    ["几内亚", "GN"],
    ["圭亚那", "GY"],
    ["海地", "HT"],
    ["洪都拉斯", "HN"],
    ["匈牙利", "HU"],
    ["冰岛", "IS"],
    ["印度", "IN"],
    ["印尼", "ID"],
    ["伊朗", "IR"],
    ["伊拉克", "IQ"],
    ["爱尔兰", "IE"],
    ["马恩岛", "IM"],
    ["以色列", "IL"],
    ["意大利", "IT"],
    ["科特迪瓦", "CI"],
    ["牙买加", "JM"],
    ["约旦", "JO"],
    ["哈萨克斯坦", "KZ"],
    ["肯尼亚", "KE"],
    ["科威特", "KW"],
    ["吉尔吉斯斯坦", "KG"],
    ["老挝", "LA"],
    ["拉脱维亚", "LV"],
    ["黎巴嫩", "LB"],
    ["莱索托", "LS"],
    ["利比里亚", "LR"],
    ["利比亚", "LY"],
    ["立陶宛", "LT"],
    ["卢森堡", "LU"],
    ["马其顿", "MK"],
    ["马达加斯加", "MG"],
    ["马拉维", "MW"],
    ["马来", "MY"],
    ["马尔代夫", "MV"],
    ["马里", "ML"],
    ["马耳他", "MT"],
    ["毛利塔尼亚", "MR"],
    ["毛里求斯", "MU"],
    ["墨西哥", "MX"],
    ["摩尔多瓦", "MD"],
    ["摩纳哥", "MC"],
    ["蒙古", "MN"],
    ["黑山共和国", "ME"],
    ["摩洛哥", "MA"],
    ["莫桑比克", "MZ"],
    ["缅甸", "MM"],
    ["纳米比亚", "NA"],
    ["尼泊尔", "NP"],
    ["荷兰", "NL"],
    ["新西兰", "NZ"],
    ["尼加拉瓜", "NI"],
    ["尼日尔", "NE"],
    ["尼日利亚", "NG"],
    ["朝鲜", "KP"],
    ["挪威", "NO"],
    ["阿曼", "OM"],
    ["巴基斯坦", "PK"],
    ["巴拿马", "PA"],
    ["巴拉圭", "PY"],
    ["秘鲁", "PE"],
    ["菲律宾", "PH"],
    ["葡萄牙", "PT"],
    ["波多黎各", "PR"],
    ["卡塔尔", "QA"],
    ["罗马尼亚", "RO"],
    ["俄罗斯", "RU"],
    ["卢旺达", "RW"],
    ["圣马力诺", "SM"],
    ["沙特阿拉伯", "SA"],
    ["塞内加尔", "SN"],
    ["塞尔维亚", "RS"],
    ["塞拉利昂", "SL"],
    ["斯洛伐克", "SK"],
    ["斯洛文尼亚", "SI"],
    ["索马里", "SO"],
    ["南非", "ZA"],
    ["西班牙", "ES"],
    ["斯里兰卡", "LK"],
    ["苏丹", "SD"],
    ["苏里南", "SR"],
    ["斯威士兰", "SZ"],
    ["瑞典", "SE"],
    ["瑞士", "CH"],
    ["叙利亚", "SY"],
    ["塔吉克斯坦", "TJ"],
    ["坦桑尼亚", "TZ"],
    ["泰国", "TH"],
    ["多哥", "TG"],
    ["汤加", "TO"],
    ["特立尼达和多巴哥", "TT"],
    ["突尼斯", "TN"],
    ["土耳其", "TR"],
    ["土库曼斯坦", "TM"],
    ["美属维尔京群岛", "VI"],
    ["乌干达", "UG"],
    ["乌克兰", "UA"],
    ["乌拉圭", "UY"],
    ["乌兹别克斯坦", "UZ"],
    ["委内瑞拉", "VE"],
    ["越南", "VN"],
    ["也门", "YE"],
    ["赞比亚", "ZM"],
    ["津巴布韦", "ZW"],
    ["安道尔", "AD"],
    ["留尼汪", "RE"],
    ["波兰", "PL"],
    ["关岛", "GU"],
    ["梵蒂冈", "VA"],
    ["列支敦士登", "LI"],
    ["库拉索", "CW"],
    ["塞舌尔", "SC"],
    ["南极", "AQ"],
    ["直布罗陀", "GI"],
    ["古巴", "CU"],
    ["法罗群岛", "FO"],
    ["奥兰群岛", "AX"],
    ["百慕达", "BM"],
    ["东帝汶", "TL"],
    // 别名：Clash 分支 `catalog/countries.ts` 用的是「马来西亚」，这里补一条映射，
    // 实际匹配时前面的「马来」先命中（节点名由重命名脚本产出「马来 01」）。
    ["马来西亚", "MY"]
  ];
  var HONK_COUNTRY_CODES = Object.fromEntries(HONK_COUNTRIES);

  // src/catalog/group-names.ts
  var NODE_SUFFIX = "节点";
  var PROXY_GROUPS = {
    SELECT: "选择代理",
    MANUAL: "手动选择",
    AUTO: "自动选择",
    FALLBACK: "故障转移",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
    FRONT_PROXY: "前置代理",
    STATIC_RESOURCES: "静态资源",
    AI_SERVICE: "AI服务",
    CRYPTO: "加密货币",
    FINANCE: "金融服务",
    APPLE: "苹果服务",
    GOOGLE: "谷歌服务",
    MICROSOFT: "微软服务",
    BILIBILI: "哔哩哔哩",
    BAHAMUT: "巴哈姆特",
    XBOX: "Xbox",
    TAILSCALE: "Tailscale",
    GITHUB: "Github",
    YOUTUBE: "Youtube",
    NETFLIX: "Netflix",
    TIKTOK: "TikTok",
    SPOTIFY: "Spotify",
    EHENTAI: "E-Hentai",
    TELEGRAM: "Telegram",
    TRUTH_SOCIAL: "Truth Social",
    TWITTER: "Twitter",
    TWITCH: "Twitch",
    WEIBO: "新浪微博",
    PIKPAK: "PikPak网盘",
    PT_SITE: "PT站点",
    SOGOU_INPUT: "搜狗输入法",
    AD_BLOCK: "广告拦截",
    GLOBAL: "GLOBAL",
    FINAL: "Final",
    /** 优先选路组（本 Fork 新增，由 `prefer` 参数触发）。 */
    PREFER: "优先选择"
  };
  function countryGroupName(country) {
    return `${country}${NODE_SUFFIX}`;
  }

  // src/catalog/honk-groups.ts
  var HONK_GROUP_NAMES = {
    SELECT: "Select",
    // 「手动选择」保留：它是唯一持有全部节点名的组，Auto / Fallback / Select /
    // Final / 服务组都只引用它与地区组（与 mihomo 侧的层级一致）。
    MANUAL: "Manual",
    AUTO: "Auto",
    // honk 侧不生成「故障转移」组：Auto 已经按地区组给出自动选路，
    // 再叠一层同候选的 fallback 组只是重复面板入口。
    FALLBACK: null,
    // honk 没有 dialer-proxy 链式代理，落地/前置组无对应。
    LANDING: null,
    FRONT_PROXY: null,
    // honk 侧不生成「低倍率节点」组：低倍率只是节点的一个属性，单独建组并
    // 挂进每个服务组会让面板多出一堆重复入口，实际选路由地区组与手动选择承担。
    LOW_COST: null,
    STATIC_RESOURCES: "StaticResources",
    AI_SERVICE: "AI",
    CRYPTO: "Crypto",
    FINANCE: "Finance",
    APPLE: "Apple",
    GOOGLE: "Google",
    MICROSOFT: "Microsoft",
    BILIBILI: "Bilibili",
    BAHAMUT: "Bahamut",
    XBOX: "Xbox",
    // honk 没有 tailscale outbound；相关分流规则与组都不生成。
    TAILSCALE: null,
    GITHUB: "Github",
    YOUTUBE: "Youtube",
    NETFLIX: "Netflix",
    TIKTOK: "TikTok",
    SPOTIFY: "Spotify",
    EHENTAI: "EHentai",
    TELEGRAM: "Telegram",
    TRUTH_SOCIAL: "TruthSocial",
    TWITTER: "Twitter",
    TWITCH: "Twitch",
    WEIBO: "Weibo",
    PIKPAK: "PikPak",
    PT_SITE: "PT",
    // honk 无 rule-provider，SogouInput 在路由里直接命中 `-> direct`，不建组。
    SOGOU_INPUT: null,
    // AdBlock 同理，在路由里直接命中 `-> block`，不建组；
    // 保留组会与 honk 生态习惯（kenzok8 / qichiyuhub）相背离，且 `final: block` 在 Select
    // 策略下不会自动生效。
    AD_BLOCK: null,
    // honk 没有 GLOBAL 汇总组，由 Final 承担兜底。
    GLOBAL: null,
    FINAL: "Final",
    PREFER: "Prefer"
  };
  function toHonkName(clashName) {
    const entries = Object.entries(HONK_GROUP_NAMES);
    for (const [key, honkName] of entries) {
      if (PROXY_GROUPS[key] === clashName) return honkName;
    }
    return null;
  }
  function requireHonkName(key) {
    const name = HONK_GROUP_NAMES[key];
    if (name === null) {
      throw new Error(`honk 组名未映射（honk 无对应概念）: ${key}`);
    }
    return name;
  }
  function honkServiceCandidates(serviceName, regionTags, baseTags) {
    const selectTag = HONK_GROUP_NAMES.SELECT;
    const manualTag = HONK_GROUP_NAMES.MANUAL;
    const tagOf = (country) => regionTags.get(country);
    const unique = (tags) => [...new Set(tags)];
    switch (serviceName) {
      case PROXY_GROUPS.BILIBILI: {
        const taiwan = tagOf(COUNTRY_KEYS.taiwan);
        const hongKong = tagOf(COUNTRY_KEYS.hongKong);
        return taiwan && hongKong ? { tags: unique([taiwan, hongKong]), includeDirect: true, defaultTag: "direct" } : { tags: unique(baseTags), includeDirect: true, defaultTag: "direct" };
      }
      case PROXY_GROUPS.BAHAMUT: {
        const taiwan = tagOf(COUNTRY_KEYS.taiwan);
        return taiwan ? {
          tags: unique([taiwan, selectTag, manualTag]),
          includeDirect: true,
          defaultTag: taiwan
        } : { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
      }
      case PROXY_GROUPS.TRUTH_SOCIAL: {
        const unitedStates = tagOf(COUNTRY_KEYS.unitedStates);
        return unitedStates ? {
          tags: unique([unitedStates, selectTag, manualTag]),
          includeDirect: false,
          defaultTag: unitedStates
        } : { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
      }
      case PROXY_GROUPS.FINANCE:
      case PROXY_GROUPS.MICROSOFT:
      case PROXY_GROUPS.WEIBO:
      case PROXY_GROUPS.PT_SITE:
        return { tags: unique(baseTags), includeDirect: true, defaultTag: "direct" };
      default:
        return { tags: unique(baseTags), includeDirect: true, defaultTag: selectTag };
    }
  }
  var HONK_POLICIES = {
    0: "select",
    1: "score",
    2: "loadbalance"
  };
  var HONK_POLICY_VALUES = [
    "select",
    "selector",
    "fixed",
    "urltest",
    "min_moving_avg",
    "min_avg10",
    "min_last_delay",
    "loadbalance",
    "roundrobin",
    "round_robin",
    "balance",
    "fallback",
    "score"
  ];
  function isHonkPolicy(raw) {
    if (!raw) return false;
    const trimmed = raw.trim().toLowerCase();
    if (HONK_POLICY_VALUES.includes(trimmed)) return true;
    if (!trimmed.startsWith("fixed(") || !trimmed.endsWith(")")) return false;
    const inner = trimmed.slice(6, -1);
    return inner.length > 0 && [...inner].every((ch) => ch >= "0" && ch <= "9");
  }

  // src/args/honk-parse.ts
  function readString(raw, fallback) {
    if (raw === void 0) return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  function readSubscriptionUrl(raw) {
    const value = readString(raw, HONK_ARG_DEFAULTS.subscriptionUrl);
    if (value === HONK_ARG_DEFAULTS.subscriptionUrl) return value;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function readBool(raw, fallback) {
    if (raw === void 0) return fallback;
    return parseBool(raw, fallback);
  }
  function readBaseUrl(raw) {
    const value = readString(raw, "");
    if (!value) return value;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  function trimTrailingSlashes(base) {
    let trimmed = base.trim();
    while (trimmed.endsWith("/")) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
  }
  function buildDownloadUrl(base, sourceType, sourceName) {
    const trimmed = trimTrailingSlashes(base);
    if (sourceType === "collection") {
      return `${trimmed}/download/collection/${sourceName}`;
    }
    if (sourceType === "subscription") {
      return `${trimmed}/download/${sourceName}`;
    }
    return null;
  }
  function readDownloadUrlFromFile(fileContext) {
    const raw = fileContext?.url?.trim();
    if (!raw) return null;
    if (!/\/download\/(?:collection\/)?[^/?#]+/.test(raw)) return null;
    return raw.split("#")[0].split("?")[0];
  }
  function readHeader(headers, name) {
    if (!headers) return void 0;
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== target) continue;
      if (Array.isArray(value)) return value[0];
      return value;
    }
    return void 0;
  }
  function deriveBaseFromRequest(requestContext) {
    const raw = requestContext?.url?.trim();
    if (!raw) return "";
    const headers = requestContext?.headers;
    let protocol = "";
    let host = "";
    let path = "";
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        protocol = parsed.protocol.replace(":", "");
        host = parsed.host;
        path = parsed.pathname;
      } catch {
        return "";
      }
    } else {
      path = raw.split("?")[0];
      host = readHeader(headers, "host") ?? "";
      if (!host) return "";
      const forwarded = readHeader(headers, "x-forwarded-proto");
      const trimmed = forwarded?.split(",")[0]?.trim();
      protocol = trimmed && trimmed.length > 0 ? trimmed : "http";
    }
    const matched = /^(.*)\/(?:api|share)\/file\/[^/]*$/.exec(path);
    const basePath = matched ? matched[1] : "";
    return `${protocol}://${host}${basePath}`;
  }
  function resolveSubscriptionUrl(args, fileContext, requestContext) {
    const explicit = readSubscriptionUrl(args.subscription);
    if (explicit !== HONK_ARG_DEFAULTS.subscriptionUrl) return explicit;
    const fromFile = readDownloadUrlFromFile(fileContext);
    if (fromFile) return fromFile;
    const base = readBaseUrl(args["sub-base"]) || deriveBaseFromRequest(requestContext);
    const sourceType = fileContext?.sourceType;
    const sourceName = fileContext?.sourceName;
    if (base && sourceType && sourceName) {
      const url = buildDownloadUrl(base, sourceType, sourceName);
      if (url) return url;
    }
    return HONK_ARG_DEFAULTS.subscriptionUrl;
  }
  function readPositiveInt(raw) {
    if (raw === void 0) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    const parsed = parseNumber(trimmed, Number.NaN);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  }
  function readPolicy(raw, flags) {
    const fallback = HONK_POLICIES[flags.groupType];
    if (raw === void 0) return fallback;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0) return fallback;
    if (/^fixed\(\d+\)$/.test(trimmed)) return trimmed;
    if (isHonkPolicy(trimmed)) return trimmed;
    return fallback;
  }
  function buildHonkRuntimeOptions(args, flags, fileContext = null, requestContext = null) {
    const checkUrlRaw = args["check-url"]?.trim();
    return {
      subscriptionUrl: resolveSubscriptionUrl(args, fileContext, requestContext),
      subscriptionTag: readString(args.subtag, HONK_ARG_DEFAULTS.subscriptionTag),
      subscriptionInterval: readString(
        args["sub-interval"],
        HONK_ARG_DEFAULTS.subscriptionInterval
      ),
      subscriptionRoute: readString(args["sub-route"], HONK_ARG_DEFAULTS.subscriptionRoute),
      subscriptionCache: readBool(args["sub-cache"], HONK_ARG_DEFAULTS.subscriptionCache),
      subscriptionUa: readString(args["sub-ua"], HONK_ARG_DEFAULTS.subscriptionUa),
      policy: readPolicy(args.policy, flags),
      tolerance: readPositiveInt(args.tolerance),
      idleTimeout: readPositiveInt(args["idle-timeout"]),
      checkUrl: checkUrlRaw && checkUrlRaw.length > 0 ? checkUrlRaw : null,
      interruptConnections: readBool(args.interrupt, HONK_ARG_DEFAULTS.interruptConnections),
      dnsDefaultUpstream: readString(args["dns-default"], HONK_ARG_DEFAULTS.dnsDefaultUpstream),
      dnsRemoteUpstream: readString(args["dns-remote"], HONK_ARG_DEFAULTS.dnsRemoteUpstream),
      dnsRemoteExit: readString(args["dns-remote-exit"], HONK_ARG_DEFAULTS.dnsRemoteExit),
      dnsClientSubnet: readString(args["dns-client-subnet"], HONK_ARG_DEFAULTS.dnsClientSubnet)
    };
  }

  // src/utils/regex.ts
  function createCaseInsensitiveNodeMatcher(source) {
    return {
      source,
      regex: new RegExp(source, "i"),
      pattern: `(?i)${source}`
    };
  }

  // src/catalog/low-cost.ts
  var LOW_COST_NODE_MATCHER = createCaseInsensitiveNodeMatcher(
    String.raw`0\.[0-5]|低倍率|省流|实验性`
  );

  // src/analysis/active-countries.ts
  function getActiveCountryNames(countryNodes, minCount) {
    return Object.entries(countryNodes).filter(([, nodes]) => nodes.length >= minCount).sort(([a], [b]) => {
      const wa = countriesMeta[a].weight ?? Infinity;
      const wb = countriesMeta[b].weight ?? Infinity;
      return wa - wb;
    }).map(([country]) => country);
  }

  // src/analysis/prefer-nodes.ts
  function collectPreferNodes(nodes, patterns) {
    if (!patterns || patterns.length === 0) return [];
    let regexList;
    try {
      regexList = patterns.map((pattern) => new RegExp(pattern, "i"));
    } catch (error) {
      console.log(
        "[powerfullz 的覆写脚本] 优先节点正则表达式解析失败，已忽略优先选择逻辑。",
        error
      );
      return [];
    }
    const matchedNodes = [];
    for (const node of nodes) {
      const name = node.name;
      if (!name) continue;
      const isMatch = regexList.some((regex) => {
        try {
          return regex.test(name);
        } catch {
          return false;
        }
      });
      if (isMatch) matchedNodes.push(name);
    }
    return matchedNodes;
  }

  // src/analysis/classify.ts
  var MIN_REGION_GROUPS = 2;
  function splitByLanding(nodes) {
    const landingNodes = [];
    const nonLandingNodes = [];
    for (const node of nodes) {
      if (!node.name) continue;
      if (node["dialer-proxy"] === PROXY_GROUPS.FRONT_PROXY) {
        landingNodes.push(node);
      } else {
        nonLandingNodes.push(node);
      }
    }
    return { landingNodes, nonLandingNodes };
  }
  function collectCountries(nodes) {
    const countryNodes = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const name = node.name || "";
      for (const [country, regex] of Object.entries(countryRegexMap)) {
        if (!regex.test(name)) continue;
        if (countryExcludeRegexMap[country]?.test(name)) continue;
        const bucket = countryNodes.get(country);
        if (bucket) {
          bucket.push(node);
        } else {
          countryNodes.set(country, [node]);
        }
        break;
      }
    }
    return Object.fromEntries(countryNodes);
  }
  function collectLowCost(nodes) {
    return nodes.filter((node) => LOW_COST_NODE_MATCHER.regex.test(node.name || ""));
  }
  function isTailscaleNode(node) {
    return node.type === "tailscale";
  }
  function collectTailscale(nodes) {
    return nodes.filter(isTailscaleNode);
  }
  function excludeTailscale(nodes) {
    return nodes.filter((node) => !isTailscaleNode(node));
  }
  function analyzeNodes(nodes, threshold, preferPatterns = null) {
    const { landingNodes, nonLandingNodes } = splitByLanding(nodes);
    const landing = landingNodes.length > 0;
    const tailscaleNodes = collectTailscale(nodes);
    const scopedNodes = excludeTailscale(landing ? nonLandingNodes : nodes);
    const countryNodes = collectCountries(scopedNodes);
    const countryNames = getActiveCountryNames(countryNodes, threshold);
    const lowCostNodes = collectLowCost(scopedNodes);
    const regionLayout = countryNames.length >= MIN_REGION_GROUPS ? { mode: "grouped", groupedCountries: countryNames, flattenedNodes: [] } : {
      mode: "flattened",
      groupedCountries: [],
      flattenedNodes: excludeTailscale(nonLandingNodes)
    };
    return {
      allNodes: nodes,
      manualNames: excludeTailscale(nodes).map((node) => node.name),
      landingNodes,
      nonLandingNodes,
      landing,
      countryNodes,
      countryNames,
      regionLayout,
      lowCostNodes,
      tailscaleNodes,
      hasTailscale: tailscaleNodes.length > 0,
      preferNodes: collectPreferNodes(excludeTailscale(nodes), preferPatterns)
    };
  }

  // src/builders/honk/dns.ts
  var INTERNAL_DOMAIN_SUFFIX = "nip.io";
  function buildHonkDns(flags, opts) {
    const requestLines = [
      `            qname(suffix: ${INTERNAL_DOMAIN_SUFFIX}) -> default`,
      "            qname(geosite: cn, geosite: microsoft@cn, geosite: apple@cn) -> default",
      "            qname(geosite: geolocation-!cn) -> remote",
      "            fallback: remote"
    ];
    return [
      "dns {",
      `    client_subnet: ${opts.dnsClientSubnet}`,
      // 偏好 IPv4，但 IPv6 仍然可用（不写 ipversion_prefer 即 both）。
      ...flags.ipv6Enabled ? [] : ["    ipversion_prefer: 4"],
      "    upstream {",
      `        default: '${opts.dnsDefaultUpstream}' -> direct`,
      `        remote: '${opts.dnsRemoteUpstream}' -> ${opts.dnsRemoteExit}`,
      "    }",
      "    routing {",
      "        request {",
      ...requestLines,
      "        }",
      "        response {",
      "            upstream(remote) && ip(geoip: cn) -> default",
      "            fallback: accept",
      "        }",
      "    }",
      "}"
    ];
  }

  // src/catalog/icons.ts
  var QURE2 = `${CDN_URL}/gh/Koolson/Qure@master/IconSet/Color`;
  var SELF = `${PROJECT_URL}/icons`;
  var STASH = `${CDN_URL}/gh/shindgewongxj/WHATSINStash@master/icon`;
  var MINI = `${CDN_URL}/gh/Orz-3/mini@master/Color`;
  var ICONS = {
    select: `${QURE2}/Proxy.png`,
    prefer: `${QURE2}/Available_1.png`,
    manual: `${STASH}/select.png`,
    frontProxy: `${QURE2}/Area.png`,
    landing: `${QURE2}/Airport.png`,
    staticResources: `${QURE2}/Cloudflare.png`,
    aiService: `${QURE2}/ChatGPT.png`,
    crypto: `${QURE2}/Cryptocurrency_1.png`,
    finance: `${SELF}/Nasdaq.png`,
    apple: `${QURE2}/Apple_2.png`,
    google: `${MINI}/Google.png`,
    microsoft: `${SELF}/Microsoft_Copilot.png`,
    xbox: `${QURE2}/Xbox.png`,
    github: `${QURE2}/GitHub.png`,
    bilibili: `${QURE2}/bilibili.png`,
    bahamut: `${QURE2}/Bahamut.png`,
    youtube: `${QURE2}/YouTube.png`,
    twitch: `${QURE2}/Twitch.png`,
    netflix: `${QURE2}/Netflix.png`,
    tiktok: `${QURE2}/TikTok.png`,
    spotify: `${QURE2}/Spotify.png`,
    telegram: `${SELF}/Telegram.png`,
    twitter: `${QURE2}/Twitter.png`,
    weibo: `${QURE2}/Weibo.png`,
    truthSocial: `${SELF}/Truth_Social.png`,
    ehentai: `${SELF}/Ehentai.png`,
    pikpak: `${SELF}/PikPak.png`,
    ptSite: `${QURE2}/Download.png`,
    sogouInput: `${SELF}/Sougou.png`,
    tailscale: `${SELF}/Tailscale.png`,
    adBlock: `${QURE2}/AdBlack.png`,
    final: `${QURE2}/Final.png`,
    auto: `${QURE2}/Auto.png`,
    fallback: `${QURE2}/Available_1.png`,
    lowCost: `${QURE2}/Lab.png`,
    global: `${QURE2}/Global.png`
  };

  // src/catalog/service-groups.ts
  function prioritizeLowCost(ctx) {
    const { defaultProxies } = ctx.lists;
    if (!defaultProxies.includes(PROXY_GROUPS.LOW_COST)) return defaultProxies;
    return [
      PROXY_GROUPS.LOW_COST,
      ...defaultProxies.filter((candidate) => candidate !== PROXY_GROUPS.LOW_COST)
    ];
  }
  var serviceGroups = [
    {
      name: PROXY_GROUPS.STATIC_RESOURCES,
      icon: ICONS.staticResources,
      proxies: prioritizeLowCost
    },
    {
      name: PROXY_GROUPS.AI_SERVICE,
      icon: ICONS.aiService,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.CRYPTO,
      icon: ICONS.crypto,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.FINANCE,
      icon: ICONS.finance,
      proxies: (ctx) => ctx.lists.defaultProxiesDirect
    },
    {
      name: PROXY_GROUPS.APPLE,
      icon: ICONS.apple,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.GOOGLE,
      icon: ICONS.google,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.MICROSOFT,
      icon: ICONS.microsoft,
      proxies: (ctx) => ctx.lists.defaultProxiesDirect
    },
    {
      name: PROXY_GROUPS.XBOX,
      icon: ICONS.xbox,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.GITHUB,
      icon: ICONS.github,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.BILIBILI,
      icon: ICONS.bilibili,
      proxies: (ctx) => {
        const groupedCountries = ctx.nodes.regionLayout.groupedCountries;
        return groupedCountries.includes(COUNTRY_KEYS.taiwan) && groupedCountries.includes(COUNTRY_KEYS.hongKong) ? [
          "DIRECT",
          countryGroupName(COUNTRY_KEYS.taiwan),
          countryGroupName(COUNTRY_KEYS.hongKong)
        ] : ctx.lists.defaultProxiesDirect;
      }
    },
    {
      name: PROXY_GROUPS.BAHAMUT,
      icon: ICONS.bahamut,
      proxies: (ctx) => ctx.nodes.regionLayout.groupedCountries.includes(COUNTRY_KEYS.taiwan) ? [
        countryGroupName(COUNTRY_KEYS.taiwan),
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
      ] : ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.YOUTUBE,
      icon: ICONS.youtube,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.TWITCH,
      icon: ICONS.twitch,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.NETFLIX,
      icon: ICONS.netflix,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.TIKTOK,
      icon: ICONS.tiktok,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.SPOTIFY,
      icon: ICONS.spotify,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.TELEGRAM,
      icon: ICONS.telegram,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.TWITTER,
      icon: ICONS.twitter,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.WEIBO,
      icon: ICONS.weibo,
      includeAll: true,
      proxies: (ctx) => ctx.lists.defaultProxiesDirect
    },
    {
      name: PROXY_GROUPS.TRUTH_SOCIAL,
      icon: ICONS.truthSocial,
      proxies: (ctx) => ctx.nodes.regionLayout.groupedCountries.includes(COUNTRY_KEYS.unitedStates) ? [
        countryGroupName(COUNTRY_KEYS.unitedStates),
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
      ] : ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.EHENTAI,
      icon: ICONS.ehentai,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      name: PROXY_GROUPS.PIKPAK,
      icon: ICONS.pikpak,
      proxies: (ctx) => ctx.lists.defaultProxies
    },
    {
      // 本 Fork 新增：PT 站普遍依赖回源 IP 统计连接与分享率，默认 DIRECT 优先，允许手动切代理。
      name: PROXY_GROUPS.PT_SITE,
      icon: ICONS.ptSite,
      proxies: (ctx) => ctx.lists.defaultProxiesDirect
    },
    {
      name: PROXY_GROUPS.SOGOU_INPUT,
      icon: ICONS.sogouInput,
      proxies: () => ["DIRECT", "REJECT"]
    }
  ];

  // src/analysis/honk-regions.ts
  function classifyHonkRegions(nodes) {
    const claimed = /* @__PURE__ */ new Set();
    const groups = [];
    for (const [country, tag] of HONK_COUNTRIES) {
      const matched = nodes.filter((node) => {
        if (!node.name || claimed.has(node.name)) return false;
        return node.name.includes(country);
      });
      if (matched.length === 0) continue;
      matched.forEach((node) => claimed.add(node.name));
      groups.push({ tag, names: [country], nodes: matched });
    }
    return groups;
  }

  // src/builders/rule-filter.ts
  var BUILT_IN_POLICIES = /* @__PURE__ */ new Set(["DIRECT", "REJECT", "REJECT-DROP"]);
  var INFRASTRUCTURE_GROUPS = /* @__PURE__ */ new Set([
    PROXY_GROUPS.SELECT,
    PROXY_GROUPS.MANUAL,
    PROXY_GROUPS.FRONT_PROXY,
    PROXY_GROUPS.LANDING,
    PROXY_GROUPS.AUTO,
    PROXY_GROUPS.FALLBACK,
    PROXY_GROUPS.FINAL,
    PROXY_GROUPS.LOW_COST,
    PROXY_GROUPS.GLOBAL,
    PROXY_GROUPS.PREFER,
    PROXY_GROUPS.TAILSCALE
  ]);
  function extractRuleIdentifiers(rule) {
    const identifiers = [];
    const ruleSetMatch = /RULE-SET,(\w+)/.exec(rule);
    if (ruleSetMatch) identifiers.push(ruleSetMatch[1]);
    const geositeMatch = /GEOSITE,([\w\-@!]+)/.exec(rule);
    if (geositeMatch) identifiers.push(geositeMatch[1]);
    const geoipMatch = /GEOIP,(\w+)/.exec(rule);
    if (geoipMatch) identifiers.push(geoipMatch[1]);
    const domainMatch = /DOMAIN-SUFFIX,([\w.]+)/.exec(rule);
    if (domainMatch) identifiers.push(domainMatch[1]);
    return identifiers;
  }
  function shouldKeepRule(rule, includedRules, excludedRules) {
    if (rule.includes("GEOIP,private") || rule.includes("GEOIP,cn") || rule.includes("MATCH")) {
      return true;
    }
    const identifiers = extractRuleIdentifiers(rule).map((id) => id.toLowerCase());
    if (includedRules !== null) {
      return identifiers.some((id) => includedRules.has(id));
    }
    return !identifiers.some((id) => excludedRules.has(id));
  }
  function getActiveProxyGroupNames(rules) {
    const names = /* @__PURE__ */ new Set();
    for (const rule of rules) {
      const parts = rule.split(",");
      const target = parts[parts.length - 1] === "no-resolve" ? parts[parts.length - 2] : parts[parts.length - 1];
      if (target && !BUILT_IN_POLICIES.has(target)) names.add(target);
    }
    return names;
  }

  // src/builders/honk/filter.ts
  var UTILITY_NODE_EXCLUDE = "官网|剩余|流量|套餐|免费|订阅|到期时间|直连|Expire Date|Traffic|ExpireDate|Expire|Official|Announcement|Notice|登录|充值";
  function isUtilityNode(name) {
    return new RegExp(UTILITY_NODE_EXCLUDE).test(name);
  }
  var REGION_NAMES_PATTERN = HONK_COUNTRIES.map(([country]) => country).join("|");
  var ALL_NODES_FILTER = `!name(regex: '${UTILITY_NODE_EXCLUDE}')`;
  var DIRECT_FILTER = "name(direct)";
  function groupFilter(tags) {
    const quoted = tags.map((tag) => `'${tag}'`).join(", ");
    return `group(${quoted})`;
  }
  function countryFilter(country) {
    return `name(regex: '${country}')`;
  }
  function unclassifiedFilter() {
    return `!name(regex: '${REGION_NAMES_PATTERN}') && !name(regex: '${UTILITY_NODE_EXCLUDE}')`;
  }
  function preferFilter(patterns) {
    if (!patterns) return null;
    const cleaned = patterns.map((pattern) => pattern.trim()).filter(Boolean);
    if (cleaned.length === 0) return null;
    return `name(regex: '${cleaned.join("|")}')`;
  }

  // src/builders/honk/groups.ts
  var ICON_BY_PROXY_KEY = {
    SELECT: ICONS.select,
    MANUAL: ICONS.manual,
    AUTO: ICONS.auto,
    STATIC_RESOURCES: ICONS.staticResources,
    AI_SERVICE: ICONS.aiService,
    CRYPTO: ICONS.crypto,
    FINANCE: ICONS.finance,
    APPLE: ICONS.apple,
    GOOGLE: ICONS.google,
    MICROSOFT: ICONS.microsoft,
    BILIBILI: ICONS.bilibili,
    BAHAMUT: ICONS.bahamut,
    XBOX: ICONS.xbox,
    GITHUB: ICONS.github,
    YOUTUBE: ICONS.youtube,
    NETFLIX: ICONS.netflix,
    TIKTOK: ICONS.tiktok,
    SPOTIFY: ICONS.spotify,
    EHENTAI: ICONS.ehentai,
    TELEGRAM: ICONS.telegram,
    TRUTH_SOCIAL: ICONS.truthSocial,
    TWITTER: ICONS.twitter,
    TWITCH: ICONS.twitch,
    WEIBO: ICONS.weibo,
    PIKPAK: ICONS.pikpak,
    PT_SITE: ICONS.ptSite,
    FINAL: ICONS.final,
    PREFER: ICONS.prefer
  };
  function iconOf(key) {
    return ICON_BY_PROXY_KEY[key];
  }
  function findCountryMeta(country) {
    return Object.hasOwn(countriesMeta, country) ? countriesMeta[country] : void 0;
  }
  function buildRegionGroups(nodes) {
    return classifyHonkRegions(nodes.allNodes).map((region) => {
      const meta = findCountryMeta(region.names[0]);
      return {
        country: region.names.join("|"),
        tag: region.tag,
        icon: meta?.icon ?? ICONS.global
      };
    });
  }
  function collectHonkTargets(rules) {
    const targets = /* @__PURE__ */ new Set();
    for (const name of getActiveProxyGroupNames([...rules])) {
      const tag = toHonkName(name);
      if (tag) targets.add(tag);
    }
    return targets;
  }
  function filterLines(spec) {
    const filter = spec.filter;
    if (filter === void 0) return [];
    if (typeof filter === "string") return [filter];
    return [...filter];
  }
  function renderGroup(spec) {
    const lines = [`    ${spec.name} {`];
    for (const filter of filterLines(spec)) {
      lines.push(`        filter: ${filter}`);
    }
    lines.push(`        policy: ${spec.policy}`);
    if (spec.defaultValue) lines.push(`        default: '${spec.defaultValue}'`);
    if (spec.final) lines.push(`        final: ${spec.final}`);
    if (spec.icon) lines.push(`        icon: '${spec.icon}'`);
    if (typeof spec.tolerance === "number") lines.push(`        tolerance: ${spec.tolerance}`);
    if (typeof spec.idleTimeout === "number")
      lines.push(`        idle_timeout: ${spec.idleTimeout}`);
    if (spec.checkUrl) lines.push(`        check_url: '${spec.checkUrl}'`);
    if (spec.interruptConnections) lines.push(`        interrupt_connections: true`);
    lines.push(`    }`);
    return lines;
  }
  function buildBaseGroupSpecs(ctx, regionGroups, unclassified, tuneExtras) {
    const { opts } = ctx;
    const policy = opts.policy;
    const regionTags = regionGroups.map((r) => r.tag);
    const manualTag = requireHonkName("MANUAL");
    const specs = [];
    for (const region of regionGroups) {
      specs.push({
        name: region.tag,
        filter: countryFilter(region.country),
        policy,
        icon: region.icon,
        ...tuneExtras
      });
    }
    if (unclassified.length > 0) {
      specs.push({
        name: UNCLASSIFIED_GROUP_NAME,
        filter: unclassifiedFilter(),
        policy,
        icon: ICONS.global,
        ...tuneExtras
      });
    }
    const autoCandidates = [
      ...regionTags,
      ...unclassified.length > 0 ? [UNCLASSIFIED_GROUP_NAME] : []
    ];
    specs.push({
      name: requireHonkName("AUTO"),
      filter: groupFilter(autoCandidates.length > 0 ? autoCandidates : [manualTag]),
      policy,
      icon: iconOf("AUTO"),
      ...tuneExtras
    });
    specs.push({
      name: manualTag,
      filter: ALL_NODES_FILTER,
      policy: "select",
      icon: iconOf("MANUAL")
    });
    return specs;
  }
  function buildSelectGroupSpecs(ctx, regionTags, extraTags, prefer) {
    const specs = [];
    if (prefer) {
      specs.push({
        name: requireHonkName("PREFER"),
        filter: prefer,
        policy: "fallback",
        final: requireHonkName("AUTO"),
        icon: iconOf("PREFER")
      });
    }
    const preferTag = requireHonkName("PREFER");
    specs.push({
      name: requireHonkName("SELECT"),
      filter: groupFilter([
        ...prefer ? [preferTag] : [],
        requireHonkName("AUTO"),
        ...regionTags,
        ...extraTags,
        requireHonkName("MANUAL")
      ]),
      policy: "select",
      defaultValue: prefer ? preferTag : requireHonkName("AUTO"),
      final: "direct",
      icon: iconOf("SELECT"),
      interruptConnections: true
    });
    return specs;
  }
  function buildServiceGroupSpecs(regionTagByCountry, regionTags, extraTags, activeTargets) {
    const specs = [];
    const serviceBaseTags = [
      requireHonkName("SELECT"),
      ...regionTags,
      ...extraTags,
      requireHonkName("MANUAL")
    ];
    for (const svc of serviceGroups) {
      const honkName = toHonkName(svc.name);
      if (!honkName) continue;
      if (activeTargets && !activeTargets.has(honkName)) continue;
      const candidates = honkServiceCandidates(svc.name, regionTagByCountry, serviceBaseTags);
      specs.push({
        name: honkName,
        filter: candidates.includeDirect ? [groupFilter(candidates.tags), DIRECT_FILTER] : groupFilter(candidates.tags),
        policy: "select",
        defaultValue: candidates.defaultTag,
        final: "direct",
        icon: svc.icon
      });
    }
    return specs;
  }
  var UNCLASSIFIED_GROUP_NAME = "Other";
  function isCoveredByRegion(name) {
    return HONK_COUNTRIES.some(([country]) => name.includes(country));
  }
  function buildUnclassifiedNodes(nodes) {
    const tailscaleNames = new Set(nodes.tailscaleNodes.map((node) => node.name));
    return nodes.allNodes.filter((node) => {
      if (!node.name) return false;
      if (tailscaleNames.has(node.name)) return false;
      if (isUtilityNode(node.name)) return false;
      return !isCoveredByRegion(node.name);
    });
  }
  function buildHonkGroupSpecs(ctx, activeTargets = null) {
    const { flags, opts } = ctx;
    const policy = opts.policy;
    const tuneExtras = policy === "select" || policy === "selector" || policy === "fixed" ? {} : {
      tolerance: opts.tolerance ?? void 0,
      idleTimeout: opts.idleTimeout ?? void 0,
      checkUrl: opts.checkUrl ?? void 0,
      ...opts.interruptConnections ? { interruptConnections: true } : {}
    };
    const regionGroups = buildRegionGroups(ctx.nodes);
    const regionTagByCountry = new Map(regionGroups.map((r) => [r.country, r.tag]));
    const regionTags = regionGroups.map((r) => r.tag);
    const unclassified = buildUnclassifiedNodes(ctx.nodes);
    const extraTags = unclassified.length > 0 ? [UNCLASSIFIED_GROUP_NAME] : [];
    const prefer = preferFilter(flags.preferPatterns);
    return [
      ...buildBaseGroupSpecs(ctx, regionGroups, unclassified, tuneExtras),
      ...buildSelectGroupSpecs(ctx, regionTags, extraTags, prefer),
      ...buildServiceGroupSpecs(regionTagByCountry, regionTags, extraTags, activeTargets),
      // Final：默认分流策略——选择代理 / 地区 / 未分类 / 手动选择 / 直连，
      // 默认停在直连（其余候选仍在，可手动切走）。
      {
        name: requireHonkName("FINAL"),
        filter: [
          groupFilter([
            requireHonkName("SELECT"),
            ...regionTags,
            ...extraTags,
            requireHonkName("MANUAL")
          ]),
          DIRECT_FILTER
        ],
        policy: "select",
        defaultValue: "direct",
        final: "direct",
        icon: iconOf("FINAL"),
        interruptConnections: true
      }
    ];
  }
  function buildHonkGroups(ctx, activeTargets = null) {
    const lines = ["group {"];
    for (const spec of buildHonkGroupSpecs(ctx, activeTargets)) {
      lines.push(...renderGroup(spec));
    }
    lines.push("}");
    return lines;
  }

  // src/catalog/rule-sets.ts
  var ruleSets = {
    ADBlock: {
      type: "http",
      behavior: "domain",
      format: "yaml",
      interval: 86400,
      url: `${CDN_URL}/gh/217heidai/adblockfilters@main/rules/adblockmihomolite.yaml`,
      path: "./ruleset/ADBlock.yaml"
    },
    SogouInput: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://ruleset.skk.moe/Clash/non_ip/sogouinput.txt",
      path: "./ruleset/SogouInput.txt"
    },
    StaticResources: {
      type: "http",
      behavior: "domain",
      format: "text",
      interval: 86400,
      url: "https://ruleset.skk.moe/Clash/domainset/cdn.txt",
      path: "./ruleset/StaticResources.txt"
    },
    CDNResources: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: "https://ruleset.skk.moe/Clash/non_ip/cdn.txt",
      path: "./ruleset/CDNResources.txt"
    },
    TikTok: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/TikTok.list`,
      path: "./ruleset/TikTok.list"
    },
    EHentai: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/EHentai.list`,
      path: "./ruleset/EHentai.list"
    },
    SteamFix: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/SteamFix.list`,
      path: "./ruleset/SteamFix.list"
    },
    AdditionalFilter: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/AdditionalFilter.list`,
      path: "./ruleset/AdditionalFilter.list"
    },
    AdditionalCDNResources: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/AdditionalCDNResources.list`,
      path: "./ruleset/AdditionalCDNResources.list"
    },
    Weibo: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/Weibo.list`,
      path: "./ruleset/Weibo.list"
    },
    PT: {
      type: "http",
      behavior: "classical",
      format: "text",
      interval: 86400,
      url: `${PROJECT_URL}/ruleset/PT.list`,
      path: "./ruleset/PT.list"
    },
    GFWList: {
      type: "http",
      behavior: "domain",
      format: "yaml",
      interval: 86400,
      url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt",
      path: "./ruleset/GFWList.yaml"
    }
  };
  var adblockAlternatives = {
    1: {
      type: "http",
      behavior: "domain",
      format: "mrs",
      interval: 86400,
      url: "https://adrules.top/adrules-mihomo.mrs",
      path: "./ruleset/ADBlock.mrs"
    },
    3: {
      type: "http",
      behavior: "domain",
      format: "mrs",
      interval: 86400,
      url: `${CDN_URL}/gh/TG-Twilight/AWAvenue-Ads-Rule@main/Filters/AWAvenue-Ads-Rule-Clash.mrs`,
      path: "./ruleset/ADBlock.mrs"
    }
  };
  function ruleSet(key, target) {
    return `RULE-SET,${key},${target}`;
  }

  // src/builders/rules.ts
  function buildRules({
    quicEnabled,
    hasTailscale,
    includedRules = null,
    excludedRules = /* @__PURE__ */ new Set(),
    adblockSource = ARG_DEFAULTS.adblockSource
  }) {
    const serviceRules = [
      `GEOIP,private,DIRECT,no-resolve`,
      adblockSource > 0 ? ruleSet("ADBlock", PROXY_GROUPS.AD_BLOCK) : null,
      adblockSource > 0 ? ruleSet("AdditionalFilter", PROXY_GROUPS.AD_BLOCK) : null,
      ruleSet("SogouInput", PROXY_GROUPS.SOGOU_INPUT),
      `DOMAIN-SUFFIX,truthsocial.com,${PROXY_GROUPS.TRUTH_SOCIAL}`,
      ruleSet("StaticResources", PROXY_GROUPS.STATIC_RESOURCES),
      ruleSet("CDNResources", PROXY_GROUPS.STATIC_RESOURCES),
      ruleSet("AdditionalCDNResources", PROXY_GROUPS.STATIC_RESOURCES),
      `GEOSITE,category-cryptocurrency,${PROXY_GROUPS.CRYPTO}`,
      `GEOSITE,category-finance,${PROXY_GROUPS.FINANCE}`,
      `GEOSITE,category-ai-!cn,${PROXY_GROUPS.AI_SERVICE}`,
      `GEOSITE,bilibili,${PROXY_GROUPS.BILIBILI}`,
      `GEOSITE,youtube,${PROXY_GROUPS.YOUTUBE}`,
      `GEOSITE,telegram,${PROXY_GROUPS.TELEGRAM}`,
      `GEOIP,telegram,${PROXY_GROUPS.TELEGRAM},no-resolve`,
      `GEOSITE,xbox,${PROXY_GROUPS.XBOX}`,
      `GEOSITE,github,${PROXY_GROUPS.GITHUB}`,
      `GEOSITE,netflix,${PROXY_GROUPS.NETFLIX}`,
      `GEOSITE,twitch,${PROXY_GROUPS.TWITCH}`,
      `GEOIP,netflix,${PROXY_GROUPS.NETFLIX},no-resolve`,
      `GEOSITE,spotify,${PROXY_GROUPS.SPOTIFY}`,
      `GEOSITE,bahamut,${PROXY_GROUPS.BAHAMUT}`,
      `GEOSITE,pikpak,${PROXY_GROUPS.PIKPAK}`,
      ruleSet("PT", PROXY_GROUPS.PT_SITE),
      `GEOSITE,twitter,${PROXY_GROUPS.TWITTER}`,
      ruleSet("Weibo", PROXY_GROUPS.WEIBO),
      ruleSet("EHentai", PROXY_GROUPS.EHENTAI),
      ruleSet("TikTok", PROXY_GROUPS.TIKTOK),
      ruleSet("SteamFix", "DIRECT"),
      `GEOSITE,google-play@cn,DIRECT`,
      `GEOSITE,microsoft@cn,DIRECT`,
      `GEOSITE,apple,${PROXY_GROUPS.APPLE}`,
      `GEOSITE,microsoft,${PROXY_GROUPS.MICROSOFT}`,
      `GEOSITE,google,${PROXY_GROUPS.GOOGLE}`,
      ruleSet("GFWList", PROXY_GROUPS.SELECT),
      `GEOIP,cn,DIRECT`,
      `MATCH,${PROXY_GROUPS.FINAL}`
    ].filter((rule) => rule !== null && shouldKeepRule(rule, includedRules, excludedRules));
    return [
      !quicEnabled ? `AND,((DST-PORT,443),(NETWORK,UDP)),REJECT` : null,
      hasTailscale ? `IP-CIDR,100.64.0.0/10,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      hasTailscale ? `IP-CIDR,fd7a:115c:a1e0::/48,${PROXY_GROUPS.TAILSCALE},no-resolve` : null,
      hasTailscale ? `DOMAIN-SUFFIX,ts.net,${PROXY_GROUPS.TAILSCALE}` : null,
      ...serviceRules
    ].filter(isNotNull);
  }

  // src/builders/honk/rules.ts
  var CLASH_ACTION_TO_HONK = {
    DIRECT: "direct",
    REJECT: "block",
    "REJECT-DROP": "block"
  };
  var CLASH_GROUP_TO_HONK_ACTION = {
    [PROXY_GROUPS.AD_BLOCK]: "block",
    [PROXY_GROUPS.SOGOU_INPUT]: "direct"
  };
  var EXTERNAL_RULESET_TO_GEOSITE = {
    ADBlock: "category-ads-all",
    GFWList: "geolocation-!cn"
  };
  var EXTERNAL_RULESETS_SKIPPED = [
    "SogouInput",
    "StaticResources",
    "CDNResources"
  ];
  var CLASH_QUIC_REJECT_RULE = "AND,((DST-PORT,443),(NETWORK,UDP)),REJECT";
  var HONK_QUIC_REJECT_RULE = "    l4proto(udp) && dport(443) -> block";
  function translateTarget(clashTarget) {
    if (!clashTarget) return null;
    const action = CLASH_ACTION_TO_HONK[clashTarget];
    if (action) return action;
    const shortcut = CLASH_GROUP_TO_HONK_ACTION[clashTarget];
    if (shortcut) return shortcut;
    return toHonkName(clashTarget);
  }
  function parseRulesetEntries(entries) {
    const full = [];
    const suffix = [];
    const keyword = [];
    for (const raw of entries) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      const parts = line.split(",");
      if (parts.length < 2) continue;
      const type = parts[0].trim().toUpperCase();
      const value = parts[1].trim();
      if (!value) continue;
      if (type === "DOMAIN") full.push(value);
      else if (type === "DOMAIN-SUFFIX") suffix.push(value);
      else if (type === "DOMAIN-KEYWORD") keyword.push(value);
    }
    return { full, suffix, keyword };
  }
  function inlineRuleSet(entries, honkTarget) {
    const { full, suffix, keyword } = parseRulesetEntries(entries);
    const lines = [];
    if (full.length > 0) lines.push(`    domain(full: ${full.join(", ")}) -> ${honkTarget}`);
    if (suffix.length > 0) lines.push(`    domain(suffix: ${suffix.join(", ")}) -> ${honkTarget}`);
    if (keyword.length > 0)
      lines.push(`    domain(keyword: ${keyword.join(", ")}) -> ${honkTarget}`);
    return lines;
  }
  function translateRuleSet(key, honkTarget, inlinedRuleSets) {
    if (Object.prototype.hasOwnProperty.call(inlinedRuleSets, key)) {
      return inlineRuleSet(inlinedRuleSets[key] ?? [], honkTarget);
    }
    const geositeApprox = EXTERNAL_RULESET_TO_GEOSITE[key];
    if (geositeApprox) {
      return [`    domain(geosite: ${geositeApprox}) -> ${honkTarget}`];
    }
    if (EXTERNAL_RULESETS_SKIPPED.includes(key)) {
      return [
        `    # [honk] RULE-SET,${key} 依赖外部 rule-provider，honk 不支持；如需请手工添加。`
      ];
    }
    return [`    # [honk] 未识别的 RULE-SET,${key}，已跳过。`];
  }
  function translateRule(rule, inlinedRuleSets) {
    if (rule === CLASH_QUIC_REJECT_RULE) {
      return [HONK_QUIC_REJECT_RULE];
    }
    if (rule.startsWith("MATCH,")) {
      const target = translateTarget(rule.split(",")[1]);
      return target ? [`    fallback: ${target}`] : [];
    }
    const parts = rule.split(",");
    if (parts.length < 3) return [];
    const [type, arg1] = parts;
    const hasNoResolve = parts.at(-1) === "no-resolve";
    const clashTarget = hasNoResolve ? parts.at(-2) : parts.at(-1);
    const honkTarget = translateTarget(clashTarget);
    if (!honkTarget) return [];
    switch (type) {
      case "GEOIP":
        if (arg1 === "private") {
          return [`    dip(geoip: private) && !dport(53) -> direct(must)`];
        }
        if (arg1 === "cn") {
          return [`    dip(geoip: cn) && !dport(53, 853) -> direct(must)`];
        }
        return [`    dip(geoip: ${arg1}) -> ${honkTarget}`];
      case "GEOSITE":
        return [`    domain(geosite: ${arg1}) -> ${honkTarget}`];
      case "DOMAIN-SUFFIX":
        return [`    domain(suffix: ${arg1}) -> ${honkTarget}`];
      case "RULE-SET":
        return translateRuleSet(arg1, honkTarget, inlinedRuleSets);
      // IP-CIDR 目前只用于 Tailscale 定向分流；honk 无对应 outbound，整体忽略。
      case "IP-CIDR":
        return [];
      default:
        return [];
    }
  }
  function buildHonkClashRules(ctx) {
    return buildRules({
      quicEnabled: ctx.flags.quicEnabled,
      hasTailscale: ctx.nodes.hasTailscale,
      includedRules: ctx.flags.includedRules,
      excludedRules: ctx.flags.excludedRules,
      adblockSource: ctx.flags.adblockSource
    });
  }
  function buildHonkRoutingLines(ctx, inlinedRuleSets) {
    const rules = buildHonkClashRules(ctx);
    const lines = [];
    for (const rule of rules) {
      lines.push(...translateRule(rule, inlinedRuleSets));
    }
    return lines;
  }

  // src/builders/honk/render.ts
  var INCLUDE_BLOCK = ["include {", "    system.dae", "}"];
  function renderSubscriptionBlock(ctx) {
    const { opts } = ctx;
    const isPlaceholder = opts.subscriptionUrl.startsWith("https://example.com/");
    const lines = ["subscription {"];
    if (isPlaceholder) {
      lines.push(
        "    # TODO: 通过 Sub-Store URL hash `#subscription=<url-encoded>` 传入你的订阅地址。"
      );
    }
    lines.push(
      `    ${opts.subscriptionTag}: '${opts.subscriptionUrl}' {`,
      `        interval: ${opts.subscriptionInterval}`,
      `        route: ${opts.subscriptionRoute}`,
      `        cache: ${opts.subscriptionCache}`,
      `        ua: '${opts.subscriptionUa}'`,
      "    }",
      "}"
    );
    return lines;
  }
  function renderParameterFingerprint(ctx) {
    const { flags, opts } = ctx;
    const includeLabel = flags.includedRules ? Array.from(flags.includedRules).join("|") : "-";
    const excludeLabel = flags.excludedRules.size > 0 ? Array.from(flags.excludedRules).join("|") : "-";
    const preferLabel = flags.preferPatterns ? flags.preferPatterns.join("|") : "-";
    const policyLabel = opts.policy === HONK_POLICIES[flags.groupType] ? `${opts.policy} (grouptype=${flags.groupType})` : `${opts.policy} (override grouptype=${flags.groupType})`;
    return [
      `subscription=${opts.subscriptionUrl}`,
      `policy=${policyLabel}`,
      `adblock=${flags.adblockSource}`,
      `ipv6=${flags.ipv6Enabled ? "on" : "off"}`,
      `quic=${flags.quicEnabled ? "on" : "off"}`,
      `include=${includeLabel}`,
      `exclude=${excludeLabel}`,
      `prefer=${preferLabel}`
    ].join(", ");
  }
  function renderBanner(ctx) {
    return [
      "# 由 override-rules 的 honk 覆写动态生成，请勿直接编辑。",
      "# 入口：src/main-honk.ts → convert-honk.min.js（Sub-Store 覆写）。",
      "# 目标客户端：honk (https://github.com/daeuniverse/honk)，dae 兼容语法。",
      "# 本文件只负责策略骨架（subscription / group / dns / routing），",
      "# global 与 experimental 通过 include 从同目录下的 system.dae 加载。",
      `# 参数：${renderParameterFingerprint(ctx)}`,
      "# honk 侧无对应概念、已从 mihomo 语义裁剪的字段：landing / dialer-proxy 链式代理、",
      "# Tailscale outbound、fake-ip、sniffer、tcp-keepalive、tun、manual、GLOBAL。",
      ""
    ];
  }
  function renderHonkConfig(ctx, inlinedRuleSets) {
    const routingLines = buildHonkRoutingLines(ctx, inlinedRuleSets);
    const activeTargets = collectHonkTargets(buildHonkClashRules(ctx));
    const sections = [
      renderBanner(ctx),
      [...INCLUDE_BLOCK],
      renderSubscriptionBlock(ctx),
      buildHonkGroups(ctx, activeTargets),
      buildHonkDns(ctx.flags, ctx.opts),
      ["routing {", ...routingLines, "}"]
    ];
    return `${sections.map((lines) => lines.join("\n")).join("\n\n")}
`;
  }

  // src/builders/honk/index.ts
  function buildHonkDae(ctx, inlinedRuleSets = {}) {
    return renderHonkConfig(ctx, inlinedRuleSets);
  }

  // src/generated/honk-rulesets.ts
  var INLINED_HONK_RULESETS = {
    "TikTok": [
      "DOMAIN,lf16-effectcdn.byteeffecttos-g.com",
      "DOMAIN,lf16-pkgcdn.pitaya-clientai.com",
      "DOMAIN,p16-tiktokcdn-com.akamaized.net",
      "DOMAIN-SUFFIX,bytedapm.com",
      "DOMAIN-SUFFIX,bytegecko-i18n.com",
      "DOMAIN-SUFFIX,byteoversea.com",
      "DOMAIN-SUFFIX,capcut.com",
      "DOMAIN-SUFFIX,ibytedtos.com",
      "DOMAIN-SUFFIX,ibyteimg.com",
      "DOMAIN-SUFFIX,ipstatp.com",
      "DOMAIN-SUFFIX,isnssdk.com",
      "DOMAIN-SUFFIX,muscdn.com",
      "DOMAIN-SUFFIX,musical.ly",
      "DOMAIN-SUFFIX,sgpstatp.com",
      "DOMAIN-SUFFIX,snssdk.com",
      "DOMAIN-SUFFIX,tik-tokapi.com",
      "DOMAIN-SUFFIX,tiktok.com",
      "DOMAIN-SUFFIX,tiktokcdn-us.com",
      "DOMAIN-SUFFIX,tiktokcdn.com",
      "DOMAIN-SUFFIX,tiktokd.net",
      "DOMAIN-SUFFIX,tiktokd.org",
      "DOMAIN-SUFFIX,tiktokmusic.app",
      "DOMAIN-SUFFIX,tiktokv.com",
      "DOMAIN-SUFFIX,tiktokv.us",
      "DOMAIN-SUFFIX,ttwebview.com",
      "DOMAIN-KEYWORD,musical.ly",
      "DOMAIN-KEYWORD,tiktok",
      "PROCESS-NAME,com.zhiliaoapp.musically"
    ],
    "EHentai": [
      "DOMAIN-SUFFIX,e-hentai.org",
      "DOMAIN-SUFFIX,ehgt.org",
      "DOMAIN-SUFFIX,ehwiki.org",
      "DOMAIN-SUFFIX,exhentai.org",
      "DOMAIN-SUFFIX,hath.network",
      "DOMAIN-SUFFIX,hentaiverse.org",
      "IP-CIDR,178.175.128.0/21,no-resolve"
    ],
    "Weibo": [
      "DOMAIN-SUFFIX,weibo.cn",
      "DOMAIN-SUFFIX,weibo.com",
      "DOMAIN-SUFFIX,weibo.com.cn"
    ],
    "PT": [
      "DOMAIN,hudbt.hust.edu.cn",
      "DOMAIN,pt.sjtu.edu.cn",
      "DOMAIN,resource.xidian.edu.cn",
      "DOMAIN-SUFFIX,0ff.cc",
      "DOMAIN-SUFFIX,1ptba.com",
      "DOMAIN-SUFFIX,52pt.site",
      "DOMAIN-SUFFIX,agsvpt.com",
      "DOMAIN-SUFFIX,aither.cc",
      "DOMAIN-SUFFIX,anthelion.me",
      "DOMAIN-SUFFIX,asiancinema.me",
      "DOMAIN-SUFFIX,audiences.me",
      "DOMAIN-SUFFIX,avistaz.to",
      "DOMAIN-SUFFIX,beyond-hd.me",
      "DOMAIN-SUFFIX,blutopia.xyz",
      "DOMAIN-SUFFIX,broadcasthe.net",
      "DOMAIN-SUFFIX,btschool.club",
      "DOMAIN-SUFFIX,byr.pt",
      "DOMAIN-SUFFIX,carpt.net",
      "DOMAIN-SUFFIX,chdbits.co",
      "DOMAIN-SUFFIX,cinemageddon.net",
      "DOMAIN-SUFFIX,cinematik.net",
      "DOMAIN-SUFFIX,cinemaz.to",
      "DOMAIN-SUFFIX,crabpt.vip",
      "DOMAIN-SUFFIX,cyanbug.net",
      "DOMAIN-SUFFIX,dajiao.cyou",
      "DOMAIN-SUFFIX,darkland.top",
      "DOMAIN-SUFFIX,dicmusic.club",
      "DOMAIN-SUFFIX,digitalcore.club",
      "DOMAIN-SUFFIX,discfan.net",
      "DOMAIN-SUFFIX,dmhy.org",
      "DOMAIN-SUFFIX,dragonhd.xyz",
      "DOMAIN-SUFFIX,eastgame.org",
      "DOMAIN-SUFFIX,et8.org",
      "DOMAIN-SUFFIX,fearnopeer.com",
      "DOMAIN-SUFFIX,filelist.io",
      "DOMAIN-SUFFIX,haidan.video",
      "DOMAIN-SUFFIX,hd-torrents.org",
      "DOMAIN-SUFFIX,hd-space.org",
      "DOMAIN-SUFFIX,hd4fans.org",
      "DOMAIN-SUFFIX,hdarea.club",
      "DOMAIN-SUFFIX,hdatmos.club",
      "DOMAIN-SUFFIX,hdbits.org",
      "DOMAIN-SUFFIX,hdchina.org",
      "DOMAIN-SUFFIX,hdcity.city",
      "DOMAIN-SUFFIX,hddolby.com",
      "DOMAIN-SUFFIX,hdf.world",
      "DOMAIN-SUFFIX,hdfans.org",
      "DOMAIN-SUFFIX,hdfun.me",
      "DOMAIN-SUFFIX,hdhome.org",
      "DOMAIN-SUFFIX,hdpost.top",
      "DOMAIN-SUFFIX,hdpt.xyz",
      "DOMAIN-SUFFIX,hdroute.org",
      "DOMAIN-SUFFIX,hdsky.me",
      "DOMAIN-SUFFIX,hdtime.org",
      "DOMAIN-SUFFIX,hdkyl.in",
      "DOMAIN-SUFFIX,hhan.club",
      "DOMAIN-SUFFIX,hhanclub.top",
      "DOMAIN-SUFFIX,hitpt.com",
      "DOMAIN-SUFFIX,htpt.cc",
      "DOMAIN-SUFFIX,icc2022.com",
      "DOMAIN-SUFFIX,icetorrent.org",
      "DOMAIN-SUFFIX,ilolicon.com",
      "DOMAIN-SUFFIX,itzmx.com",
      "DOMAIN-SUFFIX,jpopsuki.eu",
      "DOMAIN-SUFFIX,jptv.club",
      "DOMAIN-SUFFIX,joyhd.net",
      "DOMAIN-SUFFIX,karagarga.in",
      "DOMAIN-SUFFIX,kufei.org",
      "DOMAIN-SUFFIX,leaves.red",
      "DOMAIN-SUFFIX,lemonhd.club",
      "DOMAIN-SUFFIX,m-team.cc",
      "DOMAIN-SUFFIX,mikanani.me",
      "DOMAIN-SUFFIX,monikadesign.uk",
      "DOMAIN-SUFFIX,morethantv.me",
      "DOMAIN-SUFFIX,nanyangpt.com",
      "DOMAIN-SUFFIX,nebulance.io",
      "DOMAIN-SUFFIX,nicept.net",
      "DOMAIN-SUFFIX,njtupt.top",
      "DOMAIN-SUFFIX,npupt.com",
      "DOMAIN-SUFFIX,okpt.net",
      "DOMAIN-SUFFIX,onlyencodes.cc",
      "DOMAIN-SUFFIX,open.cd",
      "DOMAIN-SUFFIX,orpheus.network",
      "DOMAIN-SUFFIX,ourbits.club",
      "DOMAIN-SUFFIX,ourhelp.club",
      "DOMAIN-SUFFIX,pandapt.net",
      "DOMAIN-SUFFIX,passthepopcorn.me",
      "DOMAIN-SUFFIX,piggo.me",
      "DOMAIN-SUFFIX,privatehd.to",
      "DOMAIN-SUFFIX,ptchdbits.co",
      "DOMAIN-SUFFIX,pterclub.com",
      "DOMAIN-SUFFIX,pthome.net",
      "DOMAIN-SUFFIX,ptlgs.org",
      "DOMAIN-SUFFIX,ptsbao.club",
      "DOMAIN-SUFFIX,pttime.org",
      "DOMAIN-SUFFIX,ptvicomo.net",
      "DOMAIN-SUFFIX,ptzone.xyz",
      "DOMAIN-SUFFIX,qingwapt.com",
      "DOMAIN-SUFFIX,raingfh.top",
      "DOMAIN-SUFFIX,redacted.ch",
      "DOMAIN-SUFFIX,reelflix.xyz",
      "DOMAIN-SUFFIX,secret-cinema.pw",
      "DOMAIN-SUFFIX,shadowthein.net",
      "DOMAIN-SUFFIX,skyeysnow.com",
      "DOMAIN-SUFFIX,soulvoice.club",
      "DOMAIN-SUFFIX,springsunday.net",
      "DOMAIN-SUFFIX,star-space.net",
      "DOMAIN-SUFFIX,tjupt.org",
      "DOMAIN-SUFFIX,totheglory.im",
      "DOMAIN-SUFFIX,torrentleech.org",
      "DOMAIN-SUFFIX,tv-vault.me",
      "DOMAIN-SUFFIX,ubits.club",
      "DOMAIN-SUFFIX,uhdbits.org",
      "DOMAIN-SUFFIX,ultrahd.net",
      "DOMAIN-SUFFIX,wintersakura.org",
      "DOMAIN-SUFFIX,xingtan.one",
      "DOMAIN-SUFFIX,zhuque.in",
      "DOMAIN-SUFFIX,zmpt.cc",
      ""
    ],
    "SteamFix": [
      "DOMAIN,steamcdn-a.akamaihd.net",
      "DOMAIN-SUFFIX,cm.steampowered.com",
      "DOMAIN-SUFFIX,steamserver.net"
    ],
    "AdditionalFilter": [
      "# 屏蔽 TikTok Mod 烦人的更新提示",
      "DOMAIN,tigr1234566.github.io",
      "DOMAIN,rezvorck.github.io"
    ],
    "AdditionalCDNResources": [
      "# 一些我个人收集的，符合「静态资源」代理组用途的域名",
      "DOMAIN,production.cloudflare.docker.com",
      "DOMAIN,dl.flathub.org",
      "DOMAIN-SUFFIX,data.microsoft.com",
      "DOMAIN,assets.ppy.sh",
      "DOMAIN,autoupdate.termius.com",
      "DOMAIN,update.ayugram.one",
      "DOMAIN,sh.nfs.pub",
      "DOMAIN,download.calibre-ebook.com",
      "DOMAIN,dl.google.com",
      "DOMAIN,builds.dotnet.microsoft.com",
      "DOMAIN,downloadmirror.intel.com",
      "DOMAIN,pkgs.tailscale.com",
      "DOMAIN,dl.tailscale.com",
      "DOMAIN,vscode.download.prss.microsoft.com",
      "",
      "# Brave",
      "DOMAIN,updates-cdn.bravesoftware.com",
      "DOMAIN,updates.bravesoftware.com",
      "DOMAIN,dl.brave.com",
      "DOMAIN,referrals.brave.com",
      "",
      "# Spotify",
      "DOMAIN-SUFFIX,scdn.co",
      "DOMAIN-SUFFIX,spotifycdn.com",
      "DOMAIN-SUFFIX,spotifycdn.net",
      "DOMAIN-SUFFIX,pscdn.co",
      "",
      "# Geekbench",
      "DOMAIN,cdn.geekbench.com",
      "",
      "# REGEX",
      "DOMAIN-REGEX,^gvt\\d\\.com$",
      "DOMAIN-REGEX,^downloads\\d+\\.broadcom\\.com$",
      "DOMAIN-REGEX,^cdn\\d{2}\\.foxitsoftware\\.com$",
      ""
    ]
  };

  // src/builders/honk/script.ts
  function buildHonkFromConfig(config, args, fileContext = null, requestContext = null) {
    if (!config.proxies || !Array.isArray(config.proxies)) {
      throw new Error("[powerfullz 的 honk 覆写] 错误：Clash 配置中缺少有效的 proxies 字段");
    }
    const flags = buildFeatureFlags(args);
    const opts = buildHonkRuntimeOptions(args, flags, fileContext, requestContext);
    const nodes = analyzeNodes(config.proxies, flags.countryThreshold, flags.preferPatterns);
    return buildHonkDae({ flags, opts, nodes }, INLINED_HONK_RULESETS);
  }

  // src/builders/honk/file-scope.ts
  function parseWithYaml(raw) {
    if (typeof yaml === "undefined" || typeof yaml.parse !== "function") return null;
    try {
      const parsed = yaml.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
    return null;
  }
  function parseWithProxyUtils(raw) {
    if (typeof ProxyUtils === "undefined" || typeof ProxyUtils.parse !== "function") {
      return null;
    }
    try {
      const parsed = ProxyUtils.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
    }
    return null;
  }
  function buildHonkFileScope(raw, args, fileContext = null, requestContext = null) {
    const config = parseWithYaml(raw);
    if (config) {
      return buildHonkFromConfig(config, args, fileContext, requestContext);
    }
    const proxies = parseWithProxyUtils(raw);
    if (proxies) {
      return buildHonkFromConfig({ proxies }, args, fileContext, requestContext);
    }
    throw new Error(
      "[powerfullz 的 honk 覆写] 错误：无法从 Sub-Store 传入的上游内容里解析出节点（$content 既不是合法的 Clash 配置，也没解析出节点）"
    );
  }

  // src/main-honk.ts
  function readRawArgs() {
    try {
      return $arguments;
    } catch {
      return {};
    }
  }
  function readFileContext() {
    try {
      if (typeof $file !== "undefined" && $file != null) {
        return $file;
      }
    } catch {
    }
    return null;
  }
  function readRequestContext() {
    try {
      if (typeof $options !== "undefined" && $options != null) {
        const req = $options._req;
        if (typeof req === "object" && req !== null) {
          return req;
        }
      }
    } catch {
    }
    return null;
  }
  function isSubStoreScope() {
    try {
      return typeof $arguments !== "undefined";
    } catch {
      return false;
    }
  }
  function suppressGlobalMainLookup() {
    const scope = globalThis;
    if (typeof scope.main === "function") {
      scope.main = void 0;
    }
  }
  function warnWrongScope() {
    const scope = globalThis;
    if (scope.__honkScopeWarned) return;
    scope.__honkScopeWarned = true;
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(
        "[powerfullz 的 honk 覆写] 脚本被挂在节点列表上，这里不会生效；请把它挂到「文件」上（类型选「Clash Config」，来源选你的组合订阅）。"
      );
    }
  }
  function runHonkEntry(config, rawArgs, fileContext = null, requestContext = null) {
    return buildHonkFromConfig(config, rawArgs, fileContext, requestContext);
  }
  function applyFileScope() {
    if (typeof $content === "undefined") {
      if (typeof input !== "undefined") {
        warnWrongScope();
      }
      return;
    }
    const fileContext = readFileContext();
    if (fileContext?.type === "mihomoConfig" || fileContext?.type === "mihomoProfile") {
      suppressGlobalMainLookup();
    }
    $content = buildHonkFileScope($content, readRawArgs(), fileContext, readRequestContext());
  }
  function main(config) {
    return runHonkEntry(config, readRawArgs(), readFileContext(), readRequestContext());
  }
  if (isSubStoreScope()) {
    applyFileScope();
  } else {
    globalThis.main = main;
  }
})();
