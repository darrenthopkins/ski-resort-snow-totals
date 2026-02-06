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

  const matches = [
    ...recentBlock.matchAll(
      /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|24h)\b)[\s\S]{0,120}?(\d+(?:\.\d+)?)"/g,
    ),
  ];

  // Persistent debug flag (survives reload):
  //   localStorage.setItem("srs_debug_onthesnow", "1")
  const debugOn =
    (globalThis as any).__SRS_DEBUG_ONTHESNOW__ === true ||
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("srs_debug_onthesnow") === "1");

  if (debugOn) {
    const tail = matches.slice(-12).map((m) => ({ label: m[1], inches: m[2] }));

    console.log("[onthesnow] recent snowfall matches (tail)", tail);
  }

  if (matches.length === 0) return null;

  const dayVals = matches
    .filter((m) => m[1] !== "24h")
    .map((m) => Number(m[2]))
    .filter((n) => Number.isFinite(n));

  if (dayVals.length >= 2) {
    return dayVals[dayVals.length - 1] + dayVals[dayVals.length - 2];
  }

  const anyVals = matches
    .map((m) => Number(m[2]))
    .filter((n) => Number.isFinite(n));

  if (anyVals.length >= 2)
    return anyVals[anyVals.length - 1] + anyVals[anyVals.length - 2];
  if (anyVals.length === 1) return anyVals[0];

  return null;
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}

export async function getOnTheSnowLast48(resort: Resort) {
  const slug = RESORT_PROVIDER_IDS.find(
    (p: { id: string; onthesnow?: string }) => p.id === resort.id,
  )?.onthesnow;
  if (!slug) return null;

  const url = `https://www.onthesnow.com/new-hampshire/${slug}/skireport`;
  const html = await fetchTextViaProxy(url);

  return {
    last48In: null, // temporarily disabled – OnTheSnow markup unreliable
    updatedAt: parseUpdated(html),
    sourceUrl: url,
  };
}
