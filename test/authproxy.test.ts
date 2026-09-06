// test/authproxy.test.ts — 本地认证代理的单元测试（真实本地 upstream 服务器 + 真实转发）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { obtainAuthCookie, startAuthProxy, createAuthProxyController } from '../src/service/authproxy';

/** 启动本地 upstream 并返回 { server, port, seen: 请求记录 } */
async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) => void) {
  const seen: { host?: string; cookie?: string; origin?: string; secFetchSite?: string; body?: string; url?: string; method?: string }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({
        host: req.headers.host as string | undefined,
        cookie: req.headers.cookie as string | undefined,
        origin: req.headers.origin as string | undefined,
        secFetchSite: req.headers['sec-fetch-site'] as string | undefined,
        body,
        url: req.url,
        method: req.method,
      });
      handler(req, res, Buffer.concat(chunks));
    });
  });
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as AddressInfo).port;
  return { server, port, seen };
}

const COOKIE = 'dsh-auth-test=abc123';

test('obtainAuthCookie：从 303 响应提取 cookie 键值对', async () => {
  const fetchImpl = (async () =>
    new Response(null, { status: 303, headers: { 'set-cookie': `${COOKIE}; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict` } })) as unknown as typeof fetch;
  assert.equal(await obtainAuthCookie('http://127.0.0.1:1/?token=x', fetchImpl), COOKIE);
});

test('obtainAuthCookie：无 set-cookie / fetch 抛错 → null', async () => {
  const noCookie = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
  assert.equal(await obtainAuthCookie('http://127.0.0.1:1/', noCookie), null);
  const throwing = (async () => {
    throw new Error('down');
  }) as unknown as typeof fetch;
  assert.equal(await obtainAuthCookie('http://127.0.0.1:1/', throwing), null);
});

test('代理转发：改写 Host、注入 cookie、剔除浏览器上下文头', async () => {
  const { server, port, seen } = await serve((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hello-from-upstream');
  });
  const proxy = await startAuthProxy({ upstreamPort: port, cookie: COOKIE, tokenUrl: 'http://127.0.0.1:1/?token=x' });
  try {
    const res = await fetch(`${proxy.url}some/path`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9999' },
      body: '{"k":1}',
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello-from-upstream');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].host, `127.0.0.1:${port}`, 'Host 必须改写为上游 authority（Host 围栏）');
    assert.equal(seen[0].cookie, COOKIE, 'cookie 必须由代理注入');
    assert.equal(seen[0].origin, undefined, 'Origin 必须剔除（/api 围栏对带 Origin 的请求做同源校验）');
    assert.equal(seen[0].secFetchSite, undefined, 'Sec-Fetch-Site 必须剔除');
    assert.equal(seen[0].url, '/some/path');
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].body, '{"k":1}', '请求体须原样转发');
  } finally {
    proxy.stop();
    server.close();
  }
});

test('代理 401 自愈：上游拒绝后用令牌重新交换 cookie 并重试成功', async () => {
  let currentCookie = COOKIE;
  let first = true;
  const { server, port, seen } = await serve((_req, res) => {
    if (first) {
      first = false;
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('dsh web authentication required');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`cookie-was:${String(seen[seen.length - 1]?.cookie)}`);
  });
  // 令牌交换 stub：返回新 cookie，且记录交换次数
  let exchanges = 0;
  const fetchImpl = (async () => {
    exchanges += 1;
    currentCookie = `dsh-auth-test=fresh-${String(exchanges)}`;
    return new Response(null, { status: 303, headers: { 'set-cookie': `${currentCookie}; Path=/; HttpOnly; SameSite=Strict` } });
  }) as unknown as typeof fetch;
  const proxy = await startAuthProxy({ upstreamPort: port, cookie: COOKIE, tokenUrl: 'http://127.0.0.1:1/?token=x', fetchImpl });
  try {
    const res = await fetch(`${proxy.url}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /cookie-was:dsh-auth-test=fresh-1/, '重试请求应携带重新交换的新 cookie');
    assert.equal(exchanges, 1);
  } finally {
    proxy.stop();
    server.close();
  }
});

test('控制器：同一上游复用同代理地址，上游变化重建新地址', async () => {
  const logs: string[] = [];
  const fetchImpl = (async () =>
    new Response(null, { status: 303, headers: { 'set-cookie': `${COOKIE}; Path=/` } })) as unknown as typeof fetch;
  const controller = createAuthProxyController({ log: (l) => logs.push(l), fetchImpl });
  const token1 = 'http://127.0.0.1:3081/?token=a';
  const url1 = await controller.ensureReadyUrl(token1);
  const url1again = await controller.ensureReadyUrl(token1);
  assert.equal(url1, url1again, '同一上游应复用代理');
  // 换上游端口 → 重建（startAuthProxy 不校验上游可达）
  const url2 = await controller.ensureReadyUrl('http://127.0.0.1:3082/?token=b');
  assert.notEqual(url2, url1, '上游端口变化应重建代理');
  assert.ok(logs.some((l) => l.includes('authproxy')));
  controller.stop();
});
