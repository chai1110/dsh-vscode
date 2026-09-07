// e2e.mjs — 以插件视角端到端验证新版 dsh web：token 流程 + 桥接客户端是否被下发
import { spawn } from 'node:child_process';
import net from 'node:net';

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});

const port = await freePort();
console.log('== 测试端口:', port);
const child = spawn('/Users/csl/.local/bin/dsh', ['web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: '/tmp/dsh-e2e', stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });
const cleanup = () => { try { child.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);

// 1) 等 stdout 打印带 token 的就绪地址（与扩展 extractDshWebUrl 相同的正则）
const urlRe = /dsh web: (https?:\/\/[^\s)]+)/;
let tokenUrl = null;
for (let i = 0; i < 150 && !tokenUrl; i++) {
  const m = out.match(urlRe);
  if (m) tokenUrl = m[1]; else await new Promise((r) => setTimeout(r, 200));
}
if (!tokenUrl) { console.log('❌ 15秒内未从 stdout 解析到就绪地址'); console.log(out.slice(-2000)); process.exit(1); }
console.log('✅ stdout 令牌地址:', tokenUrl);

// 2) 无 cookie 探测（probeService 视角）
const r1 = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
const body1 = await r1.text();
console.log(r1.status === 401 && body1.includes('dsh web authentication required')
  ? '✅ 无 cookie 探测 → 401 + 鉴权文案（probeService 应判 dsh-auth）'
  : `⚠️ 无 cookie 探测: ${r1.status} ${body1.slice(0, 60)}`);

// 3) 令牌换 cookie（iframe 首次加载视角）
const r2 = await fetch(tokenUrl, { redirect: 'manual' });
const setCookie = r2.headers.get('set-cookie');
console.log(r2.status === 303 && setCookie
  ? `✅ 令牌交换 → 303 重定向 + 种 cookie（${setCookie.split(';')[0].slice(0, 40)}…）`
  : `❌ 令牌交换异常: ${r2.status} cookie=${setCookie}`);

// 4) 带 cookie 取首页（重定向后的干净 /）
const cookie = setCookie.split(';')[0];
const r3 = await fetch(`http://127.0.0.1:${port}/`, { headers: { cookie } });
const html = await r3.text();
console.log(r3.status === 200 && html.includes('__DSH_BOOT__')
  ? '✅ 带 cookie 首页 → 200 且含 __DSH_BOOT__'
  : `❌ 首页异常: ${r3.status} 含标记=${html.includes('__DSH_BOOT__')}`);

// 5) 桥接客户端是否被下发：在 boot 数据与首页资源里找 dsh-vscode-bridge
const bootMatch = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
if (bootMatch) {
  const boot = bootMatch[1];
  const hasBridge = boot.includes('dsh-vscode-bridge');
  console.log(hasBridge
    ? '✅ 页面 boot 数据包含 dsh-vscode-bridge（客户端模块会被下发）'
    : '❌ 页面 boot 数据中【没有】 dsh-vscode-bridge —— 桥接客户端根本没被注入页面！');
  // 打印 boot 里注册的 client 模块 id 列表（截取）
  const ids = [...boot.matchAll(/"(dsh-[a-z-]+|@deepseek-ai\/[a-z-]+)"/g)].map((m) => m[1]);
  console.log('   boot 中出现的模块/包名:', [...new Set(ids)].join(', ') || '(无)');
} else {
  console.log('⚠️ 未能截取 __DSH_BOOT__ 数据块');
}
// 全页兜底搜索
console.log(html.includes('dsh-vscode-bridge')
  ? '✅ 首页 HTML 全文包含 dsh-vscode-bridge'
  : '❌ 首页 HTML 全文不含 dsh-vscode-bridge');
cleanup();
process.exit(0);
