import { RESORT_PROVIDER_IDS } from "../../../data/resorts";
import type { Resort } from "../../../data/resorts";
import { fetchTextViaProxy } from "../../http/fetchViaProxy";

/**
 * Robustly extract Next.js __NEXT_DATA__ JSON payload from HTML.
 * Handles:
 * - attribute order differences
 * - single/double quotes
 * - whitespace/newlines
 */
function extractNextData(html: string): any | null {
  const m = html.match(
    /<script[^>]*id=(["'])__NEXT_DATA__\1[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return null;

  const jsonText = m[2].trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.warn("[onthesnow] __NEXT_DATA__ JSON.parse failed", {
      len: jsonText.length,
      head: jsonText.slice(0, 120),
    });
    return null;
  }
}

/**
 * Extract numeric inches from a mixed structure.
 * Accepts numbers or strings like '3', '3.5', '3"', '3 in', '0'
 */
function toInches(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x !== "string") return null;

  const m = x.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function tryLast48FromNode(node: any, path: string): number | null {
  if (!node || typeof node !== "object") return null;

  // obvious children first
  const snowishChildren = [
    ["node.snow", node.snow],
    ["node.snowReport", node.snowReport],
    ["node.snowData", node.snowData],
    ["node.conditions.snow", node.conditions?.snow],
    ["node.report.snow", node.report?.snow],
    ["node.snowfall", node.snowfall],
  ] as Array<[string, any]>;

  const snowishChildrenPresent = snowishChildren.filter(
    (pair): pair is [string, any] => Boolean(pair[1]),
  );

  for (const [from, child] of snowishChildren) {
    const hit = extractLast48FromSnowObject(child);
    if (hit) {
      if (isDebugOnTheSnow()) {
        console.log("[onthesnow] last48 from preferred node", {
          path,
          from,
          key: hit.key,
          last48: hit.inches,
        });
      }
      return hit.inches;
    }
  }

  // shallow scan top-level snow-ish keys
  for (const [k, v] of Object.entries(node)) {
    if (!/snow/i.test(k)) continue;
    const hit = extractLast48FromSnowObject(v);
    if (hit) {
      if (isDebugOnTheSnow()) {
        console.log("[onthesnow] last48 from preferred node snowkey", {
          path,
          from: `node.${k}`,
          key: hit.key,
          last48: hit.inches,
        });
      }
      return hit.inches;
    }
  }

  return null;
}

function looksLikeSnowObject(x: any): x is Record<string, any> {
  if (!x || typeof x !== "object") return false;
  // "snow" objects commonly include some of these.
  const keys = Object.keys(x);
  return (
    keys.some((k) => /^last_?48(h)?$/i.test(k) || /^last_?24(h)?$/i.test(k)) ||
    keys.some((k) => /snowfall|recent|depth|base|surface/i.test(k))
  );
}

function extractLast48FromAnySnowishChild(node: any): number | null {
  if (!node || typeof node !== "object") return null;

  // 1) direct candidates we already know about
  const directCandidates = [
    node.snow,
    node.snowReport,
    node.snowData,
    node.report?.snow,
    node.conditions?.snow,
    node.snowfall,
    node.snowfallData,
    node.recentSnow,
    node.recent_snow,
  ].filter(Boolean);

  for (const c of directCandidates) {
    const hit = extractLast48FromSnowObject(c);
    if (hit) return hit.inches;
  }

  // 2) shallow scan: any key containing "snow"
  for (const [k, v] of Object.entries(node)) {
    if (!/snow/i.test(k)) continue;
    if (!v || typeof v !== "object") continue;

    const hit = extractLast48FromSnowObject(v);
    if (hit) return hit.inches;
  }

  return null;
}

function extractLast48FromSnowObject(
  snow: any,
): { inches: number; key: string } | null {
  if (!snow || typeof snow !== "object") return null;

  const candidates: Array<[string, any]> = [
    ["last48", snow.last48],
    ["last_48", snow.last_48],
    ["last48h", snow.last48h],
    ["last_48h", snow.last_48h],
    ["48h", snow["48h"]],
    ["lastTwoDays", snow.lastTwoDays],
  ];

  for (const [key, raw] of candidates) {
    const v = toInches(raw);
    if (v == null) continue;
    if (v > 30) return null;
    return { inches: v, key };
  }

  return null;
}

/**
 * Traverse an object tree and collect candidate nodes for a given resort uuid.
 * We intentionally key off uuid to avoid "nearbyResorts" mismatches.
 */
function collectNodesByResortUuid(
  root: any,
  resortUuid: string,
  maxNodes = 80000,
): Array<{ path: string; node: any }> {
  const out: Array<{ path: string; node: any }> = [];
  const seen = new Set<any>();
  const stack: Array<{ cur: any; path: string }> = [{ cur: root, path: "$" }];
  let n = 0;

  while (stack.length && n++ < maxNodes) {
    const { cur, path } = stack.pop()!;
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    // Match a resort-like node by uuid
    const uuid =
      (typeof (cur as any).uuid === "string" && (cur as any).uuid) ||
      (typeof (cur as any).UUID === "string" && (cur as any).UUID) ||
      null;

    if (uuid && uuid === resortUuid) out.push({ path, node: cur });

    if (!Array.isArray(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        if (v && typeof v === "object")
          stack.push({ cur: v, path: `${path}.${k}` });
      }
    } else {
      for (let i = 0; i < cur.length; i++) {
        const v = cur[i];
        if (v && typeof v === "object")
          stack.push({ cur: v, path: `${path}[${i}]` });
      }
    }
  }

  return out;
}

/**
 * As a *controlled* fallback, find the first matching key in the tree,
 * but return its path for logging + filtering.
 */
function findFirstKeyDeepWithPath(
  obj: any,
  keyMatchers: RegExp[],
  maxNodes = 80000,
): { path: string; key: string; value: any } | null {
  const seen = new Set<any>();
  const stack: Array<{ cur: any; path: string }> = [{ cur: obj, path: "$" }];
  let n = 0;

  while (stack.length && n++ < maxNodes) {
    const { cur, path } = stack.pop()!;
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (!Array.isArray(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        for (const re of keyMatchers) {
          if (re.test(k)) return { path, key: k, value: v };
        }
        if (v && typeof v === "object")
          stack.push({ cur: v, path: `${path}.${k}` });
      }
    } else {
      for (let i = 0; i < cur.length; i++) {
        const v = cur[i];
        if (v && typeof v === "object")
          stack.push({ cur: v, path: `${path}[${i}]` });
      }
    }
  }

  return null;
}

/**
 * HTML scrape fallback.
 * Note: OnTheSnow often renders the "Recent Snowfall" chart with bars + hidden values,
 * so this frequently returns null now — but we keep it as a last-resort fallback.
 */
function parseLast48FromRecentSnowfall(html: string): number | null {
  const idx = html.indexOf("Recent Snowfall");
  if (idx < 0) return null;

  // Only inspect a limited window after the header
  const window = html.slice(idx, idx + 80000);

  // Stop before common bleed zones
  const stopMarkers = [
    "Base Depth",
    "Snow Depth",
    "Season Total",
    "Open Trails",
    "Open Lifts",
    "Surface Conditions",
  ];

  let end = window.length;
  for (const m of stopMarkers) {
    const j = window.indexOf(m);
    if (j >= 0 && j < end) end = j;
  }

  const recentOnly = window.slice(0, end);

  const cleaned = recentOnly
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/\b\d+(?:\.\d+)?%/g, "");

  const matches = [
    ...cleaned.matchAll(
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|24h)\b[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*(?:"|(?:&nbsp;)?in\b|inches\b)/gi,
    ),
  ];

  const pairs = matches
    .map((m) => ({ label: m[1], inches: Number(m[2]) }))
    .filter((p) => Number.isFinite(p.inches));

  if (pairs.length === 0) return null;

  // Prefer 24h + previous day
  const idx24 = pairs.findLastIndex((p) => p.label === "24h");
  if (idx24 >= 1) {
    const val = pairs[idx24 - 1].inches + pairs[idx24].inches;
    return val > 30 ? null : val;
  }

  // Else sum last two weekday values
  const dayVals = pairs.filter((p) => p.label !== "24h").map((p) => p.inches);
  if (dayVals.length >= 2) {
    const val = dayVals[dayVals.length - 1] + dayVals[dayVals.length - 2];
    return val > 30 ? null : val;
  }

  if (dayVals.length === 1) return dayVals[0];

  return null;
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}
function parseUpdatedISO(html: string): string {
  // If you can’t extract a real ISO timestamp, use "now" as fetch time.
  // Put the human string into provenance so you can show it in a tooltip if desired.
  return new Date().toISOString();
}
function parseUpdatedHuman(html: string): string | null {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : null;
}

function isDebugOnTheSnow() {
  try {
    return localStorage.getItem("srs_debug_onthesnow") === "1";
  } catch {
    return false;
  }
}

/**
 * Primary parse path:
 * Use __NEXT_DATA__ and bind to the page's resort.uuid so we read the correct resort,
 * even if the resort object is nested under nearbyResorts[0].
 */
/**
 * Primary parse path:
 * Use __NEXT_DATA__ and read snow from pageProps.fullResort (the rich object).
 * Avoid walking the whole tree (nearbyResorts frequently causes false matches).
 */
function parseLast48FromNextData(html: string): number | null {
  const next = extractNextData(html);

  const pageProps = next?.props?.pageProps;
  if (!pageProps || pageProps.route !== "skireport") return null;
  // 0) Best-known primary path (seen in logs): pageProps.fullResort.snow.last48
  const fullResortSnow = pageProps?.fullResort?.snow;
  if (isDebugOnTheSnow()) {
    console.log(
      "[onthesnow] fullResort.snow keys",
      fullResortSnow && typeof fullResortSnow === "object"
        ? Object.keys(fullResortSnow).slice(0, 25)
        : null,
    );
    console.log(
      "[onthesnow] fullResort.snow.last48 raw",
      fullResortSnow?.last48,
    );
  }

  const fullResortLast48 = toInches(fullResortSnow?.last48);
  if (fullResortLast48 != null)
    return fullResortLast48 > 30 ? null : fullResortLast48;

  // ✅ Fast path: correct resort snow lives here
  const snow = pageProps.fullResort?.snow;
  const last48 = toInches(snow?.last48);
  if (last48 != null) return last48 > 30 ? null : last48;

  // ✅ Primary resort object should be fullResort (it has snow)
  const primaryResort = pageProps.fullResort ?? pageProps.resort ?? null;
  if (isDebugOnTheSnow()) {
    console.log(
      "[onthesnow] fullResort.snow type",
      typeof pageProps.fullResort?.snow,
    );

    const snowKeys =
      pageProps.fullResort?.snow &&
      typeof pageProps.fullResort.snow === "object"
        ? Object.keys(pageProps.fullResort.snow).slice(0, 60)
        : null;

    console.log("[onthesnow] fullResort.snow keys", snowKeys);

    // Optional: show a shallow preview without dumping huge nested objects
    if (snowKeys) {
      const preview: any = {};
      for (const k of snowKeys)
        preview[k] = (pageProps.fullResort.snow as any)[k];
      console.log("[onthesnow] fullResort.snow preview", preview);
    }
  }

  if (isDebugOnTheSnow()) {
    const keys = (o: any) =>
      o && typeof o === "object" ? Object.keys(o).slice(0, 40) : null;
    const snowish = (o: any) =>
      o && typeof o === "object"
        ? Object.keys(o)
            .filter((k) => /snow/i.test(k))
            .slice(0, 40)
        : null;

    console.log("[onthesnow] pageProps", {
      route: pageProps?.route,
      type: pageProps?.type,
      resortUuid: primaryResort?.uuid,
      resortTitle: primaryResort?.title,
    });
    console.log("[onthesnow] resort keys", keys(pageProps.resort));
    console.log("[onthesnow] fullResort keys", keys(pageProps.fullResort));
    console.log("[onthesnow] resort snowish keys", snowish(pageProps.resort));
    console.log(
      "[onthesnow] fullResort snowish keys",
      snowish(pageProps.fullResort),
    );
  }

  // 1) Direct: fullResort.snow
  const snowObj =
    (primaryResort &&
      typeof primaryResort === "object" &&
      (primaryResort as any).snow) ||
    null;

  const hit = extractLast48FromSnowObject(snowObj); // { inches, key } | null
  if (hit) {
    if (isDebugOnTheSnow()) {
      console.log("[onthesnow] last48 from fullResort.snow", {
        key: hit.key,
        last48: hit.inches,
      });
    }
    return hit.inches;
  }

  // 2) Controlled fallback: look for last48-ish fields, but IGNORE nearbyResorts
  const directFound = findFirstKeyDeepWithPath(
    pageProps.fullResort ?? pageProps,
    [/^last48/i, /^last_?48/i, /48h/i, /lastTwoDays/i],
  );

  if (isDebugOnTheSnow()) console.log("[onthesnow] directFound", directFound);

  if (directFound && /nearbyResorts/i.test(directFound.path)) {
    if (isDebugOnTheSnow()) {
      console.log(
        "[onthesnow] ignoring nearbyResorts direct match",
        directFound,
      );
    }
    return null;
  }

  const directIn = toInches(directFound?.value);
  if (directIn != null) return directIn > 30 ? null : directIn;

  return null;
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

    const i = html.indexOf("Recent Snowfall");
    console.log("[onthesnow] RecentSnowfall idx", i);
    if (i >= 0)
      console.log(
        "[onthesnow] RecentSnowfall window head",
        html.slice(i, i + 400),
      );
  }

  const last48FromNext = parseLast48FromNextData(html);
  const last48FromHtml = parseLast48FromRecentSnowfall(html);

  let provenance: string;
  let last48In: number | null;

  if (typeof last48FromNext === "number" && Number.isFinite(last48FromNext)) {
    last48In = last48FromNext;
    provenance = "nextdata";
  } else if (
    typeof last48FromHtml === "number" &&
    Number.isFinite(last48FromHtml)
  ) {
    last48In = last48FromHtml;
    provenance = "html";
  } else {
    last48In = null;
    provenance = "none";
  }

  if (isDebugOnTheSnow()) {
    console.log("[onthesnow] last48 chosen", {
      resortId: resort.id,
      provenance,
      last48FromNext,
      last48FromHtml,
      last48In,
      url,
    });
  }

  const updatedAt = new Date().toISOString(); // ✅ stable

  return { last48In, updatedAt, sourceUrl: url };
}

export const __test__ = {
  parseLast48FromRecentSnowfall,
  parseUpdated,
};
