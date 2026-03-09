//src/services/snow/resortProviders/onthesnow.ts

import { RESORT_PROVIDER_IDS } from "../../../data/resorts";
import type { Resort } from "../../../data/resorts";
import { fetchTextViaProxy } from "../../http/fetchViaProxy";
export type OnTheSnowForecastDailyBin = {
  dateISO: string;
  inches: number;
  label: string;
};

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function atLocalNoon(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function addLocalDays(base: Date, days: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days,
    12,
    0,
    0,
    0,
  );
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeForecastLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\./g, "");
}

function labelToDateISO(
  label: string,
  days = 7,
  now = new Date(),
): string | null {
  const base = atLocalNoon(now);
  const normalized = normalizeForecastLabel(label);

  if (normalized === "today" || normalized === "tonight") {
    return toLocalISODate(base);
  }

  if (normalized === "tomorrow") {
    return toLocalISODate(addLocalDays(base, 1));
  }

  const short = normalized.slice(0, 3);
  const targetDow = DAY_NAME_TO_INDEX[short];
  if (targetDow == null) return null;

  for (let offset = 0; offset < days; offset += 1) {
    const d = addLocalDays(base, offset);
    if (d.getDay() === targetDow) {
      return toLocalISODate(d);
    }
  }

  return null;
}

function parseInches(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();

  if (/^\s*(trace|tr)\s*$/i.test(cleaned)) return 0;

  const rangeMatch = cleaned.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const high = Number(rangeMatch[2]);
    return Number.isFinite(high) ? high : null;
  }

  const numMatch = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return null;

  const n = Number(numMatch[0]);
  return Number.isFinite(n) ? n : null;
}

function maxByDate(
  bins: OnTheSnowForecastDailyBin[],
  days = 7,
  now = new Date(),
): OnTheSnowForecastDailyBin[] {
  const base = atLocalNoon(now);
  const allowed = new Set(
    Array.from({ length: days }, (_, i) =>
      toLocalISODate(addLocalDays(base, i)),
    ),
  );

  const map = new Map<string, OnTheSnowForecastDailyBin>();

  for (const bin of bins) {
    if (!allowed.has(bin.dateISO)) continue;
    const prev = map.get(bin.dateISO);
    if (!prev || bin.inches > prev.inches) {
      map.set(bin.dateISO, bin);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.dateISO.localeCompare(b.dateISO),
  );
}

type RecentSnowBucket = {
  label: string; // "Mon" | "Tue" | ... | "Sun" | "24h"
  inches: number;
};
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
  if (typeof x === "number" && Number.isFinite(x)) {
    // OnTheSnow __NEXT_DATA__ is inconsistent: some resorts emit metric numbers
    // for snowfall fields without a unit string. A very common artifact is values
    // like 5.08 (== 5.08 cm == 2.0 in) or 7.62 (== 3.0 in).
    //
    // We apply a tight heuristic:
    // - If value converts cleanly from cm -> inches (within tolerance),
    //   treat it as centimeters and convert.
    // - Otherwise, leave as inches.
    const inchesFromCm = x / 2.54;
    const nearestInt = Math.round(inchesFromCm);
    if (Math.abs(inchesFromCm - nearestInt) < 0.001) return nearestInt;
    return x;
  }

  if (typeof x !== "string") return null;

  const s = x.trim().toLowerCase();

  // Normalize trace / negligible snowfall to 0"
  // Common variants: "t", "trace", "tr"
  if (/^(t|tr|trace)$/.test(s)) return 0;

  const m = s.match(/(\d*\.\d+|\d+)/);
  if (!m) return null;

  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;

  // Unit-aware parsing:
  // If OnTheSnow emits metric units (cm/mm), convert to inches.
  // Examples: "5.08 cm" (== 2 in), "12.9 cm", "129 mm"
  if (/\bmm\b/.test(s)) return v / 25.4;
  if (/\bcm\b/.test(s)) return (v * 10) / 25.4;
  if (/\bm\b/.test(s) && !/\bmp\b/.test(s)) return (v * 1000) / 25.4;

  return v;
}

function parseRecentSnowfallDaily(html: string): Record<string, number> | null {
  // 1) Best source: structured data embedded in __NEXT_DATA__.
  const nextData = extractNextData(html);
  if (nextData) {
    const fromJson = extractRecentSnowDailyFromNextData(nextData);
    console.debug("[onthesnow recentDaily parser]", {
      stage: "nextData",
      found: fromJson,
      keys: fromJson ? Object.keys(fromJson) : [],
    });
    if (fromJson && Object.keys(fromJson).length > 0) {
      return fromJson;
    }
  }

  // 2) HTML fallback:
  const recentIdx = html.search(/Recent\s+Snowfall/i);
  if (recentIdx === -1) return null;

  const windowStart = Math.max(0, recentIdx - 1000);
  const windowEnd = Math.min(html.length, recentIdx + 25000);
  const sectionHtml = html.slice(windowStart, windowEnd);

  const flatText = decodeHtmlEntities(
    sectionHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<\/?(?:div|section|article|li|ul|ol|span|p|h\d|a|strong|em)\b[^>]*>/gi,
        " ",
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );

  const tokens =
    flatText.match(
      /\b(?:24h|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:r|rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|Trace|Tr|\d+(?:\.\d+)?)(?:"|in(?:ches?)?)?\b/gi,
    ) ?? [];

  const labels: string[] = [];
  const values: number[] = [];

  for (const token of tokens) {
    const trimmed = token.trim();

    if (/^24h$/i.test(trimmed)) {
      labels.push("24h");
      continue;
    }

    const weekday = normalizeWeekdayLabel(trimmed);
    if (weekday) {
      labels.push(weekday);
      continue;
    }

    const inches = parseSnowInchesToken(trimmed);
    if (inches != null) {
      values.push(inches);
    }
  }

  const pairCount = Math.min(labels.length, values.length);
  const result: Record<string, number> = {};

  for (let i = 0; i < pairCount; i += 1) {
    result[labels[i]] = values[i];
  }

  console.debug("[onthesnow recentDaily parser]", {
    stage: "htmlFallback",
    recentIdx,
    tokenCount: tokens.length,
    labels,
    values,
    result,
  });

  return Object.keys(result).length > 0 ? result : null;
}

function extractRecentSnowDailyFromNextData(
  root: unknown,
): Record<string, number> | null {
  const arrays: unknown[] = [];

  visitDeep(root, (value, path) => {
    if (!Array.isArray(value) || value.length === 0) return;

    const pathText = path.join(".").toLowerCase();

    // Bias toward arrays that are plausibly recent snow history.
    const pathLooksRelevant =
      /snow|snowfall/.test(pathText) &&
      /forecast|daily|chart|data|series/.test(pathText);

    if (!pathLooksRelevant) return;

    const normalized = normalizeRecentSnowArray(value);
    if (normalized && normalized.length > 0) {
      arrays.push(normalized);
    }
  });

  if (arrays.length === 0) return null;

  // Prefer candidates that look like 2-7 daily buckets.
  const ranked = arrays
    .map((arr) => arr as Array<{ day: string; inches: number }>)
    .sort((a, b) => {
      const aScore = candidateRecentSnowScore(a);
      const bScore = candidateRecentSnowScore(b);
      return bScore - aScore;
    });

  const best = ranked[0];
  if (!best || best.length === 0) return null;

  const out: Record<string, number> = {};
  for (const item of best) {
    out[item.day] = item.inches;
  }

  return Object.keys(out).length > 0 ? out : null;
}

function candidateRecentSnowScore(
  items: Array<{ day: string; inches: number }>,
): number {
  let score = 0;

  if (items.length >= 2 && items.length <= 7) score += 10;
  if (items.every((x) => WEEKDAY_SET.has(x.day))) score += 10;
  if (
    items.every(
      (x) => Number.isFinite(x.inches) && x.inches >= 0 && x.inches <= 100,
    )
  )
    score += 10;

  return score;
}

function normalizeRecentSnowArray(
  value: unknown,
): Array<{ day: string; inches: number }> | null {
  if (!Array.isArray(value)) return null;

  const out: Array<{ day: string; inches: number }> = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    // Require an explicit snow-related field.
    // Prevent generic chart arrays from being misinterpreted.
    const hasSnowField =
      "snow" in obj ||
      "snowfall" in obj ||
      "snowIn" in obj ||
      "snowfallIn" in obj;

    if (!hasSnowField) continue;

    const rawDay =
      firstString(
        obj.day,
        obj.dayLabel,
        obj.weekday,
        obj.weekDay,
        obj.label,
        obj.name,
        obj.x,
        obj.dateLabel,
      ) ?? null;

    const rawSnow =
      firstNumberish(
        obj.snow,
        obj.snowfall,
        obj.snowIn,
        obj.snowfallIn,
        obj.value,
        obj.y,
        obj.amount,
        obj.total,
      ) ?? null;

    const day = rawDay ? normalizeWeekdayLabel(rawDay) : null;
    const inches = rawSnow != null ? toInches(rawSnow) : null;

    if (day && inches != null) {
      out.push({ day, inches });
    }
  }

  return out.length > 0 ? out : null;
}

function visitDeep(
  value: unknown,
  fn: (value: unknown, path: string[]) => void,
  path: string[] = [],
  seen = new WeakSet<object>(),
): void {
  fn(value, path);

  if (!value || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      visitDeep(child, fn, [...path, String(index)], seen),
    );
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    visitDeep(child, fn, [...path, key], seen);
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumberish(...values: unknown[]): string | number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const WEEKDAY_SET = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function normalizeWeekdayLabel(input: string): string | null {
  const s = input.trim().toLowerCase();

  if (s.startsWith("mon")) return "Mon";
  if (s.startsWith("tue")) return "Tue";
  if (s.startsWith("wed")) return "Wed";
  if (s.startsWith("thu")) return "Thu";
  if (s.startsWith("fri")) return "Fri";
  if (s.startsWith("sat")) return "Sat";
  if (s.startsWith("sun")) return "Sun";

  return null;
}

function parseSnowInchesToken(input: string): number | null {
  const s = input.trim();

  if (/^(trace|tr|t)$/i.test(s)) return 0;

  const match = s.match(/(\d*\.\d+|\d+)/);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
/**
 * HTML scrape fallback.
 * Note: OnTheSnow often renders the "Recent Snowfall" chart with bars + hidden values,
 * so this frequently returns null now — but we keep it as a last-resort fallback.
 */
function parseLast48FromRecentSnowfall(html: string): number | null {
  const paired = parseRecentSnowfallDaily(html);
  if (!paired) return null;

  // Preserve parser encounter order rather than forcing Mon..Sun ordering.
  // parseRecentSnowfallDaily builds the object in insertion order.
  const dailyValues = Object.entries(paired)
    .filter(
      ([label, inches]) =>
        label !== "24h" &&
        WEEKDAY_SET.has(label) &&
        typeof inches === "number" &&
        Number.isFinite(inches),
    )
    .map(([, inches]) => inches);

  if (dailyValues.length >= 2) {
    const val =
      dailyValues[dailyValues.length - 2] + dailyValues[dailyValues.length - 1];
    return val > 30 ? null : val;
  }

  if (dailyValues.length === 1) {
    return dailyValues[0] > 30 ? null : dailyValues[0];
  }

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
  const fullResortSnow = pageProps?.fullResort?.snow;

  if (!pageProps) return null;

  const fullResortLast48 =
    fullResortSnow && typeof fullResortSnow === "object"
      ? toInches((fullResortSnow as any).last48)
      : null;

  if (fullResortLast48 != null) {
    return fullResortLast48 > 30 ? null : fullResortLast48;
  }

  return null;
}

function resolveOnTheSnowUrl(resort: Resort): string | null {
  const provider = RESORT_PROVIDER_IDS.find((p: any) => p.id === resort.id);

  return (
    provider?.onTheSnowUrl ??
    (provider?.onTheSnowSlug
      ? `https://www.onthesnow.com/new-hampshire/${provider.onTheSnowSlug}/skireport`
      : null)
  );
}

function extractForecastSnowDailyFromNextData(
  root: unknown,
  days = 7,
  now = new Date(),
): OnTheSnowForecastDailyBin[] {
  const forecast = (root as any)?.props?.pageProps?.fullResort?.forecast;
  if (Array.isArray(forecast) && forecast.length > 0) {
    const resortName = (root as any)?.props?.pageProps?.fullResort?.name ?? "";
    if (/loon/i.test(String(resortName))) {
      console.log(
        "[ots raw fullResort.forecast loon]",
        forecast
          .slice(0, 7)
          .map((x: any) => `${x?.date}:${JSON.stringify(x?.snow)}`)
          .join(", "),
      );
    }
  }

  if (!Array.isArray(forecast) || forecast.length === 0) {
    return [];
  }

  const bins: OnTheSnowForecastDailyBin[] = [];

  for (const item of forecast) {
    if (!item || typeof item !== "object") continue;

    const rawDate =
      typeof (item as any).date === "string" ? (item as any).date : null;
    const rawSnow = (item as any).snow;

    if (!rawDate) continue;

    const parsedDate = new Date(rawDate);
    const dateISO = Number.isNaN(parsedDate.getTime())
      ? null
      : toLocalISODate(parsedDate);

    const inches =
      typeof rawSnow === "number" && Number.isFinite(rawSnow)
        ? rawSnow / 2.54
        : rawSnow != null
        ? toInches(rawSnow)
        : null;

    if (!dateISO || inches == null) continue;

    bins.push({
      dateISO,
      inches: Math.round(inches * 10) / 10,
      label: "",
    });
  }

  return maxByDate(bins, days, now);
}

function parseForecastSnowDaily(
  html: string,
  days = 7,
): OnTheSnowForecastDailyBin[] {
  // 1) Best source: structured data in __NEXT_DATA__
  // console.log("[onthesnow forecast parser] entered", {
  //   htmlLen: html.length,
  //   hasNextData: /__NEXT_DATA__/.test(html),
  //   hasForecastedSnowText: /Forecasted\s+Snow/i.test(html),
  // });
  const nextData = extractNextData(html);

  // console.log("[onthesnow forecast parser] nextData check", {
  //   hasNextDataObject: Boolean(nextData),
  // });

  if (nextData) {
    // console.log("[onthesnow forecast parser] trying nextData path");
    const fromJson = extractForecastSnowDailyFromNextData(
      nextData,
      days,
      new Date(),
    );

    // // console.log("[onthesnow forecast parser] nextData result", {
    //   binCount: fromJson.length,
    //   bins: fromJson,
    // });

    if (fromJson.length > 0) {
      return fromJson;
    }
  }
  if (nextData) {
    const fromJson = extractForecastSnowDailyFromNextData(
      nextData,
      days,
      new Date(),
    );

    // console.debug("[onthesnow forecast parser]", {
    //   stage: "nextData",
    //   binCount: fromJson.length,
    //   bins: fromJson,
    // });

    if (fromJson.length > 0) {
      return fromJson;
    }
  }

  // 2) HTML fallback
  const forecastIdx = html.search(/Forecasted\s+Snow/i);
  if (forecastIdx === -1) return [];

  const windowStart = Math.max(0, forecastIdx - 1000);
  const windowEnd = Math.min(html.length, forecastIdx + 25000);
  const sectionHtml = html.slice(windowStart, windowEnd);

  const normalized = decodeHtmlEntities(
    sectionHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<\/?(?:div|section|article|li|ul|ol|span|p|h\d|a|strong|em)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim(),
  );

  const lines = normalized
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const bins: OnTheSnowForecastDailyBin[] = [];

  const pairPattern =
    /\b(today|tonight|tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[\s\S]{0,120}?\b(trace|tr|\d+(?:\.\d+)?)\s*(?:"|in(?:ches?)?)?/i;

  for (let i = 0; i < lines.length; i += 1) {
    const chunk = lines.slice(i, i + 4).join(" ");
    const match = chunk.match(pairPattern);
    if (!match) continue;

    const label = match[1];
    const inches = parseInches(match[2]);
    const dateISO = labelToDateISO(label, days);

    if (dateISO == null || inches == null) continue;

    bins.push({ dateISO, inches, label });
  }

  const deduped = maxByDate(bins, days);

  // console.debug("[onthesnow forecast parser]", {
  //   stage: "htmlFallback",
  //   forecastIdx,
  //   lineCount: lines.length,
  //   bins: deduped,
  // });

  return deduped;
}

export async function getOnTheSnowForecastDaily(
  resort: Resort,
  days = 7,
): Promise<OnTheSnowForecastDailyBin[]> {
  const url = resolveOnTheSnowUrl(resort);
  if (!url) return [];

  try {
    const html = await fetchTextViaProxy(url);
    // console.log("[onthesnow forecast] BEFORE parseForecastSnowDaily", {
    //   resortId: resort.id,
    //   resortName: resort.name,
    // });
    const bins = parseForecastSnowDaily(html, days);
    // console.log("[onthesnow forecast] AFTER parseForecastSnowDaily", {
    //   resortId: resort.id,
    //   resortName: resort.name,
    //   binCount: bins.length,
    // });

    // console.log("[ots forecast]", {
    //   resortId: resort.id,
    //   resortName: resort.name,
    //   bins,
    // });
    if (resort.id === "loon") {
      console.log(
        "[ots forecast loon]",
        bins.map((b) => `${b.dateISO}:${b.inches}`).join(", "),
      );
    }

    return bins;
  } catch {
    return [];
  }
}

export async function getOnTheSnowLast48(resort: Resort) {
  const provider = RESORT_PROVIDER_IDS.find((p: any) => p.id === resort.id);

  const url = resolveOnTheSnowUrl(resort);

  // if (isDebugOnTheSnow()) {
  //   console.log("[onthesnow] provider routing", {
  //     resortId: resort.id,
  //     resortName: resort.name,
  //     hasProvider: Boolean(provider),
  //     onTheSnowSlug: provider?.onTheSnowSlug ?? null,
  //     onTheSnowUrl: provider?.onTheSnowUrl ?? null,
  //     url,
  //   });
  // }

  if (!url) return null;

  const html = await fetchTextViaProxy(url);

  const recentDaily = parseRecentSnowfallDaily(html);

  // console.log("[onthesnow recentDaily]", {
  //   resortId: resort.id,
  //   resortName: resort.name,
  //   recentDaily,
  // });

  if (isDebugOnTheSnow() && resort.id === "loon") {
    console.log("[onthesnow][loon] fetched html summary", {
      resortId: resort.id,
      resortName: resort.name,
      url,
      htmlLen: html.length,
      title: html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null,
      hasNextData: /__NEXT_DATA__/.test(html),
      hasRecentSnowfall: /Recent Snowfall/i.test(html),
    });
  }

  // if (isDebugOnTheSnow()) {
  //   const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
  //   const hasNextData = /__NEXT_DATA__/.test(html);
  //   const hasLoonText = /Loon Mountain/i.test(html);
  //   const hasRecentSnowfall = /Recent Snowfall/i.test(html);

  //   // console.log("[onthesnow] fetched html summary", {
  //   //   resortId: resort.id,
  //   //   resortName: resort.name,
  //   //   url,
  //   //   htmlLen: html.length,
  //   //   title,
  //   //   hasNextData,
  //   //   hasLoonText,
  //   //   hasRecentSnowfall,
  //   // });
  // }

  // if (isDebugOnTheSnow()) {
  //   const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  //   console.log("[onthesnow] fetched page title:", title);
  //   console.log("[onthesnow] fetched html head:", html.slice(0, 250));

  //   const i = html.indexOf("Recent Snowfall");
  //   console.log("[onthesnow] RecentSnowfall idx", i);
  //   if (i >= 0)
  //     console.log(
  //       "[onthesnow] RecentSnowfall window head",
  //       html.slice(i, i + 400),
  //     );
  // }

  if (resort.id === "loon") {
    console.log("[loon recentDaily]", recentDaily);
  }
  const last48FromNext = parseLast48FromNextData(html);
  const last48FromHtml = parseLast48FromRecentSnowfall(html);

  // if (["wachusett", "mcintyre", "berkshireeast"].includes(resort.id)) {
  //   const next = extractNextData(html);
  //   const rawLast48 = next?.props?.pageProps?.fullResort?.snow?.last48;

  //   console.log("[onthesnow.verify]", {
  //     resortId: resort.id,
  //     resortName: resort.name,
  //     rawLast48,
  //     parsedRawLast48: toInches(rawLast48),
  //     last48FromNext,
  //     last48FromHtml,
  //   });
  // }

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
  // if (isDebugOnTheSnow() && resort.id === "loon") {
  //   console.log("[onthesnow][loon] parse results", {
  //     last48FromNext,
  //     last48FromHtml,
  //   });
  // }
  // if (isDebugOnTheSnow()) {
  //   console.log("[onthesnow] last48 chosen", {
  //     resortId: resort.id,
  //     provenance,
  //     last48FromNext,
  //     last48FromHtml,
  //     last48In,
  //     url,
  //   });
  // }

  const updatedAtISO = parseUpdatedISO(html); // may be null
  const updatedAt = updatedAtISO ?? new Date().toISOString(); // fallback only
  return { last48In, updatedAt, sourceUrl: url, recentDaily };
}

export const __test__ = {
  parseLast48FromRecentSnowfall,
  parseRecentSnowfallDaily,
  parseUpdated,
  parseSnowInchesToken,
  toInches,
};
