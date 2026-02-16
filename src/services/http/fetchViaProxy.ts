export async function fetchTextViaProxy(url: string): Promise<string> {
  const r = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);

  // 🔎 TEMP DEBUG (safe, read-only)
  const upstreamStatus = r.headers.get("x-proxy-upstream-status");
  const finalUrl = r.headers.get("x-proxy-final-url");
  const contentType = r.headers.get("x-proxy-content-type");
  const redirectChain = r.headers.get("x-proxy-redirect-chain");

  console.log("[fetchViaProxy]", {
    requestedUrl: url,
    httpStatus: r.status,
    upstreamStatus,
    finalUrl,
    contentType,
    redirectChain,
  });

  if (!r.ok) {
    throw new Error(`fetchViaProxy failed: ${r.status}`);
  }

  return await r.text();
}
