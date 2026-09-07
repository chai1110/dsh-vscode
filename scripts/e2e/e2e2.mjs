// e2e2.mjs — 深挖：页面实际送达的 JS 里，桥接握手代码到底存不存在、处于什么状态
import { spawn } from 'node:child_process';
import net from 'node:net';

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

// __DSH_BOOT__ 数据块（宽松截取）
const bootIdx = html.indexOf('window.__DSH_BOOT__');
const bootSlice = html.slice(bootIdx, bootIdx + 6000);
console.log('=== __DSH_BOOT__ 片段（前 2500 字符） ===');
console.log(bootSlice.slice(0, 2500));

// 页面引用的所有脚本
const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
console.log('\n=== 页面 <script src> 列表 ===');
console.log(srcs.join('\n'));

// 逐个抓取，找桥接握手代码
console.log('\n=== 各脚本中桥接相关代码检索 ===');
for (const src of srcs) {
  const url = src.startsWith('http') ? src : `${base}${src}`;
  try {
    const res = await fetch(url, { headers: { cookie } });
    const text = await res.text();
    const hits = {
      hello监听: text.includes('bridgeHello'),
      ack回执: text.includes('bridgeAck'),
      版本号040: text.includes('0.4.0'),
      版本号041: text.includes('0.4.1'),
      模块注册: text.includes('__ModuleLoader__') && text.includes('dsh-vscode-bridge'),
    };
    const any = Object.values(hits).some(Boolean);
    console.log(`${any ? '🎯' : '  '} ${src} (${res.status}, ${text.length}B)`, any ? JSON.stringify(hits) : '');
  } catch (e) {
    console.log(`  ${src} 抓取失败: ${e.message}`);
  }
}
// boot 数据里 dsh-vscode-bridge 的上下文
console.log('\n=== boot 中 dsh-vscode-bridge 上下文 ===');
const ctx = bootSlice.indexOf('dsh-vscode-bridge');
if (ctx >= 0) console.log(bootSlice.slice(Math.max(0, ctx - 300), ctx + 300));
else console.log('(boot 前 6000 字符内未出现)');
cleanup();
process.exit(0);
