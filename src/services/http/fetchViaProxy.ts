import { Capacitor } from "@capacitor/core";

// Put your real proxy host here (Cloudflare Worker / Render / whatever you’re using).
// Must be https.
const API_BASE_NATIVE = "https://YOUR_PROXY_HOSTNAME"; // TODO: set this

function apiFetchUrl(targetUrl: string) {
  const qs = `url=${encodeURIComponent(targetUrl)}`;

  // Native: must hit a real server; cannot hit capacitor://localhost
  if (Capacitor.isNativePlatform()) {
    return `${API_BASE_NATIVE}/api/fetch?${qs}`;
  }

  // Web: allow Vite proxy / same-origin
  return `/api/fetch?${qs}`;
}

const WORKER_BASE = "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev";

export async function fetchTextViaProxy(url: string): Promise<string> {
  const proxyUrl = Capacitor.isNativePlatform()
    ? `${WORKER_BASE}/api/fetch?url=${encodeURIComponent(url)}`
    : `/api/fetch?url=${encodeURIComponent(url)}`;

  const r = await fetch(proxyUrl);

  // ... keep your existing header debug logs ...

  if (!r.ok) throw new Error(`fetchViaProxy failed: ${r.status}`);

  const text = await r.text();

  // guard: never silently accept app shell HTML
  if (
    /<title>\s*Ionic App\s*<\/title>/i.test(text) ||
    /<base href=/i.test(text)
  ) {
    throw new Error(
      `Proxy returned app shell HTML (wrong proxy). proxyUrl=${proxyUrl}`,
    );
  }

  return text;
}
