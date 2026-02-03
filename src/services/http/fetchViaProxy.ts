export async function fetchTextViaProxy(url: string): Promise<string> {
  const r = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
  if (!r.ok) {
    throw new Error(`fetchViaProxy failed: ${r.status}`);
  }
  return await r.text();
}
