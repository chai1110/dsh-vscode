// run-proxy.mjs — 用 0.5.4 真实编译模块跑完整链路：解析启动行 → 兑换会话 → 起代理
import { exchangeSession, getValidSession } from './svc/session.js';
import { createDshProxy } from './svc/proxy.js';
import { readFileSync, writeFileSync } from 'node:fs';

const launchLine = readFileSync('/tmp/dsh-e2e-054/launch.txt', 'utf8').trim();
const launchUrl = launchLine.replace(/^dsh web: /, '');
const store = new Map();
const deps = { fetchImpl: fetch, store };

const ex = await exchangeSession(launchUrl, deps);
console.log('兑换结果:', ex.status, ex.authority);
if (ex.status !== 'ok') process.exit(1);

const session = getValidSession(ex.authority, deps);
console.log('会话 cookie:', session.cookie.split('=').slice(0,1)[0] + '=…(' + session.cookie.length + '字符), 过期:', new Date(session.expiresAt).toISOString());

const proxy = createDshProxy({
  getTarget: () => ({ url: `http://${ex.authority}`, cookie: session.cookie }),
  onAuthFailure: () => console.log('[proxy] 上游 401 → 会话失效'),
  log: (line) => console.log('[proxy]', line),
});
await proxy.start();
console.log('代理地址:', proxy.baseUrl);
writeFileSync('/tmp/dsh-e2e-054/proxy-url.txt', proxy.baseUrl);

// 验证经代理取首页（cookie 注入 → 200）
const res = await fetch(proxy.baseUrl);
const html = await res.text();
console.log('经代理取首页:', res.status, '| 含 __DSH_BOOT__:', html.includes('__DSH_BOOT__'), '| 含 dsh-vscode-bridge:', html.includes('dsh-vscode-bridge'));
