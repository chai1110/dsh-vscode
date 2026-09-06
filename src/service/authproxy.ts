// src/service/authproxy.ts — 本地认证代理：让 VS Code webview 的跨站 iframe 能访问新版 dsh web
//
// 背景（v0.5.0）：dsh 0.1.2 起 web 面板用「启动令牌换 SameSite=Strict cookie」认证。VS Code
// webview 外壳是 vscode-webview:// 来源，对 http://127.0.0.1:<port> 永远是跨站——Strict cookie
// 在跨站 iframe 里种了也带不上：令牌交换 303 后的 GET / 不带 cookie → 401 文本页 → 应用不启动
// → 桥接握手必超时。实测（localhost 外壳嵌 127.0.0.1 iframe，16 次 hello 零回执）确认。
//
// 解法：扩展宿主内跑一个本地 HTTP 代理。iframe 只连代理（浏览器侧不需要任何 cookie）；
// 代理在上游转发时注入认证 cookie（由扩展用带令牌地址完成一次交换取得），并按 /api 的
// Host 围栏语义改写 Host、剔除 Origin/Referer/Sec-Fetch-*（代理以非浏览器身份转发）。
// 纯 Node 模块：不依赖 vscode；注入 fetch 便于单测。
import http from 'node:http';
import net from 'node:net';

/**
 * 一次性令牌交换：GET 带 ?token= 的就绪地址，从 303 响应取得 Set-Cookie 的 name=value。
 * 服务端策略见 dsh-client-connection：令牌合法 → 种 SameSite=Strict cookie → 重定向干净 /。
 * @returns cookie 键值对（不含属性）；交换失败/无 cookie 返回 null
 */
export async function obtainAuthCookie(tokenUrl: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchImpl(tokenUrl, { redirect: 'manual' });
  } catch {
    return null;
  }
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const pair = raw.split(';')[0]?.trim();
  return pair ? pair : null;
}

/** 转发上游前剔除的浏览器上下文头：代理是非浏览器客户端，围栏按 Host 判定 */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'cookie',
  'origin',
  'referer',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-fetch-user',
]);

/** 转发上游响应时剔除的逐跳头（由 Node 重新分块） */
const STRIPPED_RESPONSE_HEADERS = new Set(['transfer-encoding', 'connection']);

/** 本地认证代理实例 */
export interface AuthProxy {
  /** 代理地址（http://127.0.0.1:<port>/），iframe 应加载它而非上游直连地址 */
  url: string;
  /** 上游 cookie 轮换时更新（令牌重启轮换后由控制器调用） */
  updateCookie(cookie: string): void;
  stop(): void;
}

export interface StartAuthProxyOptions {
  /** 上游 dsh web 端口（插件自有实例） */
  upstreamPort: number;
  /** 初始认证 cookie（name=value） */
  cookie: string;
  /** 带令牌的就绪地址：上游返回 401（令牌已随服务重启轮换）时自动重新交换 */
  tokenUrl: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * 启动本地认证代理（监听 127.0.0.1 随机端口）。
 * 每个请求：改写 Host 为上游 authority、剔除浏览器上下文头、注入认证 cookie 后转发；
 * 响应原样回传（剔除逐跳头）。上游 401 时用令牌地址重新交换 cookie 并重试一次。
 * WebSocket upgrade 连接原样双向转发（当前 UI 纯 fetch，兜底以防上游新增）。
 */
export async function startAuthProxy(opts: StartAuthProxyOptions): Promise<AuthProxy> {
  const upstreamPort = opts.upstreamPort;
  const upstreamAuthority = `127.0.0.1:${String(upstreamPort)}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let cookie = opts.cookie;

  const rewriteRequestHeaders = (headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders => {
    const out: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (STRIPPED_REQUEST_HEADERS.has(lower) || value === undefined) continue;
      out[lower] = value;
    }
    out.host = upstreamAuthority;
    out.cookie = cookie;
    return out;
  };

  /** 上游 401：令牌已随服务重启轮换，重新交换后由调用方重放一次 */
  const refreshCookie = async (): Promise<boolean> => {
    const fresh = await obtainAuthCookie(opts.tokenUrl, fetchImpl);
    if (!fresh) return false;
    cookie = fresh;
    opts.log?.('[authproxy] 上游 401，已重新交换认证 cookie 并重试');
    return true;
  };

  const server = http.createServer((req, resp) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const send = (): void => {
        const headers = rewriteRequestHeaders(req.headers);
        const upstreamReq = http.request(
          { host: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method, headers },
          (upRes) => {
            if (upRes.statusCode === 401) {
              upRes.resume(); // 丢弃原响应
              void (async () => {
                if (!(await refreshCookie())) {
                  resp.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
                  resp.end('dsh-vscode: upstream authentication failed');
                  return;
                }
                const retry = http.request(
                  { host: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method, headers: rewriteRequestHeaders(req.headers) },
                  (res2) => {
                    const outHeaders: http.OutgoingHttpHeaders = {};
                    for (const [name, value] of Object.entries(res2.headers)) {
                      if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
                      outHeaders[name] = value;
                    }
                    resp.writeHead(res2.statusCode ?? 502, outHeaders);
                    res2.pipe(resp);
                  },
                );
                retry.on('error', () => {
                  if (!resp.headersSent) resp.writeHead(502);
                  resp.end();
                });
                if (body.length > 0) retry.write(body);
                retry.end();
              })();
              return;
            }
            const outHeaders: http.OutgoingHttpHeaders = {};
            for (const [name, value] of Object.entries(upRes.headers)) {
              if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
              outHeaders[name] = value;
            }
            resp.writeHead(upRes.statusCode ?? 502, outHeaders);
            upRes.pipe(resp);
          },
        );
        upstreamReq.on('error', () => {
          if (!resp.headersSent) resp.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
          resp.end('dsh-vscode: upstream unavailable');
        });
        if (body.length > 0) upstreamReq.write(body);
        upstreamReq.end();
      };
      send();
    });
  });

  // WebSocket upgrade 转发（/api/remote.mux 是 UI 的唯一 RPC 通道）：
  // 升级请求必须保留 Connection/Upgrade 头——仅改写 Host、注入 cookie、剔除来源类头
  // （Origin 指向代理 origin 会被 /api 围栏的同源校验拒绝，剔除后围栏按 Host 判定放行）
  server.on('upgrade', (req, clientSocket, head) => {
    const upstreamSocket = net.connect({ host: '127.0.0.1', port: upstreamPort }, () => {
      const headers: Record<string, string | string[]> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        const lower = name.toLowerCase();
        if (lower === 'host' || lower === 'cookie' || lower === 'origin' || lower === 'referer' || lower.startsWith('sec-fetch-')) continue;
        if (value === undefined) continue;
        headers[lower] = value;
      }
      headers['host'] = upstreamAuthority;
      headers['cookie'] = cookie;
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(headers)) {
        for (const item of Array.isArray(value) ? value : [String(value)]) lines.push(`${name}: ${item}`);
      }
      upstreamSocket.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstreamSocket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  if (!port) {
    server.close();
    throw new Error('authproxy: failed to obtain a listen port');
  }

  return {
    url: `http://127.0.0.1:${String(port)}/`,
    updateCookie(next: string): void {
      cookie = next;
    },
    stop(): void {
      server.close();
    },
  };
}

/** 扩展侧代理生命周期控制器：同一上游复用同代理，令牌轮换仅刷新 cookie；上游变化则重建 */
export interface AuthProxyController {
  ensureReadyUrl(tokenUrl: string): Promise<string>;
  stop(): void;
}

export function createAuthProxyController(opts: { log?: (line: string) => void; fetchImpl?: typeof fetch }): AuthProxyController {
  let proxy: AuthProxy | null = null;
  let upstreamKey = '';
  return {
    async ensureReadyUrl(tokenUrl: string): Promise<string> {
      const upstream = new URL(tokenUrl);
      const key = upstream.host; // 127.0.0.1:<port>
      const cookie = await obtainAuthCookie(tokenUrl, opts.fetchImpl);
      if (!cookie) throw new Error('令牌交换未返回认证 cookie');
      if (proxy && upstreamKey === key) {
        proxy.updateCookie(cookie);
        opts.log?.(`[authproxy] 复用代理 ${proxy.url} → ${key}（cookie 已随服务重启刷新）`);
        return proxy.url;
      }
      proxy?.stop();
      proxy = await startAuthProxy({ upstreamPort: Number(upstream.port), cookie, tokenUrl, log: opts.log });
      upstreamKey = key;
      opts.log?.(`[authproxy] ${proxy.url} → ${key}（webview 跨站 iframe 携带不了 SameSite=Strict cookie，由代理在上游注入）`);
      return proxy.url;
    },
    stop(): void {
      proxy?.stop();
      proxy = null;
      upstreamKey = '';
    },
  };
}
