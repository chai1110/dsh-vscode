// smoke-live.ts — 对「运行中的 dsh 实例」验证 0.5.4 完整代理链（免自起 dsh，沙箱友好）。
//
// 用途：升级 dsh 版本后快速回归（token 兑换 → 代理 → boot 页 + bridge 注入）。
// 用法（对 3080 常驻实例）：
//   npx esbuild scripts/e2e/smoke-live.ts --bundle --platform=node --format=esm \
//     --external:vscode --outfile=/tmp/smoke-live.mjs --log-level=error
//   node /tmp/smoke-live.mjs "http://127.0.0.1:3080/?token=<启动行里的token>"
import { exchangeSession, getValidSession } from '../src/service/session';
import { createDshProxy } from '../src/service/proxy';

const launchUrl = process.argv[2];
if (!launchUrl) {
  console.error('用法: node smoke-live.mjs <tokenUrl>');
  process.exit(1);
}
const store = new Map();
const deps = { fetchImpl: fetch, store };

const ex = await exchangeSession(launchUrl, deps);
console.log('1) 兑换:', ex.status, '| authority:', ex.status === 'ok' ? ex.authority : '-');
if (ex.status !== 'ok') process.exit(1);

const session = getValidSession(ex.authority, deps);
console.log('2) 会话 cookie:', session ? `${session.cookie.split('=')[0]}=…(${session.cookie.length}字符)` : '无');
if (!session) process.exit(1);

const proxy = createDshProxy({
  getTarget: () => ({ url: `http://${ex.authority}`, cookie: session.cookie }),
  onAuthFailure: () => console.log('  [proxy] 上游 401 → 会话失效'),
  log: () => {},
});
await proxy.start();

const res = await fetch(proxy.baseUrl);
const html = await res.text();
console.log('3) 经代理取首页:', res.status, '| __DSH_BOOT__:', html.includes('__DSH_BOOT__'), '| dsh-vscode-bridge:', html.includes('dsh-vscode-bridge'));

await proxy.stop();
const pass = res.status === 200 && html.includes('__DSH_BOOT__') && html.includes('dsh-vscode-bridge');
console.log('SMOKE ' + (pass ? 'PASS' : 'FAIL'));
process.exit(pass ? 0 : 1);
