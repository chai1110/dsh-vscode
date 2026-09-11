## [0.5.2] - 2026-09-10

### 合并

- **全量并入上游本家 `Fengze233/dsh-vscode` `v0.4.0`**（合并基线 `v0.3.1` = `1029162`；上游 22 个提交 / +2746 行）。
  双方在 2026-09-06 ~ 09-10 几乎同一时段、互不知情地各自解决了**同一个问题**（DSH ≥0.1.2 启动令牌鉴权 +
  `SameSite=Strict` cookie 在跨站 webview iframe 中不回送），方案同构（本地回环代办代理 + 令牌换签名 cookie）。
  上游实现更完整，故本次以「上游为主、我方独有改动单独补回」的方式合并：

  - **鉴权栈换代**：退役本方 `src/service/authproxy.ts`（242 行单体），改用上游三层实现
    `src/service/proxy.ts`（249）+ `src/service/session.ts`（190）+ `src/service/launchUrl.ts`（85）。
    新增能力：会话按 `host:port` 持久化（30 天、服务重启不失效）、stdout 跨 chunk 分片缓冲、
    LAN 后缀容错、**外部实例登录引导页**（`pending` / `ok` / `needed` 三态，可粘贴启动网址）、
    `401` 自愈（丢弃失效 cookie 重新判定）、旧版 ≤0.1.1 无鉴权直通、代理 stop/start 竞态闭合。
  - **图片链路修复（本次最有价值的并入）**：上游补上了 DSH 0.1.2 的**三处线格式变更**——
    RPC 端点点分改斜杠（`session.prompt` → `session/prompt`）、业务字段移到 `payload.args.<参数名>`
    （prompt 为 `request`，list 为 `_request`）、拒绝码改为 `session/attachment-invalid`
    （子代理 `subagent/attachment-invalid`）。**本 Fork 此前完全没接这三处**，导致「模型不支持图像时
    自动降级为路径转发」在 dsh ≥0.1.2 上失效（用户表现为发不出图、只弹「当前模型不支持图片」）。
    现新增端点名归一化 + 两代请求解包 + 三种拒绝码兼容（要求 `details.reason` 精确匹配，
    不误判图片超限等其它附件错误），重发时原位写回 `args.request.content` 并保留
    `requestId` / `sessionId` / `mode` / `clientTimeZone`。
  - **图片缓存三处正确性缺陷**：同名图片旧缓存顶替新图（Critical，改为 base64 字节精确匹配优先、
    成功路径立即消费本条缓存）、排队场景误删图（只删更早批次、保留最新一批，TTL 45s → 5min）、
    重发失败丢缓存（消费移到重发成功之后）。
  - **WSL / SSH Remote（上游 issue #13）**：`postMessage` 的 `targetOrigin` 改 `'*'` + 来源双重校验
    （webview service worker 会重写 iframe origin，具名 targetOrigin 直接抛错）；CSP `frame-src`
    由最终 iframe 地址单一推导；WSL 与 SSH 分开归类（WSL 走 localhost 直连，不需隧道）；
    握手 hello 循环解耦 `load` 事件；握手超时按远程分类取值（隧道 15s / 本地与 WSL 5s）。
    本 Fork 原先是固定 10s / 10.5s，现改为动态。
  - **凭据卫生**：stdout 日志中的启动网址一律打码（`token=***`），输出通道不再残留可复制凭据。
    （本 Fork 此前为明文输出。）
  - **其他**：跨平台 dsh 版本显示（`resolveDshPackageJsonPath` 兼容符号链接/向上查找三种布局）、
    Windows 卸载清理 npm 全局残留、`.vscodeignore` 排除本地测试目录。

### 保留（本 Fork 独有，合并后复核仍在）

- **`bridge-client` 声明 `dsh.client.immediately: true`**（上游 v0.4.0 缺此项）。dsh 的
  `dsh-client-modules` 把该字段作为 **stage-one prefetch 标记**：带标记的模块其 bundle 在
  module-face boot 阶段即加载并注册工厂；桥接不属于任何 `inject` 链，无此标记不会在启动阶段注册。
- `scripts/e2e/`（真机 e2e 归档）、`scripts/release.sh`（发版脚本）、Fork 版 README。

### 验证

- `npm run typecheck` 通过；`npm test` **233 例：231 通过 / 0 失败 / 2 跳过**（跳过项为真机集成，沙箱内
  `DSH_HOME` 不可写所致）。
- **真机集成（关键）**：以隔离 `DSH_HOME` 在 `@deepseek-ai/dsh@0.1.5-rc.1` 上跑通两条端到端用例 ——
  ① 启动 → 解析启动网址 → 兑换会话 cookie → 经代办代理访问 200（对照无 cookie 直连 401）；
  ② 启动 / 复用 / 停止 / 意外退出全流程。**实证上游鉴权栈在 0.1.5-rc.1 上同样成立**，
  此前"0.1.5 兼容性"仅为静态核对，现已升级为真机结论。
- 版本号三方同步：扩展 `0.5.2` = 桥接源 `0.5.2` = 桥接产物 `0.5.2`；构建产物中
  `out/bridge-client/package.json` 的 `dsh.client.immediately` 确认为 `true`。

### 待验证

- ⚠️ 大文件上传的真机回归（0.1.5 新增 `requestBodyMode: streaming`）；详细条目见下方 `[Unreleased]` 段。

## [Unreleased]

### 兼容性

- **核对 DSH `0.1.5-rc.1`：适配层无需改动**（2026-09-10 静态核对 + 同日真机集成回归通过，见 `0.5.2` 条目）。
  - **启动就绪行**：`dsh-web-app` 打印语句
    `dsh web: ${authenticatedUrl}${lanUrl === void 0 ? "" : ` (LAN: ${lanUrl})`}`
    在 0.1.2-rc.1 与 0.1.5-rc.1 **逐字节相同**（仅行号 211 → 203 漂移）。本扩展的正则
    `/dsh web: (https?:\/\/[^\s)]+)/` 以空白和 `)` 为界，天然忽略 ` (LAN: …)` 后缀，不受影响。
  - **令牌换 cookie / 鉴权**：`dsh-client-connection/lib/index.js` 中 `SameSite` 认证 cookie、
    令牌交换、`unauthorized`/`forbidden` 响应等语句集合**完全一致**（仅缩进与行号差异；文件 721 → 788 行属别处新增）。
  - **桥接懒加载机制**：`__ModuleLoader__.load()` + `immediately` 声明在 0.1.5 的全部客户端插件中仍在使用，
    `dsh-vscode-bridge` 的声明无需调整。
  - **WSS 转发通道**：`/api/remote.mux` 路径与升级语义未变；0.1.5 新增的 RPC 方法（`workspaceFiles/*`、
    `fileUploads/upload`、`sessionFeedback/record`、`goals/get`）均走同一 mux 通道，代理无需感知。

### 待验证

- ⚠️ **大文件上传路径需真机回归**：0.1.5 在 `dsh-client-connection/lib/index.js` 新增
  `apiHandler.requestBodyMode()`（返回 `buffered` / `streaming`）以支撑「上传任意类型文件」与跨会话续传；
  `streaming` 分支不会预先读完请求体（`req.readableEnded` 判定）。本扩展的本地认证代理会改写头并转发请求体，
  **需实测大文件上传是否被正确的流式转发**。其余路径（普通请求、WSS）无影响。

## [0.5.1] - 2026-09-06

### 修复

- **修复「面板 UI 已加载但模型列表为空、无法创建对话」——代理的 WebSocket 升级转发丢失 `Connection` 头**（0.5.0 实机反馈：UI 通了但 RPC 全死）。根因：DSH 的全部 RPC 走 `/api/remote.mux` **WebSocket** 通道；0.5.0 代理的通用请求头处理把 `Connection` 头列入剔除名单，转发升级请求时上游收不到 `Connection: Upgrade` → 不被识别为升级请求 → 握手失败 → 模型列表、会话创建等一切 RPC 不可用。修复：升级转发单独构造头——保留 `Connection`/`Upgrade`，仅改写 `Host`、注入认证 cookie、剔除 `Origin`/`Referer`/`Sec-Fetch-*`（来源类头指向代理 origin 会被 `/api` 围栏同源校验拒绝）。新增 WS 握手回归测试（198 例全过）。

## [0.5.0] - 2026-09-06

### 修复

- **修复「面板就绪但 iframe 实为 401 文本页、桥接握手从始至终必超时」——本地认证代理**（0.4.2 实机日志 `handshake timeout` 持续复现 + 跨站场景抓包定位）。
  - **根因（第三次修正，与 0.4.1/0.4.2 的两次假设不同）**：新版 dsh 的认证 cookie 是 **`SameSite=Strict`**（`dsh-client-connection` 硬编码）。VS Code webview 外壳是 `vscode-webview://` 来源，对 `http://127.0.0.1:<port>` **永远是跨站**：令牌交换虽能种上 cookie，但随后的 `GET /` 在跨站 iframe 里**不带 cookie** → 面板 iframe 实际渲染的是一行 401 文本（看似空白页），聊天应用根本没启动，桥接自然无回执。此前 0.4.1/0.4.2 的握手窗口放宽与 `immediately` 声明都只修复了「应用启动后」的环节，没解决「应用根本没被加载」。
  - **实测闭环**：localhost 外壳嵌 127.0.0.1 iframe（域名 vs IP 字面量 = 真跨站，等价 webview）→ 16 次 hello 零回执、iframe 文本为 "authentication required"；同主机不同端口（SameSite 语义同站）则一切正常——与用户侧全部日志吻合。
  - **修复：扩展内置本地认证代理**（`src/service/authproxy.ts`）：就绪且解析到带令牌地址后，面板 iframe 改连代理（`http://127.0.0.1:<随机端口>`），代理在上游注入认证 cookie（扩展宿主用令牌地址完成一次交换取得），浏览器侧完全不需要 cookie。按 `/api` 的 Host 围栏语义改写 `Host`、剔除 `Origin`/`Referer`/`Sec-Fetch-*`；上游 401 时自动重新交换 cookie 重放一次；WebSocket upgrade 原样双向转发兜底；代理不可用时自动退回带令牌直连（不劣于 0.4.2）。
  - **验证**：单测新增 5 例（cookie 提取、头改写断言、请求体透传、401 自愈、控制器复用/重建）；浏览器端到端（真实 dsh + 跨站外壳 + 代理）确认 UI 完整加载、桥接握手回执。

### 说明

- 0.4.1（握手窗口 3s→10s、hello 重发 30s）与 0.4.2（`immediately: true`）的改动仍然有效且必要：前者容错冷启动时序，后者适配新版懒加载客户端模块系统；本版解决的是它们共同的更上游前提——应用得先能加载。

## [0.4.2] - 2026-09-06

### 修复

- **修复「面板能打开、桥接也装了，但握手永远无回执、持续弹『DSH 桥接未生效』」**（0.4.1 实机反馈，端到端抓包定位）。根因是新版 dsh **客户端模块系统的加载语义变更**，与握手窗口无关：
  - 旧版 dsh（0.1.1 及以前）：页面把所有 client 插件**全量立即执行**，桥接工厂随页面启动运行，`message` 监听器从一开始就在；
  - 新版 dsh（0.1.2 起）：客户端模块改为**懒加载注册**——`__DSH_BOOT__` 的 `entries` 里每个模块先只注册工厂，只有带 **`immediately: true`** 标记的条目才在启动时执行，其余要等被其它模块 require 才 materialize（`@deepseek-ai/dsh-client-modules` 读取插件包 `dsh.client.immediately` 声明，官方 9 个核心模块均带此标记）；
  - 桥接是**纯被动监听器**（等外层 VS Code 页面 postMessage `bridgeHello`），没有任何模块会 require 它 → 工厂永不执行 → 监听器永不绑定 → 握手必然超时。上一版 0.4.1 放宽握手窗口只能推迟、不能消除该问题。
  - **修复**：`dsh-vscode-bridge` 的包声明对齐官方模式，`dsh.client` 增加 **`"immediately": true`**（与 `@deepseek-ai/dsh-client-connection` 声明完全同款）。桥接版本随插件升至 **0.4.2**（触发安装器强制重装）。
- 验证：命令行端到端（拉起真实 dsh → 解析令牌 → 换 cookie → 抓取页面与全部 JS 资产）确认修复后 boot 数据中 `dsh-vscode-bridge` 条目带 `immediately: true`。

## [0.4.1] - 2026-09-06

### 修复

- **修复「面板能打开但弹『DSH 桥接未生效』降级警告」**（0.4.0 实机反馈）。根因：握手判定窗口过紧。桥接降级判定是「面板打开且服务就绪后 3 秒内无 bridgeAck 即失败」；0.4.0 适配新版 dsh 后，iframe 就绪地址带 `?token=`，首屏要先走「令牌换 cookie → 303 重定向」再加载应用，桥接客户端（DSH client 插件）在冷启动实例上 materialize 明显晚于 3 秒——把「加载中」误判成了「握手失败」。修复：
  - 扩展侧握手超时 `HANDSHAKE_TIMEOUT_MS` 3s → **10s**（状态评估延迟同步 3.5s → 10.5s）；
  - 页面侧 `bridgeHello` 重发从 250ms×12 次（3 秒）放宽为 **500ms×60 次（30 秒）**，宁可多发不可漏发（页面侧幂等，收到 ack 即停）。
- 桥接版本随插件升至 **0.4.1**（触发安装器强制重装刷新）。

## [0.4.0] - 2026-09-06

### 修复

- **适配新版 DSH（0.1.2 起）web 启动令牌鉴权——修复「更新 dsh 后面板无法启动」**（issue [#12](https://github.com/Fengze233/dsh-vscode/issues/12)）。根因：新版 dsh web 为防混淆代理，启动时生成**仅存在于该进程内存的随机启动令牌**（stdout 打印 `dsh web: http://127.0.0.1:<port>/?token=…`，访问后种 HMAC 签名 cookie），对无 cookie 请求一律回 `401 "dsh web authentication required"`。旧版插件的探测把 401 误判为「端口被其他程序占用」，且从不解析 stdout 的令牌地址，导致面板白屏/启动失败。修复：
  - **探测新增 `dsh-auth` 结果**：401/403 且响应体含 `dsh web authentication required` 识别为「带鉴权的 DSH 在运行」（区别于 `foreign` 外来程序占用）；
  - **带鉴权实例不再复用，改启自有实例**：令牌在对方进程内存里拿不到，插件自动在空闲端口启动自有 dsh 实例（弹窗告知，仅本次会话；外部实例不受影响）；`autoStart=false` 时明确报「无法自动接入」；
  - **从子进程 stdout 解析带令牌的就绪地址**（`extractDshWebUrl`，取 `dsh web:` 行首条 loopback URL），iframe 直接用它换 cookie 后重定向到干净 `/`；printUrl 未输出时按宽限轮数以无令牌地址兜底就绪；
  - **CSP frameHosts 改按实际就绪地址的 origin**：覆盖「令牌地址是 `127.0.0.1` 而 `dsh.host` 配置为 `localhost`/`[::1]`」的 authority 差异（cookie 按 Host authority 绑定，iframe 与 CSP 必须同源）；
  - **健康探测兼容 401**：带鉴权服务对无 cookie 探测永远 401，`dsh-auth` 视为存活，不再误报「已断开」。
  - 旧版 dsh（无鉴权，`probe=dsh`）复用路径完全不变。

## [0.3.1] - 2026-08-24

### 修复

- **修复「商店更新到 0.3.0 后仍无法上传图片、弹旧报错」**（实机用户反馈）。根因：桥接版本与插件版本统一后，安装器此前只按「版本号不一致」决定重装；若用户机器上残留的是**旧代码的 0.3.0 桥接**（早期有 bug 的版本，会把被拒响应透传并弹「图片已保存为文件路径…」提示），新包桥接也是 0.3.0 → 版本一致 → **跳过重装 → 继续跑旧代码**。修复：① 安装器新增**内容一致性校验**——随附 `client.js` 与已装 `client.js` 字节比对，不一致即强制重装（不再依赖版本号）；② 版本升至 **0.3.1**（扩展+桥接统一）触发所有旧桥接重装；③ 握手回执携带桥接版本，扩展日志显示 `[bridge] handshake ok (bridge v0.3.1)`，一眼确认页面跑的是哪份代码。

## [0.3.0] - 2026-08-20

### 变更

- **右上角图标改为「原鲸鱼 + 白底」**（`assets/whale-icon-bg.svg`）：原图标为纯黑填充（`#000000`），在深色主题的编辑器标题栏上几乎不可见。现给原鲸鱼加白底圆角背景，明暗主题下都清晰可辨；**左右侧边栏容器图标保持原始 `assets/whale-icon.svg` 不变**（曾尝试明暗双主题变体，侧边栏渲染异常且用户不满意，已回退并删除变体文件）。
- **卸载扩展时自动清理桥接**：`package.json` 新增 `uninstall` 钩子（`node ./out/uninstall.js`），VS Code 卸载扩展时自动从 DSH 用户目录移除桥接包并按 begin/end 标记还原 `cordis.patch.yml`（尽力而为，不影响卸载流程；仍可用 `DSH: 卸载桥接` 手动移除）。
- **桥接版本与插件版本统一**：二者始终一致（一同随插件包发布到商城），新增回归测试防漂移（bridge-client 版本 === 插件版本，且握手日志随版本号）。

### 修复

- **修复 issue #6：macOS 无法 Cmd+Z 撤销**。根因：VS Code 吞掉嵌套 iframe 内快捷键，且 DSH 输入框为 React 受控组件、原生撤销栈为空，`document.execCommand('undo')` 失效且按键已被桥接接管。桥接现为每个可编辑元素维护**手动撤销/重做栈**（`beforeinput` 记录改动前值、连续输入按 400ms 归组为一条记录，上限 100 条；原生撤销可用时优先原生、失败时手动兜底），并覆盖 Cmd+Shift+Z / Ctrl+Y 重做。配套桥接升至 `0.3.5`（触发强制重装），握手诊断 `handshake ok, v0.3.5`。

### 新增

- **SSH Remote 支持（可选）**：远程连接时可在远端运行 dsh，并经 VS Code 隧道在面板中打开。
  新增设置 `dsh.remote.enabled`（默认 `false`）。开启后：扩展在远端宿主管控 dsh（复用优先、自动启动兜底），
  用 `vscode.env.asExternalUri` 建立本地↔远端端口隧道，展示、复制网址与浏览器打开均使用隧道本地 URL；
  关闭时远程窗口显示引导占位页，不启动远端服务。声明 `extensionKind` 优先在工作区（远端）运行。
- **编辑器右上角 DSH 图标**：`editor/title` 贡献 + `dsh.openFromTitle` 命令，点击在编辑器标签栏右上角图标
  打开右侧辅助侧边栏面板（与 Claude Code 同位置）。
- **对话框自由上传图片**：模型无视觉能力时不再报错——桥接客户端在附件加入/拖拽/粘贴时捕获图片字节并去重缓存；
  发送被服务端以 `MODEL_DOES_NOT_SUPPORT_IMAGES` 拒绝后，自动把图片经扩展宿主缓存到工作区，
  把图片改为「地址（绝对路径）」随消息重新发出，模型据此自行用图像识别工具查看并正常回答，全程无感；
  页面卸载时清理缓存文件；新增设置 `dsh.image.fallback`（默认 `true`）。普通浏览器/未握手时行为与之前完全一致。
- **新增设置**：`dsh.openInBrowser`（默认 `false`，关闭即默认传 `--no-open`）、
  `dsh.remote.enabled`（默认 `false`）、`dsh.image.fallback`（默认 `true`）。

### 修复

- **dsh 新版默认弹浏览器**：启动 `dsh web` 默认追加 `--no-open`（DSH 上游 `openBrowser` 默认 true），
  不再自动打开浏览器；需要时用 `dsh.openInBrowser=true` 恢复原行为。
- **兼容不支持 `--no-open` 的旧版 dsh（验收修复）**：启动崩溃并伴随换端口级联的问题根因——旧版 dsh 的
  commander 不识别 `--no-open`，报 `unknown option` 后退出且被误判为“端口被抢占”。现用 stderr 识别该根因，
  本次会话自动去掉 `--no-open` 并**原端口**重启，不再陷入换端口级联。
- **图片自由上传真正生效（验收修复）**：① 桥接包版本升至 `0.3.0`，安装器据此对旧装桥接强制重装（此前版本未变不会刷新页面里的桥接代码）；② RPC 线格式对齐——DSH 请求体为 `{ rpcId, payload }`，拦截改按 `payload.content` 判定并按 `{rpcId, payload}` 重构重发；③ 图片落盘 cwd 增加工作区根兜底（此前未传 cwd 会拒绝写入）。注意：图片降级需在**打开工作区文件夹**的窗口内使用（缓存文件落在工作区根）。
- **图片降级重发重构为「无感直发」（本轮验收修复）**：此前被拒响应原样透传给 DSH，导致消息不发且弹「当前模型不支持图像输入」报错。现改为：图片落盘后，协议层用「原文 + 图片：<绝对路径>」重构请求重发，并用**重发成功响应顶替被拒响应**交回 DSH——用户看到的是图片照常发送、模型正常回答，不再有任何报错或降级通知；被拒响应不再透传，`imageFallback` 通知消息与弹窗一并移除（改为 DevTools 诊断日志）。无落盘（未打开工作区）时仍保留原生报错，绝不吞错误。
- **桥接包版本升至 `0.3.1`（交付修复）**：上一版 vsix 已给用户装过桥接 `0.3.0`，新 vsix 若仍随附 `0.3.0`，安装器会判定「版本一致、无需重装」，导致用户侧继续跑旧的降级逻辑、复测必失败——现升至 `0.3.1` 强制安装器覆写旧包；握手诊断日志同步为 `handshake ok, v0.3.1` 供 DevTools 确认新桥接已加载。
- **图片降级三项验收修复（按实机反馈）**：① **只降级本条消息实际包含的图片**——按消息内的图片块顺序（图片一、图片二…）匹配已捕获缓存（文件名/数据双重匹配），不再把历史上传的全部图片反复引用进后续消息；已用过的缓存立即消费移除；② **图片按上传/发送顺序标注** `图片一：<路径>`/`图片二：<路径>`，多图顺序一目了然；③ **临时图片随对话终止清理**——新建/删除/切换会话时，删除上一对话已落盘的工作区临时图片（页面卸载与扩展停用清理保留）。配套将桥接升至 **`0.3.2`**（用户已装 `0.3.1`，必须再升版本触发强制重装），握手诊断同步 `handshake ok, v0.3.2`。
- **临时图「模型看完即删」（按实机反馈重构清理语义）**：每条消息的临时图按「批次」管理——① 同会话发出**下一条消息**时立即删除上一批（此时模型已读完该图并给出回答）；② 若不再发消息，TTL（默认 2 分钟）**自动删除**兜底；③ 会话新建/删除/切换、页面卸载、扩展停用、手动命令等触发全部保留。磁盘上任何时刻最多只有“当前刚发、可能正在被模型读取”的一批图，杜绝占用与隐私残留。桥接升至 **`0.3.3`**（强制重装），握手诊断 `handshake ok, v0.3.3`。
- **临时图清理再加两层兜底（按实机反馈）**：① **孤儿扫描**——VS Code/扩展重启会让内存注册表丢失、旧 `dsh-imgcache-*` 成为无人追踪的孤儿（现有按注册表清理找不到）；现于扩展激活时按工作区根目录扫描，只删本扩展专属命名空间（`dsh-imgcache-*` 白名单）的残留；② **手动命令 `DSH: 清理图片缓存`**（`dsh.cleanupImageCache`）——随时一键删除注册表缓存 + 扫描清理孤儿。这两层都**不依赖注册表**，解决“重启/关闭后仍残留”的根因。
- **右上角图标改为鲸鱼图标（验收修复）**：`dsh.openFromTitle` 图标由辅助侧边栏 codicon 改为扩展自带 `assets/whale-icon.svg`。

### 其他

- 桥接消息协议扩展：`saveImage` / `deleteImages`（含握手转发与扩展宿主落盘/删除，
  均为白名单 + 路径安全防护）。
- 回归：既有 v0.2.4 功能（本地面板/双侧栏/命令/状态栏/桥接/端口回退/退出清理/双语）全部保留并有回归测试覆盖。

## [0.2.4] - 2026-08-19

### 修复

- **macOS 上聊天内容无法复制/粘贴/右键（issue #3）**：VS Code 在 macOS 上会吞掉嵌套 iframe 内的 `Cmd+C` / `Cmd+V` / `Cmd+A` 等标准快捷键与右键菜单（上游 bug [microsoft/vscode#129178](https://github.com/microsoft/vscode/issues/129178) / [#180234](https://github.com/microsoft/vscode/issues/180234)，官方未修复）。桥接包在握手后接管这些操作：
  - 捕获 `keydown`，识别 `Cmd/Ctrl+C/V/X/A/Z` 与 `Shift+Insert`，优先用 `document.execCommand` 模拟（此方案由 Flutter DevTools 团队在同类场景验证有效）；
  - **复制/剪切兜底**：`execCommand` 不可用时，把选区文本经剪贴板写桥接交给扩展宿主写入系统剪贴板；
  - **粘贴兜底**：新增剪贴板读取桥接（`vscode.env.clipboard.readText`，无 webview 权限限制），把剪贴板文本插入焦点输入框（textareas 兼容 React 受控组件）；
  - **右键菜单**：捕获 `contextmenu` 弹出自定义菜单（复制/粘贴/剪切/全选/撤销/重做），不再依赖 VS Code 的原生菜单；
  - 未握手（普通浏览器）时保持原生行为完全不变。

## [0.2.3] - 2026-08-17

### 修复

- **DSH 侧栏内代码块「复制」无反应**：双层修复剪贴板在 VS Code 内嵌跨源 iframe 中失效的问题：
  - 给内嵌 DSH 页面的 iframe 显式声明 `allow="clipboard-write"`；
  - 桥接包接管 DSH 页面的 `navigator.clipboard.writeText`：复制文本经面板转发给扩展宿主，由 `vscode.env.clipboard` 写入系统剪贴板，绕开 VS Code 对 webview 跨源 iframe 剪贴板 API 的权限拦截；桥接禁用/未安装时保持 DSH 原生行为不变。

# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.2] - 2026-08-17

### 修复
- **Windows 下服务启动失败（全局 dsh 场景）**：修复 Windows 上「已全局安装 dsh，插件却报未找到 dsh / 服务启动失败」的完整问题链：
  - Windows 改用 `node <bin.js>` 直跑 dsh 入口，规避 spawn `dsh.cmd` 批处理 shim 的 EINVAL；
  - 桥接包安装到三个位置（web profile、profiles 根、npm 全局 node_modules），覆盖 VS Code 扩展宿主进程的模块解析链；
  - 桥接 host 插件改为**零外部依赖的函数式插件**，不再 import `@deepseek-ai/cordis`——npm 全局安装布局下该依赖嵌套在 dsh 包内部，顶层解析不到会导致整个插件树加载失败；
  - 安装器比对桥接包版本，升级插件时自动刷新旧版桥接包；
  - Windows 下改用系统 PATH 中的 `node.exe` 直跑 dsh 入口，不再使用扩展宿主的 `process.execPath`（Electron 的 Code.exe）——Electron 运行时缺少 dsh loader/HMR 依赖的系统 Node 内部特性，会报 `--expose-internals is required` 并崩溃。
- 子进程因端口被残留 dsh 实例占用而崩溃时，自动探测并复用现有服务，不再误报启动失败。
- 启动期间端口被其他程序抢占（如 WSL 与 Windows 共享 localhost 端口、WSL 侧 dsh 慢启动竞态）导致崩溃时，自动改用第一个空闲端口重启，不再报启动失败。

### 新增
- **端口占用自动替换**：`dsh.port` 被其他程序占用时，自动改用第一个空闲端口（仅本次会话临时生效，不修改设置），并弹窗告知临时端口。
- **日志增强**：日志带时间戳与环境信息头（扩展/VS Code/dsh/Node 版本、平台、关键配置）；记录实际启动命令；新增 `DSH: 复制日志` 命令一键复制完整日志用于问题报告。

## [0.2.1] - 2026-08-16

### 修复
- 构建前清空 out 目录，消除删除文件后的产物残留（测试数统计失真）
- 握手 token 改用 crypto 随机数（不可预测）
- retryBridge 失败路径兜底，消除未处理异常

### 改进
- 扩展改为按需激活，减少 VS Code 启动负担
- 新增 GitHub Actions CI（typecheck + 测试 + 打包）
- 新增 Issue/PR 模板与贡献指南
- README 英文主版 + 中文版（README.zh.md，顶部语言互链）

## [0.2.0] - 2026-08-15

### 新增

- **桥接与工作区联动**：通过官方扩展点桥接包，面板与 VS Code 之间新增两项联动能力：
  - 面板内点击外链，在系统默认浏览器中打开；
  - 面板内点击文件路径，在 VS Code 中打开对应文件。
- **桥接命令**：新增 `DSH: 重试桥接安装` 与 `DSH: 卸载桥接` 命令。
- **桥接设置项**：新增 `dsh.bridge.enabled`（默认 `true`）、`dsh.workspaceRootIndex`（默认 `0`）、`dsh.bridge.silenceWarning`（默认 `false`）。

### 移除

- **工作区自动同步**：移除打开面板时自动把 VS Code 工作区同步为 DSH 工作区的联动能力（用户决定放弃）。

### 修复

- **spawn 工作目录兜底**：自启 `dsh web` 时按 `dsh.workspaceRootIndex` 解析工作区根目录作为子进程工作目录，多根工作区不再错误落点。

### 降级与警告

- 桥接未生效时面板完全可用，仅两项联动不可用；插件启动时会弹一次降级警告，可「重试安装」或「不再提示」。

## [0.1.0] - 2026-08-15

### 新增

- DSH 网页界面在 VS Code 侧边栏内嵌显示，支持左右双侧栏入口。
- 服务自动探测 / 启动 / 复用与状态栏四态指示。
- 异常兜底提示页与一键重连、双语界面、退出清理、回环地址安全边界。
