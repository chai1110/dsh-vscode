# DSH for VS Code（维护中 Fork）🐳

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/chai1110/dsh-vscode?label=Release&color=4D6BFE)](https://github.com/chai1110/dsh-vscode/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%E2%89%A51.91-blue)](https://code.visualstudio.com/)

**中文** | [English](README.md)

> **本仓库 Fork 自 [Fengze233/dsh-vscode](https://github.com/Fengze233/dsh-vscode)**。上游 0.3.1 无法适配新版 DeepSeek Harness，本 Fork 先行完成了新版适配；**原作者其后已恢复更新并发布 [`v0.4.0`](https://github.com/Fengze233/dsh-vscode/releases/tag/v0.4.0)（2026-09-10），本 Fork 现已将其全量并入**。感谢原作者的工作，MIT 协议继承自上游。

在 VS Code 侧边栏中直接使用 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的网页界面：点击侧边栏鲸鱼图标内嵌打开 DSH，自动启动 `dsh web` 服务，代码与 AI 界面同屏。

## 为什么有这个 Fork

DeepSeek Harness 0.1.2（alpha/rc）重构后引入了启动令牌鉴权、客户端模块懒加载等变化，上游 0.3.1 在新版 DSH 上完全无法使用（面板打不开，对应上游 issue [#12](https://github.com/Fengze233/dsh-vscode/issues/12)）。本 Fork 与上游**各自独立地做出了同一套修复**（本地回环代理 + 令牌换签名 cookie）。自 **`0.5.2` 起本 Fork 已全量并入上游 `v0.4.0`**，仅保留上游仍然缺少的部分：

- 🧩 **客户端模块懒加载适配** —— 桥接客户端声明 `dsh.client.immediately: true`（与官方核心模块一致），这是 dsh 在 module-face boot 阶段加载插件 bundle 的 **stage-one 预取标记**。上游 `v0.4.0` 未声明该字段，而桥接又不在任何 `inject` 链里；
- 🔐 **启动令牌鉴权**（现采用上游的三层实现 `proxy.ts` + `session.ts` + `launchUrl.ts`）—— 鉴权态探测、会话按 `host:port` 持久化（30 天、服务重启不失效）、stdout 跨 chunk 分片缓冲、LAN 后缀容错；
- 🛡️ **本地认证代理** —— 新版认证 cookie 为 `SameSite=Strict`，VS Code webview 的跨站 iframe 携带不了；面板改为经内置本地代理访问，认证 cookie 由扩展宿主在上游注入，浏览器侧零 cookie；
- 🖼️ **图片降级适配 DSH ≥0.1.2** —— 端点名归一化（`session.prompt` → `session/prompt`）、两代请求解包（`payload.args.request.content`）、`session/attachment-invalid` 拒绝码兼容；
- 🧭 **外部实例登录引导页** —— `pending` / `ok` / `needed` 三态，你自己启动的 DSH 粘贴一次启动网址即可被接管；
- ⏱️ **握手时序容错 + RPC 通道转发** —— hello 循环解耦 `load` 事件、握手超时按远程分类（隧道 15s / 本地 5s）、WebSocket RPC 通道（`/api/remote.mux`）经代理原样转发（保留升级头）。

实测版本：`@deepseek-ai/dsh@0.1.5-rc.1` —— **233 个单元测试（231 通过 / 0 失败 / 2 跳过）**，外加**两条真机端到端集成用例**：① 启动 → 解析启动网址 → 兑换会话 cookie → 经代理访问 200（对照：无 cookie 直连 401）；② 启动 / 复用 / 停止 / 意外退出全流程。0.1.5 的启动就绪行与鉴权逻辑与 0.1.2 基准逐字节/逐语句一致，**适配层无需再改动**。

唯一待真机回归项：0.1.5 新增的「上传任意类型文件」走 `requestBodyMode: streaming` 路径，需实测一次大文件上传以确认代理的请求体转发（详见 [CHANGELOG](CHANGELOG.md) 的 `[Unreleased]`）。

## 安装

1. 从 [Releases](https://github.com/chai1110/dsh-vscode/releases) 下载最新 `dsh-vscode.vsix`；
2. VS Code 中按 `Ctrl+Shift+P` → 执行 `Extensions: Install from VSIX...` → 选择下载的文件；
3. 重载窗口（`Developer: Reload Window`）。

> 前置要求：本机已安装 DeepSeek Harness 的 `dsh` 命令。商店里的 `Fengze233.dsh-vscode-panel` 是停止维护的上游旧版（0.3.1），不支持新版 DSH，不建议使用；若之前装过，用本 VSIX 原位覆盖即可。

从源码构建：

```bash
git clone https://github.com/chai1110/dsh-vscode.git
cd dsh-vscode
npm install
npm run package        # 产出 dsh-vscode.vsix，再按上面步骤安装
```

## 使用

- 左侧活动栏与右侧辅助侧边栏各有一个 DSH 鲸鱼图标，点击打开面板；
- 服务自动管理：自动启动/复用、端口被占自动回退空闲端口、状态栏四态指示、崩溃/失联自动提示；
- **会话列表按工作区分组**：面板的工作区跟随 VS Code 打开的文件夹，想看到哪个目录下的历史会话就打开哪个文件夹；
- 常用命令（`DSH:` 前缀）：打开面板、重启服务、停止服务、复制网址、查看日志、复制日志、重试桥接安装、卸载桥接；
- 常用设置（`dsh.*`）：`dsh.port`（3080）、`dsh.host`（仅回环地址）、`dsh.autoStart`（自动启动）、`dsh.stopOnExit`（退出停止自启服务）、`dsh.remote.enabled`（SSH 远程，默认关）、`dsh.image.fallback`（无视觉模型发图降级）。

## 桥接说明

安装后插件会把桥接包 `dsh-vscode-bridge` 写入 DSH 用户目录（`~/.dsh/profiles/web`，带 begin/end 标记的 insert 条目，只写用户目录、绝不触碰 DSH 安装目录），提供四项联动：**外链跳转浏览器、文件路径跳转 VS Code、剪贴板复制、撤销/重做**。卸载扩展或运行 `DSH: 卸载桥接` 会自动按标记清理，不留残留。

## 已知限制

- 新版 dsh 鉴权下，插件**无法复用**外部手动启动的 `dsh web`（启动令牌只存在于该进程内存），会自动另启自有实例；两者共用同一 `~/.dsh` 数据，互不干扰，但同一个会话不要两边同时使用；
- 图片降级功能需要打开工作区文件夹（缓存文件放在工作区根目录）；
- 上游遗留问题：macOS webview 内复制/粘贴/撤销由桥接的快捷键仿真兜底，行为可能与原生略有差异。

## 开发

环境要求：Node.js ≥ 22、VS Code ≥ 1.91。

```bash
npm install
npm test            # 198 个单元/集成测试（含真实 dsh web 全流程）
npm run typecheck   # 类型检查
npm run package     # 打包 .vsix
```

调试：VS Code 打开本目录，按 `F5` 启动 Extension Development Host。核心代码在 `src/service/`（探测 `detect.ts`、子进程 `process.ts`、认证代理 `authproxy.ts`、状态机 `manager.ts`）。

## License

[MIT](./LICENSE) © 2026 Fengze233（上游项目）· 2026 chai1110（本 Fork 的修改）
