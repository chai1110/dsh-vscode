// src/service/authproxy.ts
import http from "node:http";
import net from "node:net";
async function obtainAuthCookie(tokenUrl, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(tokenUrl, { redirect: "manual" });
  } catch {
    return null;
  }
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const pair = raw.split(";")[0]?.trim();
  return pair ? pair : null;
}
var STRIPPED_REQUEST_HEADERS = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "cookie",
  "origin",
  "referer",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user"
]);
var STRIPPED_RESPONSE_HEADERS = /* @__PURE__ */ new Set(["transfer-encoding", "connection"]);
async function startAuthProxy(opts) {
  const upstreamPort = opts.upstreamPort;
  const upstreamAuthority = `127.0.0.1:${String(upstreamPort)}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let cookie = opts.cookie;
  const rewriteRequestHeaders = (headers) => {
    const out = {};
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (STRIPPED_REQUEST_HEADERS.has(lower) || value === void 0) continue;
      out[lower] = value;
    }
    out.host = upstreamAuthority;
    out.cookie = cookie;
    return out;
  };
  const refreshCookie = async () => {
    const fresh = await obtainAuthCookie(opts.tokenUrl, fetchImpl);
    if (!fresh) return false;
    cookie = fresh;
    opts.log?.("[authproxy] \u4E0A\u6E38 401\uFF0C\u5DF2\u91CD\u65B0\u4EA4\u6362\u8BA4\u8BC1 cookie \u5E76\u91CD\u8BD5");
    return true;
  };
  const server = http.createServer((req, resp) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const send = () => {
        const headers = rewriteRequestHeaders(req.headers);
        const upstreamReq = http.request(
          { host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers },
          (upRes) => {
            if (upRes.statusCode === 401) {
              upRes.resume();
              void (async () => {
                if (!await refreshCookie()) {
                  resp.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
                  resp.end("dsh-vscode: upstream authentication failed");
                  return;
                }
                const retry = http.request(
                  { host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: rewriteRequestHeaders(req.headers) },
                  (res2) => {
                    const outHeaders2 = {};
                    for (const [name, value] of Object.entries(res2.headers)) {
                      if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase()) || value === void 0) continue;
                      outHeaders2[name] = value;
                    }
                    resp.writeHead(res2.statusCode ?? 502, outHeaders2);
                    res2.pipe(resp);
                  }
                );
                retry.on("error", () => {
                  if (!resp.headersSent) resp.writeHead(502);
                  resp.end();
                });
                if (body.length > 0) retry.write(body);
                retry.end();
              })();
              return;
            }
            const outHeaders = {};
            for (const [name, value] of Object.entries(upRes.headers)) {
              if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase()) || value === void 0) continue;
              outHeaders[name] = value;
            }
            resp.writeHead(upRes.statusCode ?? 502, outHeaders);
            upRes.pipe(resp);
          }
        );
        upstreamReq.on("error", () => {
          if (!resp.headersSent) resp.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          resp.end("dsh-vscode: upstream unavailable");
        });
        if (body.length > 0) upstreamReq.write(body);
        upstreamReq.end();
      };
      send();
    });
  });
  server.on("upgrade", (req, clientSocket, head) => {
    const upstreamSocket = net.connect({ host: "127.0.0.1", port: upstreamPort }, () => {
      const headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        const lower = name.toLowerCase();
        if (lower === "host" || lower === "cookie" || lower === "origin" || lower === "referer" || lower.startsWith("sec-fetch-")) continue;
        if (value === void 0) continue;
        headers[lower] = value;
      }
      headers["host"] = upstreamAuthority;
      headers["cookie"] = cookie;
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(headers)) {
        for (const item of Array.isArray(value) ? value : [String(value)]) lines.push(`${name}: ${item}`);
      }
      upstreamSocket.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstreamSocket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  if (!port) {
    server.close();
    throw new Error("authproxy: failed to obtain a listen port");
  }
  return {
    url: `http://127.0.0.1:${String(port)}/`,
    updateCookie(next) {
      cookie = next;
    },
    stop() {
      server.close();
    }
  };
}
function createAuthProxyController(opts) {
  let proxy = null;
  let upstreamKey = "";
  return {
    async ensureReadyUrl(tokenUrl) {
      const upstream = new URL(tokenUrl);
      const key = upstream.host;
      const cookie = await obtainAuthCookie(tokenUrl, opts.fetchImpl);
      if (!cookie) throw new Error("\u4EE4\u724C\u4EA4\u6362\u672A\u8FD4\u56DE\u8BA4\u8BC1 cookie");
      if (proxy && upstreamKey === key) {
        proxy.updateCookie(cookie);
        opts.log?.(`[authproxy] \u590D\u7528\u4EE3\u7406 ${proxy.url} \u2192 ${key}\uFF08cookie \u5DF2\u968F\u670D\u52A1\u91CD\u542F\u5237\u65B0\uFF09`);
        return proxy.url;
      }
      proxy?.stop();
      proxy = await startAuthProxy({ upstreamPort: Number(upstream.port), cookie, tokenUrl, log: opts.log });
      upstreamKey = key;
      opts.log?.(`[authproxy] ${proxy.url} \u2192 ${key}\uFF08webview \u8DE8\u7AD9 iframe \u643A\u5E26\u4E0D\u4E86 SameSite=Strict cookie\uFF0C\u7531\u4EE3\u7406\u5728\u4E0A\u6E38\u6CE8\u5165\uFF09`);
      return proxy.url;
    },
    stop() {
      proxy?.stop();
      proxy = null;
      upstreamKey = "";
    }
  };
}
export {
  createAuthProxyController,
  obtainAuthCookie,
  startAuthProxy
};
