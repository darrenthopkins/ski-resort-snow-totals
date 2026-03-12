import { Capacitor } from "@capacitor/core";

const WORKER_BASE = "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev";

export async function fetchTextViaProxy(url: string): Promise<string> {
  const proxyUrl = Capacitor.isNativePlatform()
    ? `${WORKER_BASE}/api/fetch?url=${encodeURIComponent(url)}`
    : `/api/fetch?url=${encodeURIComponent(url)}`;

  const r = await fetch(proxyUrl);

  if (!r.ok) {
    throw new Error(`fetchViaProxy failed: ${r.status}`);
  }

  const text = await r.text();

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
