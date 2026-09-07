#!/usr/bin/env bash
# dsh-vscode 发版脚本（chai1110/dsh-vscode）
#
# 用法：
#   bash scripts/release.sh check   [版本]   本地：校验三处版本号 → 跑测试 → 打包 vsix
#   bash scripts/release.sh publish [版本]   上面全部 + 建/推 tag + 发布 GitHub Release（临时切 chai1110，发完切回 cslht11）
#
# 省略版本时默认取 package.json 里的 version。
# 可选环境变量：
#   RELEASE_TITLE="自定义标题"    覆盖 Release 标题（默认 vX.Y.Z）
#   KEEP_ACCOUNT=1                发完不切回 cslht11（保留 chai1110 为活跃账号）
#
# 说明：Release 说明正文自动从 CHANGELOG.md 里 "## [版本]" 段落提取。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="chai1110/dsh-vscode"
FORK_ACCOUNT="chai1110"
BACK_ACCOUNT="cslht11"

MODE="${1:-check}"
VERSION="${2:-$(node -e "console.log(require('./package.json').version)")}"
TAG="v$VERSION"

ok()   { echo -e "  \033[0;32m✓\033[0m $*"; }
info() { echo -e "\033[1;33m$*\033[0m"; }
die()  { echo -e "\033[0;31m✗ $*\033[0m" >&2; exit 1; }

# ---------- 1. 版本一致性（三处必须相同，package.test.ts 也会强制校验） ----------
info "① 校验三处版本号是否一致（应为 $VERSION）"
V_ROOT=$(node -e "console.log(require('./package.json').version)")
V_BRIDGE=$(node -e "console.log(require('./bridge-client/package.json').version)")
# 注意：BSD(macOS) grep -E 不支持 \s，必须用 * 匹配空格；|| true 防止无匹配时 set -e 静默退出
V_CLIENT=$(grep -oE 'BRIDGE_VERSION *= *"[0-9.]+"' bridge-client/lib/client.js | head -1 | grep -oE '[0-9.]+' || true)
[ "$V_ROOT" = "$VERSION" ]   || die "package.json 版本 $V_ROOT ≠ $VERSION"
[ "$V_BRIDGE" = "$VERSION" ] || die "bridge-client/package.json 版本 $V_BRIDGE ≠ $VERSION"
[ "$V_CLIENT" = "$VERSION" ] || die "bridge-client/lib/client.js BRIDGE_VERSION $V_CLIENT ≠ $VERSION"
ok "三处版本号均为 $VERSION"

# ---------- 2. 测试 ----------
info "② 运行测试（npm test）"
npm test >/tmp/dsh-vscode-release-test.log 2>&1 || { tail -20 /tmp/dsh-vscode-release-test.log; die "测试未通过"; }
ok "测试通过（详见 /tmp/dsh-vscode-release-test.log）"

# ---------- 3. 打包 ----------
info "③ 打包 vsix（npm run package）"
npm run package >/tmp/dsh-vscode-release-package.log 2>&1 || { tail -20 /tmp/dsh-vscode-release-package.log; die "打包失败"; }
ok "已生成 dsh-vscode.vsix"

[ "$MODE" = "check" ] && { info "\n本地检查完成。要发布请执行：bash scripts/release.sh publish $VERSION"; exit 0; }
[ "$MODE" = "publish" ] || die "未知模式：$MODE（可用 check / publish）"

# ---------- 4. 从 CHANGELOG 提取发版说明 ----------
NOTES="/tmp/dsh-vscode-release-notes-$VERSION.md"
awk -v v="$VERSION" '
  $0 ~ "^## \\["v"\\]" { f=1; next }
  f && /^## \[/        { f=0 }
  f                    { print }
' CHANGELOG.md > "$NOTES"
[ -s "$NOTES" ] || { echo "（CHANGELOG 未找到 $VERSION 段落，改用 GitHub 自动生成）" > "$NOTES"; }

# ---------- 5. tag ----------
info "④ 处理 tag $TAG"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  ok "tag $TAG 已存在，跳过创建"
else
  git tag -a "$TAG" -m "$TAG"
  ok "已创建 tag $TAG"
fi
git push "$FORK_ACCOUNT" "$TAG" 2>/dev/null || ok "tag 已在远端或推送跳过"

# ---------- 6. 发布 Release ----------
info "⑤ 发布 GitHub Release（切换到 $FORK_ACCOUNT）"
gh auth switch --user "$FORK_ACCOUNT" >/dev/null
TITLE="${RELEASE_TITLE:-$TAG}"
gh release create "$TAG" -R "$REPO" --title "$TITLE" --notes-file "$NOTES" ./dsh-vscode.vsix
ok "Release 已发布：https://github.com/$REPO/releases/tag/$TAG"

if [ -z "${KEEP_ACCOUNT:-}" ]; then
  gh auth switch --user "$BACK_ACCOUNT" >/dev/null
  ok "已切回 gh 活跃账号 $BACK_ACCOUNT"
fi
