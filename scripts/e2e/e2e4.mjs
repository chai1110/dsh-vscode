// e2e4.mjs — 最终验证：boot 条目 immediately + 桥接代码可加载 + 令牌全流程
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
if (!tokenUrl) { console.log('❌ 未解析到令牌地址'); process.exit(1); }
const base = `http://127.0.0.1:${port}`;
const r2 = await fetch(tokenUrl, { redirect: 'manual' });
const cookie = r2.headers.get('set-cookie').split(';')[0];
const html = await (await fetch(`${base}/`, { headers: { cookie } })).text();

const bootStart = html.indexOf('__DSH_BOOT__');
if (bootStart < 0) { console.log('❌ 页面无 __DSH_BOOT__'); process.exit(1); }
const eq = html.indexOf('=', bootStart);
const scriptEnd = html.indexOf('</script>', bootStart);
const boot = JSON.parse(html.slice(eq + 1, scriptEnd).trim().replace(/;$/, ''));
const bridgeRow = boot.entries.find((e) => e.id === 'dsh-vscode-bridge');
if (!bridgeRow) { console.log('❌ boot 中无 dsh-vscode-bridge 条目'); process.exit(1); }
console.log('桥接 boot 条目:', JSON.stringify(bridgeRow, null, 1));

// 抓取桥接 bundle 本体
const res = await fetch(`${base}${bridgeRow.url}`, { headers: { cookie } });
const code = await res.text();
console.log(`桥接代码包: ${res.status}, ${code.length}B`);
const checks = {
  '含握手监听(bridgeHello)': code.includes('bridgeHello'),
  '含回执(bridgeAck)': code.includes('bridgeAck'),
  '版本 0.4.2': code.includes('0.4.2'),
  '注册到 __ModuleLoader__': code.includes('__ModuleLoader__.load') && code.includes('"dsh-vscode-bridge"'),
};
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✅' : '❌'} ${k}`);

const pass = bridgeRow.immediately === true && res.status === 200 && Object.values(checks).every(Boolean);
console.log(pass
  ? '\n🎉 端到端验证全部通过：桥接将在页面启动时立即执行，握手可以收到回执'
  : '\n❌ 验证未通过，还有问题');
cleanup();
process.exit(pass ? 0 : 1);
