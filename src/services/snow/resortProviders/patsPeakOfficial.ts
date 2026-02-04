import { fetchTextViaProxy } from "../../http/fetchViaProxy";

const URL = "https://www.patspeak.com/the-mountain/mountain-info/snow-report/";

function parseInchesNearLabel(html: string, label: string): number | null {
  // Collapse whitespace so regex is easier
  const compact = html.replace(/\s+/g, " ");

  // Look for: "New snow in last 48 hours:" then some chars then N"
  // Capture N (int or decimal)
  const re = new RegExp(
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "[^0-9]{0,80}(\\d+(?:\\.\\d+)?)\\s*&quot;|" +
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      '[^0-9]{0,80}(\\d+(?:\\.\\d+)?)\\s*"',
    "i",
  );

  const m = compact.match(re);
  if (!m) return null;

  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) ? n : null;
}

function parseUpdatedAt(html: string): string {
  // If Pats Peak includes an "Updated" string, we can add a specific parser later.
  // For now, use fetch-time (still useful and consistent).
  return new Date().toLocaleString();
}

export async function getPatsPeakLast48Official() {
  const html = await fetchTextViaProxy(URL);

  const last48 =
    parseInchesNearLabel(html, "New snow in last 48 hours:") ??
    parseInchesNearLabel(html, "New snow in last 48 hours") ??
    null;

  return {
    last48In: last48,
    updatedAt: parseUpdatedAt(html),
    sourceUrl: URL,
  };
}
