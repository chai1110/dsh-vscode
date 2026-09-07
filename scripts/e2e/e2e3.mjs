// e2e3.mjs — 抓取页面全部 JS 资产，检查桥接代码是否送达 + 由谁触发
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const port = await freePort();
const child = spawn('/Users/csl/.local/bin/dsh', ['web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: '/tmp/dsh-e2e', stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });
const cleanup = () => { try { child.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);

const urlRe = /dsh web: (https?:\/\/[^\s)]+)/;
let tokenUrl = null;
for (let i = 0; i < 150 && !tokenUrl; i++) {
  const m = out.match(urlRe);
  if (m) tokenUrl = m[1]; else await new Promise((r) => setTimeout(r, 200));
}
const base = `http://127.0.0.1:${port}`;
const r2 = await fetch(tokenUrl, { redirect: 'manual' });
const cookie = r2.headers.get('set-cookie').split(';')[0];
const html = await (await fetch(`${base}/`, { headers: { cookie } })).text();
writeFileSync('/tmp/dsh-e2e/page.html', html);
console.log('页面大小:', html.length, '| 含 __DSH_BOOT__:', html.includes('__DSH_BOOT__'), '| 含 dsh-vscode-bridge:', html.includes('dsh-vscode-bridge'));

// 解 HTML 转义后提取 script src
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => decode(m[1]));
console.log('script srcs:', JSON.stringify(srcs));

const grab = async (src) => {
  const url = src.startsWith('http') ? src : `${base}${src.startsWith('/') ? src : '/' + src.replace(/^\.\//, '')}`;
  const res = await fetch(url, { headers: { cookie } });
  const text = await res.text();
  return { url, status: res.status, text };
};

for (const src of srcs) {
  const { url, status, text } = await grab(src);
  console.log(`\n=== ${url} → ${status} (${text.length}B) ===`);
  console.log('  含 bridgeHello:', text.includes('bridgeHello'), '| 含 bridgeAck:', text.includes('bridgeAck'), '| 含 dsh-vscode-bridge:', text.includes('dsh-vscode-bridge'), '| 含 BRIDGE_VERSION:', text.includes('BRIDGE_VERSION'));
  if (src.includes('client-modules')) {
    // 加载器如何决定拉取/执行模块
    const i = text.indexOf('dsh-vscode-bridge');
    console.log('  加载器内 dsh-vscode-bridge 上下文:', i >= 0 ? text.slice(Math.max(0, i - 200), i + 200) : '(无)');
  }
}

// 应用包单独查
const appSrc = srcs.find((s) => s.includes('assets/'));
if (appSrc) {
  const { text } = await grab(appSrc);
  console.log('\n=== 应用包内桥接/模块系统线索 ===');
  console.log('  含 __DSH_BOOT__:', text.includes('__DSH_BOOT__'), '| 含 __ModuleLoader__:', text.includes('__ModuleLoader__'));
  console.log('  含 dsh-cordis-client-runner:', text.includes('dsh-cordis-client-runner'));
  console.log('  含 bridgeHello:', text.includes('bridgeHello'));
}

// boot 数据检查：页面上模块图（graph）有哪些行
const bootStart = html.indexOf('__DSH_BOOT__');
console.log('\n=== boot 上下文（-100 ~ +1200） ===');
console.log(html.slice(Math.max(0, bootStart - 100), bootStart + 1200));
cleanup();
process.exit(0);
