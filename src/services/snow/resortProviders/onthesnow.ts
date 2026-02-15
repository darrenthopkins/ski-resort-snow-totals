import { RESORT_PROVIDER_IDS } from "../../../data/resorts";
import type { Resort } from "../../../data/resorts";
import { fetchTextViaProxy } from "../../http/fetchViaProxy";

function between(h: string, a: string, b: string): string | null {
  const i = h.indexOf(a);
  if (i < 0) return null;
  const j = h.indexOf(b, i + a.length);
  if (j < 0) return null;
  return h.slice(i, j);
}

function parseLast48FromRecentSnowfall(html: string): number | null {
  const section =
    between(html, "### Recent Snowfall", "### Forecasted Snow") ??
    between(html, "Recent Snowfall", "Forecasted Snow");

  if (!section) return null;

  const recentBlock =
    between(section, "Recent Snowfall", "Base") ??
    between(section, "Recent Snowfall", "Summit") ??
    section;

  // Capture ordered pairs like: Mon ... 3"  OR  24h ... 0.1"
  const pairs = [
    ...recentBlock.matchAll(
      /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|24h)\b)[\s\S]{0,120}?(\d+(?:\.\d+)?)"/g,
    ),
  ]
    .map((m) => ({ label: m[1], inches: Number(m[2]) }))
    .filter((p) => Number.isFinite(p.inches));

  if (pairs.length === 0) return null;

  // 1) Prefer "24h + previous day" (best approximation of last 48 hours)
  const idx24 = pairs.findLastIndex((p) => p.label === "24h");
  if (idx24 >= 1) {
    const prev = pairs[idx24 - 1];
    const cur = pairs[idx24];
    // prev should be a weekday label, but we won't hard-fail if it's not
    return prev.inches + cur.inches;
  }

  // 2) Otherwise: sum the last two non-24h day values
  const dayVals = pairs.filter((p) => p.label !== "24h").map((p) => p.inches);
  if (dayVals.length >= 2) {
    return dayVals[dayVals.length - 1] + dayVals[dayVals.length - 2];
  }

  // 3) If only one value exists, return it (still numeric, but not “48h”)
  // If you want stricter behavior, change this to `return null`.
  if (dayVals.length === 1) return dayVals[0];

  return null;
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}

function isDebugOnTheSnow() {
  try {
    return localStorage.getItem("srs_debug_onthesnow") === "1";
  } catch {
    return false;
  }
}

export async function getOnTheSnowLast48(resort: Resort) {
  const slug = RESORT_PROVIDER_IDS.find(
    (p: { id: string; onthesnow?: string }) => p.id === resort.id,
  )?.onthesnow;
  if (!slug) return null;

  const url = `https://www.onthesnow.com/new-hampshire/${slug}/skireport`;
  const html = await fetchTextViaProxy(url);

  const last48In = parseLast48FromRecentSnowfall(html);
  const updatedAt = parseUpdated(html);

  if (isDebugOnTheSnow()) {
    const hasRecent =
      html.includes("### Recent Snowfall") || html.includes("Recent Snowfall");
    console.log("[onthesnow]", {
      resortId: resort.id,
      slug,
      url,
      hasRecent,
      last48In,
      updatedAt,
    });
    if (last48In == null) {
      console.warn("[onthesnow] parse returned null; markup may have changed", {
        resortId: resort.id,
        slug,
      });
    }
  }

  return { last48In, updatedAt, sourceUrl: url };
}

export const __test__ = {
  parseLast48FromRecentSnowfall,
  parseUpdated,
};
