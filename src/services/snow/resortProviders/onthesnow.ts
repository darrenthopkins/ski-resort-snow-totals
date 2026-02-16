import { RESORT_PROVIDER_IDS } from "../../../data/resorts";
import type { Resort } from "../../../data/resorts";
import { fetchTextViaProxy } from "../../http/fetchViaProxy";

function dbg(...args: any[]) {
  if (isDebugOnTheSnow()) console.log(...args);
}

function between(h: string, a: string, b: string): string | null {
  const i = h.indexOf(a);
  if (i < 0) return null;
  const j = h.indexOf(b, i + a.length);
  if (j < 0) return null;
  return h.slice(i, j);
}

function parseLast48FromRecentSnowfall(html: string): number | null {
  const sectionMd = between(html, "### Recent Snowfall", "### Forecasted Snow");
  const section =
    sectionMd ?? between(html, "Recent Snowfall", "Forecasted Snow");

  if (!section) {
    dbg("[onthesnow] section NOT found");
    return null;
  }

  const recentBlock =
    sectionMd != null
      ? section
      : (between(section, "Recent Snowfall", "Base Depth") ??
        between(section, "Recent Snowfall", "Base") ??
        between(section, "Recent Snowfall", "Snow Conditions") ??
        between(section, "Recent Snowfall", "Lifts Open") ??
        between(section, "Recent Snowfall", "Trails Open") ??
        between(section, "Recent Snowfall", "Forecast") ??
        between(section, "Recent Snowfall", "Weather") ??
        null);

  if (!recentBlock) return null;

  if (!recentBlock) {
    dbg(
      "[onthesnow] recentBlock NOT isolated; refusing to parse to avoid base bleed",
    );
    return null;
  }

  dbg("[onthesnow] recentBlock head:", recentBlock.slice(0, 300));
  dbg('[onthesnow] recentBlock contains 29" ?', recentBlock.includes('29"'));

  const matches = [
    ...recentBlock.matchAll(
      /(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|24h|48h)\b)[\s\S]{0,120}?(\d+(?:\.\d+)?)"/g,
    ),
  ];

  dbg(
    "[onthesnow] label matches:",
    matches.map((m) => [m[1], m[2]]).slice(0, 12),
  );

  const pairs = matches
    .map((m) => ({ label: m[1], inches: Number(m[2]) }))
    .filter((p) => Number.isFinite(p.inches));

  if (pairs.length === 0) return null;

  const idx48 = pairs.findLastIndex((p) => p.label === "48h");
  if (idx48 >= 0) return pairs[idx48].inches;

  const idx24 = pairs.findLastIndex((p) => p.label === "24h");
  if (idx24 >= 1) return pairs[idx24 - 1].inches + pairs[idx24].inches;

  const dayVals = pairs.filter((p) => p.label !== "24h").map((p) => p.inches);
  if (dayVals.length >= 2)
    return dayVals[dayVals.length - 1] + dayVals[dayVals.length - 2];
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
  const provider = RESORT_PROVIDER_IDS.find((p: any) => p.id === resort.id);

  if (!provider) return null;

  const url =
    provider.onTheSnowUrl ??
    (provider.onTheSnowSlug
      ? `https://www.onthesnow.com/new-hampshire/${provider.onTheSnowSlug}/skireport`
      : null);

  if (!url) return null;

  const html = await fetchTextViaProxy(url);

  if (isDebugOnTheSnow()) {
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    console.log("[onthesnow] fetched page title:", title);
    console.log("[onthesnow] fetched html head:", html.slice(0, 250));
  }

  const last48In = parseLast48FromRecentSnowfall(html);
  const updatedAt = parseUpdated(html);

  if (isDebugOnTheSnow()) {
    const hasRecent =
      html.includes("### Recent Snowfall") || html.includes("Recent Snowfall");

    console.log("[onthesnow]", {
      resortId: resort.id,
      url,
      hasRecent,
      last48In,
      updatedAt,
    });

    const title =
      html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? "NO TITLE";
    const is404Page = /page not found/i.test(title);
    if (isDebugOnTheSnow()) {
      console.log("[onthesnow] fetch", { resortId: resort.id, url, is404Page });
    }

    if (last48In == null) {
      console.warn("[onthesnow] parse returned null; markup may have changed", {
        resortId: resort.id,
        url,
      });
    }
  }

  return { last48In, updatedAt, sourceUrl: url };
}

export const __test__ = {
  parseLast48FromRecentSnowfall,
  parseUpdated,
};
