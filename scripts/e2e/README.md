# E2E 脚本（端到端验证）

0.5.0 / 0.5.1 适配期使用的端到端验证脚本，原放在 `/tmp/dsh-e2e/`（重启即丢），现归档到仓库保留，方便以后回归。

## 脚本说明

| 脚本 | 用途 |
|---|---|
| `authproxy.mjs` | 拉起**真实 dsh** + 本地认证代理，验证代理注入 cookie 后页面能真正加载（不是 401 文本页） |
| `e2e.mjs` | 基础端到端：启动 dsh → 解析令牌地址 → 换 cookie → 抓取页面与全部 JS 资产 |
| `e2e2.mjs` | 跨站外壳验证：localhost（域名）外壳嵌 `127.0.0.1`（IP 字面量）iframe —— **真跨站**场景 |
| `e2e3.mjs` | 桥接客户端验证：确认 boot 数据中 `dsh-vscode-bridge` 带 `immediately: true` 并成功握手 |
| `e2e4.mjs` | 代理 + 跨站外壳 + 桥接全链路回归 |

## 使用前提

- 本机装有 `@deepseek-ai/dsh`（当前验证版本 0.1.2-rc.1）且 `dsh` 在 PATH；
- 先 `npm install && npm run compile`；
- 脚本会真实启动 `dsh web` 子进程并占用端口，**跑完务必清理残留进程**：
  `ps aux | grep "dsh web"` 逐个 kill（注意：用户手动跑的 3080 实例不要杀）。

## 关键提醒（踩过的坑）

- **同主机不同端口不算跨站**（SameSite 语义下同站），测不出 cookie 被拦；必须用「域名外壳 + IP 字面量 iframe」。
- macOS 不能绑 `127.0.0.2`（Errno 49），别浪费时间。
- 单元测试才是日常回归主力（`npm test`，198 例）；这些 e2e 脚本只在改代理/桥接/鉴权相关代码时才需要跑。

## proxy-chain-054.mjs + shell-054.html（v0.5.4 / DSH 0.1.7-rc.2 适配验证）

用法：启动测试 dsh（3086）→ `node run-proxy.mjs`（解析启动行→兑换会话→起真实代理）→ 把 shell-054.html 里的代理地址替换后用浏览器打开（跨站外壳=webview 等价）→ 验证 bridgeAck。
已验证（2026-09-26）：exchangeSession ok（30 天 cookie）→ 代理 200（boot+bridge 下发）→ 跨站 iframe 第一次 hello 即 bridgeAck v0.5.4 → UI 完整加载。

## smoke-live.ts（对运行中实例的快速回归，0.2.0-rc.1 起）

`proxy-chain-054.mjs` 依赖的 `svc/` 模块当年在 /tmp 目录运行、归档时未随入库（脚本不可直接运行）；
对**已在运行的 dsh 实例**（如 launchd 常驻 3080）做快速回归，用 `smoke-live.ts`：
token 兑换 → 代理 → boot 页 + bridge 注入，全程不自起 dsh。运行方法见文件头注释。
2026-09-29 实测：dsh **0.2.0-rc.1**（next）上 SMOKE PASS。
