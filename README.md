# DSH for VS Code (Maintained Fork) 🐳

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/chai1110/dsh-vscode?label=Release&color=4D6BFE)](https://github.com/chai1110/dsh-vscode/releases)
[![GitHub stars](https://img.shields.io/github/stars/chai1110/dsh-vscode?style=social)](https://github.com/chai1110/dsh-vscode)
[![Fork of Fengze233/dsh-vscode](https://img.shields.io/badge/Fork%20of-Fengze233%2Fdsh--vscode-8A2BE2)](https://github.com/Fengze233/dsh-vscode)
[![VS Code](https://img.shields.io/badge/VS%20Code-%E2%89%A51.91-blue)](https://code.visualstudio.com/)

**English** | [中文](README.zh.md)

> [!IMPORTANT]
> **This repository is a maintained fork of [Fengze233/dsh-vscode](https://github.com/Fengze233/dsh-vscode).** Upstream development has stopped (last release 0.3.1) and does not support the launch-token authentication introduced by the DeepSeek Harness 0.1.2 (alpha/rc) refactor — this fork completes the adaptation and is fully working against `@deepseek-ai/dsh@0.1.2-rc.1`. All credit for the original design and implementation goes to the upstream author; MIT license and project structure are inherited from upstream.

Use the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) web UI right inside VS Code: click a sidebar icon to embed DSH, which auto-starts (or reuses) the `dsh web` service — code and AI interface side by side, no more switching between terminal, browser, and IDE.

## 🆕 Adaptation for DeepSeek Harness 0.1.2+ (this fork)

Upstream 0.3.1 cannot run against new DSH builds (that series introduced launch-token auth, lazy client modules, and more — see upstream issue [#12](https://github.com/Fengze233/dsh-vscode/issues/12)). This fork completes the adaptation in four layers (0.4.0 → 0.5.1):

- 🔐 **Launch-token auth**: detects auth-enabled DSH instances (401 + the official auth marker), automatically starts a plugin-owned instance on a free port, and parses the tokenized ready URL from dsh's startup output;
- 🛡️ **Local auth proxy (core)**: the new auth cookie is `SameSite=Strict`, which a cross-site iframe inside the VS Code webview can never send — the panel now goes through a built-in local proxy that injects the auth cookie upstream, so the browser side needs zero cookies;
- 🧩 **Lazy client-module adaptation**: the bridge client declares `immediately: true` (matching official core modules) so it executes at page boot and its handshake listeners are always bound;
- ⏱️ **Handshake timing tolerance**: handshake timeout 3s→10s, hello retries for 30s to cover the token→cookie→redirect dance and cold-start first paint; the WebSocket RPC channel (`/api/remote.mux`) is forwarded through the proxy with upgrade headers preserved.

## 📸 Screenshot

![DSH for VS Code screenshot](docs/screenshots/overview.png)

## 🎬 Demo video

[![如何在 VSCode 中使用 DeepSeek Harness？用 DSH！！（Bilibili）](docs/screenshots/video-cover.jpg)](https://www.bilibili.com/video/BV1p8bD6dE18)

*59-second demo on Bilibili (Chinese): [BV1p8bD6dE18](https://www.bilibili.com/video/BV1p8bD6dE18)*

---

## ✨ Features

- 🖱️ **One-click open**: a DSH whale icon in both the left Activity Bar and the right Secondary Side Bar — click either to embed the DSH page in that sidebar;
- 🚀 **Automatic service management**: auto-detects the port — reuses an already-running `dsh web`, otherwise starts one silently in the background and loads it once ready;
- 🔄 **Live status sync**: four-state status bar indicator (running green / starting yellow / failed red / stopped gray); click it to toggle the panel;
- 🛟 **Error fallbacks**: port occupied, `dsh` missing, start timeout, crash/disconnect — each has a dedicated page with one-click reconnect; if the configured port is taken by another program, the extension temporarily falls back to the first free port for that session, never a blank screen;
- 🌐 **Bilingual UI**: copy follows the VS Code display language — Chinese for `zh-*`, English otherwise;
- 📋 **Copy/Paste/Context menu, works out of the box**: fixes the macOS webview quirk where `Cmd+C` / `Cmd+V` and the right-click menu silently fail inside the embedded DSH page — the panel ships its own standard edit shortcut simulation and a context menu (Copy/Paste/Cut/Select All/Undo/Redo), while plain-browser usage and every existing feature stay untouched;
- 🧹 **Clean exit**: closing the window stops the auto-started service, no zombie processes; manually started services are never touched;
- 🔒 **Security boundary**: loopback addresses only (127.0.0.1 / localhost / [::1]); no credentials are read.
- 🔝 **Editor title-bar icon**: a DSH whale button sits in the top-right of the editor tab bar (like Claude Code) — one click opens the right-side DSH panel;
- 🌐 **SSH Remote (opt-in)**: when connected to a remote host, run dsh on the remote and open the panel through a VS Code tunnel (`dsh.remote.enabled`, off by default);
- 🖼️ **Free image upload**: send images even when the active model has no vision — the image is cached in the workspace and dispatched as a file-path reference, letting the model inspect it with an image tool (files are cleaned up when the panel closes; opt-out via `dsh.image.fallback`);
- 🪟 **No surprise browser window**: `dsh web` is started with `--no-open` by default (restore with `dsh.openInBrowser`).

## 📥 Installation

**Option 1: Install from this repository's Release (recommended)**

1. Download the latest `dsh-vscode.vsix` from [Releases](https://github.com/chai1110/dsh-vscode/releases);
2. In VS Code press `Ctrl+Shift+P` → run `Extensions: Install from VSIX...` → select the file;
3. Reload the window (`Developer: Reload Window`).

> If you previously had the marketplace version (0.3.1, which no longer works with new dsh), installing this vsix upgrades it in place; VS Code will never downgrade 0.5.1 back to the marketplace's 0.3.1. To be extra safe, disable auto-update for this extension in its right-click menu.

**Option 2: Build from source**

```bash
git clone https://github.com/chai1110/dsh-vscode.git
cd dsh-vscode
npm install
npm run package        # produces dsh-vscode.vsix, then install as in Option 1
```

> The marketplace package `Fengze233.dsh-vscode-panel` is the outdated upstream build (0.3.1) and does not support new DeepSeek Harness releases — not recommended anymore.

**Prerequisite**: the `dsh` CLI from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) must be installed and on your PATH (the extension detects it and shows a hint if missing). Tested against `@deepseek-ai/dsh@0.1.2-rc.1`.

## 🚀 Usage

1. After installation, a DSH whale icon appears in both the left Activity Bar and the right Secondary Side Bar;
2. Click either icon: the extension auto-starts (or reuses) `dsh web` and embeds the DSH page in that sidebar;
   - Click the **right** icon → the panel opens on the right, leaving the file explorer untouched;
   - If `dsh.port` is occupied by another program, the extension automatically switches to the first free port for this session only (your setting is unchanged; a notification tells you the temporary port);
3. Panel title bar buttons: `Open in Browser` `Restart Service` `Stop Service` `Copy URL` `Show Logs`;
4. The bottom status bar shows the service status; click it to toggle the panel.

### Command palette (prefixed `DSH:`)

| Command | Description |
|---|---|
| `DSH: Open Panel` | Open the left panel |
| `DSH: Open in Secondary Side Bar` | Open the right panel |
| `DSH: Open in Browser` | Open the DSH page in the system browser |
| `DSH: Restart Service` | Restart the extension-managed service |
| `DSH: Stop Service` | Stop the extension-started service |
| `DSH: Copy URL` | Copy the DSH page URL |
| `DSH: Show Logs` | Open the extension log output channel |
| `DSH: Copy Logs` | Copy the full DSH log (environment info + service log) to the clipboard for bug reports |
| `DSH: Retry Bridge Install` | Reinstall the bridge and restart the service |
| `DSH: Uninstall Bridge` | Remove the bridge package and restore `cordis.patch.yml` |

## 🔗 Bridge integration

After installation, the extension installs its own bridge package `dsh-vscode-bridge` into DSH's official client-plugin extension point under your DSH user directory, enabling three integrations:

- 🔗 **External links**: clicking a link in the panel opens it in your system browser (instead of being trapped inside the iframe);
- 📂 **File jumps**: clicking a file path in the panel opens the file in VS Code;
- 📋 **Clipboard copy**: copy buttons inside DSH (such as code-block copy) are routed through the extension host, working around VS Code's clipboard permission block for cross-origin iframes inside webviews.
- ↩️ **Undo/redo (macOS Cmd+Z / Cmd+Shift+Z, Windows Ctrl+Z / Ctrl+Y)**: VS Code swallows standard shortcuts in nested iframes, and DSH's input is a React-controlled field whose native undo stack is empty, so `execCommand('undo')` no-ops. After handshake the bridge keeps a **manual undo/redo stack** per editable element (consecutive typing grouped into one step per 400ms) — native undo is preferred when it works, manual fallback otherwise (fixes issue #6 "Cmd+Z undo doesn't work").

### Install / uninstall mechanism (transparency disclosure)

To let the DSH page communicate with VS Code, the extension will:

1. Install its bridge package `dsh-vscode-bridge` into your DSH user directory (`$DSH_HOME/profiles/web`, default `~/.dsh/profiles/web`) via DSH's official client-plugin extension point;
2. Write a marked `insert:` entry (wrapped in `# dsh-vscode-bridge: begin` / `# dsh-vscode-bridge: end`) into `cordis.patch.yml`, registering the bridge as a DSH client plugin — writing only to the user directory and never touching the DSH installation directory.

To remove, either way works:
   - **Uninstall the extension**: VS Code runs the package's `uninstall` hook automatically, removing the marked entry and the bridge directory (best-effort — it never blocks the uninstall);
   - **Remove only the bridge**: run `DSH: Uninstall Bridge` for the same result.

> Versioning: the bridge package version is **always identical to the extension version** (the two ship together in one vsix to the marketplace); the installer force-reinstalls the bridge whenever the bundled version differs from the installed one, so logic updates always reach the user.

### Bridge-related settings (`dsh.*`)

| Setting | Default | Description |
|---|---|---|
| `dsh.bridge.enabled` | `true` | Enable the bridge (when off: no install, no injection, no warning; the three integrations are unavailable) |
| `dsh.workspaceRootIndex` | `0` | For multi-root workspaces: which root to use as the `dsh web` process working directory (out-of-range falls back to the first) |
| `dsh.bridge.silenceWarning` | `false` | Suppress the bridge degradation warning |

### Degradation behavior

The bridge only works inside the panel. If it is inactive (e.g. you open the DSH page in a browser, or the install failed), the panel remains **fully usable** — only the three integrations above are unavailable; a one-time startup warning (with "Retry Install" / "Don't Show Again") is shown.

## 🆕 What's new in v0.3.0

- **Top-right DSH icon**: the whale button in the editor title bar opens the right-side panel (command `DSH: Open Right Panel`). The icon is the **original whale on a white background** (`whale-icon-bg.svg`), clearly visible in both dark and light themes; the activity bar and secondary sidebar keep the original whale icon.
- **SSH Remote**: with `dsh.remote.enabled` on, the extension runs on the remote host, starts/reuses `dsh` there, and shows the panel through a VS Code tunnel — your local VS Code window stays clean and the remote service stays on `127.0.0.1`.
- **Image upload works seamlessly even for non-vision models**: attach images freely in the dialog. When the active model has no image input, the image is saved into your workspace and the message is sent back out as the original text plus a `image: <absolute-path>` reference — no error, no popup; the model inspects the file with its own image tool and answers normally. Vision-capable models keep the native image upload untouched.
- **No browser auto-open**: `dsh web` is started with `--no-open`, so the plugin no longer pops a browser window; turn that back on with `dsh.openInBrowser`.

## ⚙️ Settings (`dsh.*`)

| Setting | Default | Description |
|---|---|---|
| `dsh.port` | `3080` | Desired port (used for both detection and startup) |
| `dsh.host` | `127.0.0.1` | Service address (loopback only) |
| `dsh.autoStart` | `true` | Auto-start the service when it is not running |
| `dsh.stopOnExit` | `true` | Stop the extension-started service when the last window closes |
| `dsh.extraArgs` | `[]` | Extra arguments appended when starting `dsh web` |
| `dsh.executablePath` | `""` | Absolute path to the `dsh` executable (`dsh.cmd` on Windows); empty = look up on PATH |
| `dsh.openInBrowser` | `false` | Open the DSH page in the default browser after the service starts (when off, `--no-open` is passed to `dsh web`) |
| `dsh.remote.enabled` | `false` | Enable remote scenarios (SSH Remote / WSL / Dev Containers / Codespaces): run dsh on the remote and open the panel through a VS Code tunnel (off by default; reload the window after enabling) |
| `dsh.image.fallback` | `true` | Send attached images as file-path references when the active model has no vision, instead of failing (files are cached in the session working directory and removed when the panel closes) |

## 🌍 Localization

UI copy follows the VS Code display language (`Configure Display Language`): `zh-*` → Simplified Chinese, anything else → English.

## 🧑‍💻 Development

Requirements: Node.js ≥ 22, VS Code ≥ 1.91.

```bash
npm install
npm run test          # 198 unit/integration tests (including a full real dsh web flow)
npm run compile       # builds out/extension.js
npm run watch         # watch build
npm run typecheck     # type check
npm run package       # package .vsix
```

Debugging: open this folder in VS Code and press `F5` to launch the Extension Development Host.

```
src/
├── extension.ts          # entry: assembly and command registration
├── i18n.ts               # runtime copy dictionary (zh-* Chinese / otherwise English)
├── config.ts             # settings normalization (loopback whitelist)
├── service/
│   ├── detect.ts         # port probing (DSH marker detection + auth-marker/token-URL parsing)
│   ├── process.ts        # cross-platform subprocess wrapper (dsh / dsh.cmd)
│   ├── authproxy.ts      # local auth proxy (SameSite=Strict cookie injection for the webview)
│   └── manager.ts        # service manager state machine (core)
├── bridge/               # bridge: installer, handshake host, message handling, status
├── panel/
│   ├── html.ts           # panel page templates (minimal CSP)
│   └── provider.ts       # WebviewViewProvider (iframe + placeholder pages)
├── workspaceRoot.ts      # multi-root workspace resolution
└── statusbar.ts          # status bar controller
```

## 🧭 Known limitations

- The colored icon on the "Get Started with DSH" walkthrough card comes from Marketplace gallery data and only appears after the extension is published (the card itself works regardless);
- VS Code platform rule: the left icon opens the left panel, the right icon opens the right panel — the left icon cannot open the right panel.
- SSH Remote: the extension must also be installed on the remote (VS Code prompts for it); the tunnel appears in the Ports view and can be closed by the user (the plugin re-creates it on the next ready).
- Image fallback caches the image files under the **workspace root** — **an open workspace folder is required** (with no folder open, images cannot be cached and no fallback happens). **Temp images are deleted as soon as the model has seen them**: the previous batch is removed the moment the next message is sent in the same session (the model already read it and answered); if no further message comes, a ~2-minute TTL auto-deletes them; conversation create/switch/delete, panel close, page unload and extension deactivate also clean up (best-effort). On activation the extension additionally sweeps any orphaned `dsh-imgcache-*` files left by an earlier session (VS Code restarts lose the in-memory registry), and you can always run the **`DSH: Clean Up Image Cache`** command to purge them manually.
- **Verifying the bridge version**: in the DSH panel DevTools console you should see `[dsh-vscode-bridge] handshake ok, **v0.5.1**, imageFallback=true`; the extension log (`DSH: Show Logs`) should show `[authproxy] 面板经本地认证代理访问` and `[process] 已从启动输出解析到带令牌的就绪地址`. If the handshake keeps timing out, the bridge was not reinstalled — restart the DSH service (the installer force-reinstalls on version mismatch).
- `--no-open` is passed to `dsh web` by default, unless `dsh.extraArgs` or `dsh.openInBrowser` explicitly opts back in to opening the browser.
- Under new-dsh auth the extension **cannot reuse** an externally started `dsh web` (the launch token lives only in that process's memory) and starts its own instance instead — both share the same `~/.dsh` data and do not interfere.

## 🌐 Community

This is a DeepSeek Harness community plugin (topic: [`dsh-plugin`](https://github.com/topics/dsh-plugin)).

- DSH official repo: <https://github.com/deepseek-ai/deepseek-harness>
- Issues for this fork: <https://github.com/chai1110/dsh-vscode/issues>
- Upstream project (no longer maintained): <https://github.com/Fengze233/dsh-vscode>
- DSH community discussions: <https://github.com/deepseek-ai/deepseek-harness/discussions>

## 📄 License

[MIT](./LICENSE) © 2026 Fengze233 (upstream) · 2026 chai1110 (this fork's changes)
