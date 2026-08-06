import { Capacitor } from "@capacitor/core";
import { fetchWithTimeout } from "./timeout";
import { FetchDiagnosticError, sanitizeEndpoint } from "./fetchDiagnostics";

const WORKER_BASE = "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev";
const FETCH_TEXT_TIMEOUT_MS = 12_000;

export function proxyUrlForTarget(url: string): string {
  return Capacitor.isNativePlatform()
    ? `${WORKER_BASE}/api/fetch?url=${encodeURIComponent(url)}`
    : `/api/fetch?url=${encodeURIComponent(url)}`;
}

export async function fetchTextViaProxy(
  url: string,
  provider = "proxy",
): Promise<string> {
  const proxyUrl = proxyUrlForTarget(url);

  let r: Response;
  try {
    r = await fetchWithTimeout(
      proxyUrl,
      {},
      FETCH_TEXT_TIMEOUT_MS,
      `${provider} ${sanitizeEndpoint(url)}`,
    );
  } catch (error: any) {
    throw new FetchDiagnosticError({
      kind: error?.name === "RequestTimeoutError" ? "timeout" : "network",
      provider,
      endpoint: sanitizeEndpoint(url),
      message: error?.message ?? String(error),
    });
  }

  if (!r.ok) {
    const upstreamStatus = r.headers.get("x-proxy-upstream-status");
    const body = await r.text().catch(() => "");
    throw new FetchDiagnosticError({
      kind: upstreamStatus ? "upstream_http" : "worker_http",
      provider,
      endpoint: sanitizeEndpoint(url),
      status: r.status,
      statusText: r.statusText,
      upstreamStatus,
      contentType:
        r.headers.get("x-proxy-content-type") ?? r.headers.get("content-type"),
      message: body.slice(0, 160) || r.statusText || "HTTP error",
    });
  }

  const text = await r.text();

  if (
    /<title>\s*Ionic App\s*<\/title>/i.test(text) ||
    /<base href=/i.test(text)
  ) {
    throw new FetchDiagnosticError({
      kind: "worker_http",
      provider,
      endpoint: sanitizeEndpoint(url),
      contentType: r.headers.get("content-type"),
      message: `Proxy returned app shell HTML from ${sanitizeEndpoint(proxyUrl)}`,
    });
  }

  return text;
}
