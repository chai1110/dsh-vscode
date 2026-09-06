// src/service/detect.ts — 端口探测：判断目标地址上是否运行着 DSH web 服务
// 纯模块：不依赖 vscode，可用 node:test 直接单测。

/** 探测结果 */
export type ProbeResult = 'dsh' | 'dsh-auth' | 'foreign' | 'down';

/** DSH 首页的稳定识别特征（首页 HTML 内联了 window.__DSH_BOOT__ 启动数据，已实测确认） */
const DSH_MARKER = '__DSH_BOOT__';

/** 新版 dsh（0.1.2 起）web 鉴权 401 响应的固定文案（dsh-client-connection 硬编码，已实测确认） */
const DSH_AUTH_MARKER = 'dsh web authentication required';

/**
 * 探测 host:port 上运行的服务：
 * - 200 且首页含 DSH 标记 → 'dsh'（未启用鉴权的旧版 dsh，可直接复用）
 * - 401/403 且响应体含 dsh 鉴权文案 → 'dsh-auth'（新版 dsh，需启动令牌换 cookie 才能访问）
 * - 有 HTTP 响应但不是 DSH → 'foreign'（端口被其他程序占用）
 * - 连接失败/超时/拒绝 → 'down'（视为未运行）
 */
export async function probeService(
  host: string,
  port: number,
  timeoutMs = 3000,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://${host}:${port}/`, {
      signal: controller.signal,
      redirect: 'manual',
    });
    if (res.status === 401 || res.status === 403) {
      // 鉴权围栏对无 cookie 请求统一回 401（403 留作未来策略扩展）；响应体是识别 DSH 的唯一依据
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* 响应体读取失败：按非 DSH 处理 */
      }
      return body.includes(DSH_AUTH_MARKER) ? 'dsh-auth' : 'foreign';
    }
    if (!res.ok) return 'foreign';
    const body = await res.text();
    return body.includes(DSH_MARKER) ? 'dsh' : 'foreign';
  } catch {
    // 网络错误 / 超时中断：一律视为未运行
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 dsh web 的启动输出中解析就绪地址。
 *
 * 新版 dsh 就绪时向 stdout 打印一行（printUrl 默认开启）：
 *   `dsh web: http://127.0.0.1:3080/?token=<launchToken> (LAN: http://…/?token=…)`
 * 其中首条 URL 是 loopback 规范地址，且自带「启动令牌换 cookie」所需的 ?token= 参数。
 * 该令牌只存在于服务进程内存，外部无法推算——插件自启实例时必须从这行输出取地址。
 *
 * @param text 任意一段 stdout 文本（可含多行）
 * @returns 解析到的第一条就绪地址；未命中返回 null
 */
export function extractDshWebUrl(text: string): string | null {
  const match = /dsh web: (https?:\/\/[^\s)]+)/.exec(text);
  if (!match) return null;
  try {
    return new URL(match[1]).href;
  } catch {
    return null;
  }
}

/** 端口被占用时自动替换的候选尝试次数（从原端口 +1 起依次探测） */
export const PORT_FALLBACK_ATTEMPTS = 50;

/**
 * 从 startPort+1 开始依次探测，返回第一个「未运行」的端口号（探测结果为 down 视为空闲）。
 * 全部候选都被占用或超出 65535 时返回 null，由调用方保持原「端口被占用」错误。
 *
 * @param host       目标主机（与 probeService 一致）
 * @param startPort  被占用端口（候选从其 +1 开始）
 * @param attempts   最多尝试的候选数
 * @param probeImpl  探测实现（默认 probeService；单测可注入假实现）
 * @param timeoutMs  单次探测超时（透传给 probeImpl）
 */
export async function findFreePort(
  host: string,
  startPort: number,
  attempts: number,
  probeImpl: (host: string, port: number, timeoutMs?: number) => Promise<ProbeResult> = probeService,
  timeoutMs?: number,
): Promise<number | null> {
  for (let offset = 1; offset <= attempts; offset++) {
    const candidate = startPort + offset;
    if (candidate > 65535) break; // 超出合法端口范围，停止
    const result = await probeImpl(host, candidate, timeoutMs);
    if (result === 'down') return candidate;
  }
  return null;
}
