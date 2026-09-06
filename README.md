# DSH for VS Code (Maintained Fork) 🐳

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/chai1110/dsh-vscode?label=Release&color=4D6BFE)](https://github.com/chai1110/dsh-vscode/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%E2%89%A51.91-blue)](https://code.visualstudio.com/)

**English** | [中文](README.zh.md)

> **This repository is a fork of [Fengze233/dsh-vscode](https://github.com/Fengze233/dsh-vscode)**. Upstream development has stopped (last release 0.3.1, incompatible with new DeepSeek Harness), so this fork continues maintenance on top of it. Thanks to the original author — the MIT license is inherited from upstream.

Use the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) web UI right inside VS Code: click a sidebar whale icon to embed DSH, which auto-starts the `dsh web` service — code and AI interface side by side.

## Why this fork exists

DeepSeek Harness 0.1.2 (alpha/rc) introduced launch-token auth, lazy client modules, and more — upstream 0.3.1 completely fails on new DSH builds (the panel never opens, see upstream issue [#12](https://github.com/Fengze233/dsh-vscode/issues/12)). This fork completes the adaptation in four layers (0.4.0 → 0.5.1):

- 🔐 **Launch-token auth**: detects auth-enabled DSH instances (401 + the official auth marker), starts a plugin-owned instance on a free port, and parses the tokenized ready URL from dsh's startup output;
- 🛡️ **Local auth proxy (core)**: the new auth cookie is `SameSite=Strict`, which a cross-site iframe inside the VS Code webview can never send — the panel goes through a built-in local proxy that injects the auth cookie upstream, so the browser side needs zero cookies;
- 🧩 **Lazy client-module adaptation**: the bridge client declares `immediately: true` (matching official core modules) so it executes at page boot and its handshake listeners are always bound;
- ⏱️ **Handshake timing tolerance + RPC forwarding**: handshake timeout 3s→10s, hello retries for 30s; the WebSocket RPC channel (`/api/remote.mux`) is forwarded through the proxy with upgrade headers preserved.

Tested against `@deepseek-ai/dsh@0.1.2-rc.1` (198 unit/integration tests + end-to-end verification on a real machine).

## Install

1. Download the latest `dsh-vscode.vsix` from [Releases](https://github.com/chai1110/dsh-vscode/releases);
2. In VS Code press `Ctrl+Shift+P` → run `Extensions: Install from VSIX...` → select the file;
3. Reload the window (`Developer: Reload Window`).

> Prerequisite: the `dsh` CLI from DeepSeek Harness must be installed locally. The marketplace package `Fengze233.dsh-vscode-panel` is the unmaintained upstream build (0.3.1) and does not support new DSH — if you had it installed, this vsix upgrades it in place.

Build from source:

```bash
git clone https://github.com/chai1110/dsh-vscode.git
cd dsh-vscode
npm install
npm run package        # produces dsh-vscode.vsix, then install as above
```

## Usage

- A DSH whale icon appears in both the left Activity Bar and the right Secondary Side Bar — click either to open the panel;
- The service manages itself: auto-start/reuse, automatic free-port fallback, a four-state status bar, and reconnect pages on crash/disconnect;
- **Sessions are grouped by workspace**: the panel's workspace follows the folder open in VS Code — open the folder whose session history you want to see;
- Common commands (prefixed `DSH:`): open panel, restart/stop service, copy URL, show/copy logs, retry bridge install, uninstall bridge;
- Common settings (`dsh.*`): `dsh.port` (3080), `dsh.host` (loopback only), `dsh.autoStart`, `dsh.stopOnExit`, `dsh.remote.enabled` (SSH remote, off by default), `dsh.image.fallback` (image fallback for non-vision models).

## Bridge note

After installation the extension writes its bridge package `dsh-vscode-bridge` into the DSH user directory (`~/.dsh/profiles/web`, a marked `insert:` entry — user directory only, the DSH installation directory is never touched). It enables four integrations: **external links in browser, file paths in VS Code, clipboard copy, undo/redo**. Uninstalling the extension or running `DSH: Uninstall Bridge` cleans everything up by the markers.

## Known limitations

- Under new-dsh auth the extension **cannot reuse** an externally started `dsh web` (the launch token lives only in that process's memory) and starts its own instance instead; both share the same `~/.dsh` data and do not interfere — but do not use the same session from both at once;
- Image fallback requires an open workspace folder (cache files land in the workspace root);
- Upstream legacy: copy/paste/undo inside the macOS webview is backed by the bridge's shortcut simulation and may differ slightly from native behavior.

## Development

Requirements: Node.js ≥ 22, VS Code ≥ 1.91.

```bash
npm install
npm test            # 198 unit/integration tests (including a full real dsh web flow)
npm run typecheck   # type check
npm run package     # package .vsix
```

Debugging: open this folder in VS Code and press `F5` to launch the Extension Development Host. Core code lives in `src/service/` (`detect.ts`, `process.ts`, `authproxy.ts`, `manager.ts`).

## License

[MIT](./LICENSE) © 2026 Fengze233 (upstream) · 2026 chai1110 (this fork's changes)
