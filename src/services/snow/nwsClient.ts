import type { Resort } from "../../data/resorts";
import { Capacitor } from "@capacitor/core";

type NwsPointsResponse = {
  properties: {
    forecastGridData: string; // URL
    forecast: string; // URL (JSON forecast with periods)
  };
};

type NwsForecastResponse = {
  properties: {
    updated?: string; // ISO
    periods: Array<{
      startTime: string; // ISO
      endTime: string; // ISO
      temperature: number; // F (per NWS API default)
      windSpeed: string; // e.g. "5 to 10 mph" / "15 mph"
    }>;
  };
};

type NwsGridResponse = {
  properties: {
    updateTime?: string; // ISO
    snowfallAmount?: {
      uom?: string;
      values: Array<{ validTime: string; value: number | null }>;
    };
  };
};

// validTime looks like: 2019-07-04T18:00:00+00:00/PT3H
function parseValidTimeInterval(
  validTime: string,
): { start: Date; end: Date } | null {
  const [startStr, durStr] = validTime.split("/");
  if (!startStr || !durStr) return null;

  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;

  // minimal ISO8601 duration parser for PT#H / PT#M / PT#S
  // Examples: PT1H, PT3H, PT30M, PT1H30M
  const m = durStr.match(/^P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/);
  if (!m) return null;

  const hours = m[2] ? Number(m[2]) : 0;
  const mins = m[3] ? Number(m[3]) : 0;
  const secs = m[4] ? Number(m[4]) : 0;

  const ms = ((hours * 60 + mins) * 60 + secs) * 1000;
  const end = new Date(start.getTime() + ms);
  return { start, end };
}

function inchesFromUom(value: number, uom?: string): number {
  // NWS grid layers provide a uom (unit of measure). Commonly wmoUnit:mm / cm / m.
  // We’ll handle those three; otherwise assume it's already inches.
  if (!uom) return value;

  const u = uom.toLowerCase();
  if (
    u.includes("wmoUnit:mm") ||
    u.endsWith(":mm") ||
    u.endsWith("/mm") ||
    u.endsWith("mm")
  ) {
    return value / 25.4;
  }
  if (
    u.includes("wmoUnit:cm") ||
    u.endsWith(":cm") ||
    u.endsWith("/cm") ||
    u.endsWith("cm")
  ) {
    return (value * 10) / 25.4;
  }
  if (
    u.includes("wmoUnit:m") ||
    u.endsWith(":m") ||
    u.endsWith("/m") ||
    u.endsWith(" m")
  ) {
    return (value * 1000) / 25.4;
  }
  return value;
}

function overlapFraction(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end <= start) return 0;
  return (end - start) / (aEnd.getTime() - aStart.getTime());
}

function parseWindSpeedMph(windSpeed: string): number | null {
  // Examples: "5 to 10 mph", "15 mph", "10 to 20 mph", "Calm"
  const s = (windSpeed || "").toLowerCase();
  if (!s || s.includes("calm")) return 0;

  // Pull all integers; choose the max
  const nums =
    s
      .match(/\d+/g)
      ?.map((n) => Number(n))
      .filter((n) => !Number.isNaN(n)) ?? [];
  if (!nums.length) return null;
  return Math.max(...nums);
}

function overlapMillis(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}

const WORKER_BASE = "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev";
function proxied(url: string) {
  return Capacitor.isNativePlatform()
    ? `${WORKER_BASE}/api/fetch?url=${encodeURIComponent(url)}`
    : `/api/fetch?url=${encodeURIComponent(url)}`;
}

async function fetchNwsJson<T>(url: string): Promise<T> {
  const resp = await fetch(proxied(url), {
    headers: { Accept: "application/geo+json" },
  });
  console.log("[nws.fetch]", { url, proxied: proxied(url) });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `NWS ${resp.status} ${resp.statusText} for ${url} :: ${body.slice(0, 200)}`,
    );
  }
  console.log("[nws.fetch.resp]", { url, status: resp.status });
  return (await resp.json()) as T;
}
function fmtLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}

export async function getWeekSnowDaily(
  resort: Resort,
  days = 7,
): Promise<{
  daily: Array<{ dateISO: string; inches: number | null }>;
  updatedAt: string;
  sourceUrl: string;
}> {
  const pointsUrl = `https://api.weather.gov/points/${resort.lat},${resort.lon}`;
  const pointsJson = await fetchNwsJson<NwsPointsResponse>(pointsUrl);
  const gridUrl = pointsJson.properties.forecastGridData;
  if (!gridUrl)
    throw new Error(`NWS points missing forecastGridData for ${resort.name}`);

  const gridJson = await fetchNwsJson<NwsGridResponse>(gridUrl);
  const layer = gridJson?.properties?.snowfallAmount;
  const values = layer?.values ?? [];
  const uom = layer?.uom;

  const now = new Date();
  const day0 = startOfLocalDay(now);

  // build day buckets [start,end)
  const buckets = Array.from({ length: days }, (_, i) => {
    const start = addDaysLocal(day0, i);
    const end = addDaysLocal(day0, i + 1);
    return {
      dateISO: fmtLocalDateISO(start),
      start,
      end,
      total: 0,
      any: false,
    };
  });

  for (const v of values) {
    if (v.value == null) continue;
    const iv = parseValidTimeInterval(v.validTime);
    if (!iv) continue;

    const intervalMs = iv.end.getTime() - iv.start.getTime();
    if (intervalMs <= 0) continue;

    const inchesTotal = inchesFromUom(v.value, uom);

    for (const b of buckets) {
      const ms = overlapMs(iv.start, iv.end, b.start, b.end);
      if (ms <= 0) continue;

      b.total += inchesTotal * (ms / intervalMs);
      b.any = true;
    }
  }

  const updatedAtISO = gridJson?.properties?.updateTime;
  const updatedAt = updatedAtISO
    ? new Date(updatedAtISO).toLocaleString()
    : "NWS";

  return {
    daily: buckets.map((b) => ({
      dateISO: b.dateISO,
      inches: b.any ? Math.round(b.total * 10) / 10 : null,
    })),
    updatedAt,
    sourceUrl: gridUrl,
  };
}

export async function getNext24SnowInches(resort: Resort): Promise<{
  next24In: number | null;
  minTempF: number | null;
  maxTempF: number | null;
  maxWindMph: number | null;
  updatedAt: string;
  sourceUrl: string;
}> {
  // 1) Convert lat/lon -> URLs via /points
  const pointsUrl = `https://api.weather.gov/points/${resort.lat},${resort.lon}`;
  const pointsJson = await fetchNwsJson<NwsPointsResponse>(pointsUrl);

  const gridUrl = pointsJson.properties.forecastGridData;
  const forecastUrl = pointsJson.properties.forecast;

  if (!gridUrl) {
    throw new Error(`NWS points missing forecastGridData for ${resort.name}`);
  }
  if (!forecastUrl) {
    throw new Error(`NWS points missing forecast URL for ${resort.name}`);
  }

  // Time window: now -> now+24h
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 2) Fetch grid data (snowfallAmount)
  const gridJson = await fetchNwsJson<NwsGridResponse>(gridUrl);

  const layer = gridJson?.properties?.snowfallAmount;
  const values = layer?.values ?? [];
  const uom = layer?.uom;

  let totalIn = 0;
  let anySnow = false;

  for (const v of values) {
    if (v.value == null) continue;
    const iv = parseValidTimeInterval(v.validTime);
    if (!iv) continue;

    const frac = overlapFraction(iv.start, iv.end, now, end);
    if (frac <= 0) continue;

    const inches = inchesFromUom(v.value, uom) * frac;
    totalIn += inches;
    anySnow = true;
  }

  // 3) Fetch forecast periods (temp + wind)
  const fcJson = await fetchNwsJson<NwsForecastResponse>(forecastUrl);

  const periods = fcJson?.properties?.periods ?? [];

  let minTempF: number | null = null;
  let maxTempF: number | null = null;
  let maxWindMph: number | null = null;

  for (const p of periods) {
    const ps = new Date(p.startTime);
    const pe = new Date(p.endTime);
    if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) continue;

    // only consider periods that overlap now..end
    if (overlapMillis(ps, pe, now, end) <= 0) continue;

    const t = p.temperature;
    if (typeof t === "number" && !Number.isNaN(t)) {
      minTempF = minTempF == null ? t : Math.min(minTempF, t);
      maxTempF = maxTempF == null ? t : Math.max(maxTempF, t);
    }

    const w = parseWindSpeedMph(p.windSpeed);
    if (w != null) {
      maxWindMph = maxWindMph == null ? w : Math.max(maxWindMph, w);
    }
  }

  // 4) updatedAt + sourceUrl
  const forecastUpdated = fcJson?.properties?.updated;
  const updatedAtISO = forecastUpdated ?? gridJson?.properties?.updateTime;
  const updatedAt = updatedAtISO ?? new Date().toISOString();

  return {
    next24In: anySnow ? Math.round(totalIn * 10) / 10 : null,
    minTempF,
    maxTempF,
    maxWindMph,
    updatedAt,
    sourceUrl: gridUrl, // you can also include forecastUrl elsewhere if desired
  };
}

// ------------------------------------------------------------
// Week weather bins (per-day) from NWS forecast periods
// ------------------------------------------------------------

type WeekWeatherDailyRow = {
  dateISO: string;
  minTempF: number | null;
  maxTempF: number | null;
  maxWindMph: number | null;
};

type WeekWeatherDailyResult = {
  daily: WeekWeatherDailyRow[];
  updatedAt: string;
  sourceUrl: string;
};

export async function getWeekWeatherDaily(
  resort: { id: string; name: string; lat?: number; lon?: number },
  days: number,
): Promise<WeekWeatherDailyResult | null> {
  try {
    // Use NWS /points to get forecast URL (keeps logic self-contained)
    if (resort.lat == null || resort.lon == null) return null;

    const pointsUrl = `https://api.weather.gov/points/${resort.lat},${resort.lon}`;
    const pointsJson = await fetchNwsJson<NwsPointsResponse>(pointsUrl);

    const forecastUrl = pointsJson?.properties?.forecast;
    if (!forecastUrl) return null;

    const forecastJson = await fetchNwsJson<NwsForecastResponse>(forecastUrl);
    const periods = forecastJson?.properties?.periods;
    if (!Array.isArray(periods) || periods.length === 0) return null;

    const toISODateLocalFromStart = (startTime: string): string | null => {
      const dt = new Date(startTime);
      if (Number.isNaN(dt.getTime())) return null;
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const parseWindMaxMph = (windSpeed: any): number | null => {
      if (typeof windSpeed === "number" && Number.isFinite(windSpeed))
        return windSpeed;
      if (typeof windSpeed !== "string") return null;

      // "5 to 10 mph" / "10 mph" / "15 to 25 mph"
      const nums = [...windSpeed.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      const finite = nums.filter((n) => Number.isFinite(n));
      if (finite.length === 0) return null;
      return Math.max(...finite);
    };

    const byDate: Record<string, { temps: number[]; winds: number[] }> = {};

    for (const p of periods) {
      const dateISO = toISODateLocalFromStart(
        String((p as any)?.startTime ?? ""),
      );
      if (!dateISO) continue;

      const t = Number((p as any)?.temperature);
      const w = parseWindMaxMph((p as any)?.windSpeed);

      if (!byDate[dateISO]) byDate[dateISO] = { temps: [], winds: [] };
      if (Number.isFinite(t)) byDate[dateISO].temps.push(t);
      if (w != null && Number.isFinite(w)) byDate[dateISO].winds.push(w);
    }

    const dateISOs = Object.keys(byDate).sort().slice(0, days);

    const daily: WeekWeatherDailyRow[] = dateISOs.map((dateISO) => {
      const temps = byDate[dateISO]?.temps ?? [];
      const winds = byDate[dateISO]?.winds ?? [];
      return {
        dateISO,
        minTempF: temps.length ? Math.min(...temps) : null,
        maxTempF: temps.length ? Math.max(...temps) : null,
        maxWindMph: winds.length ? Math.max(...winds) : null,
      };
    });

    const updatedAt =
      (forecastJson as any)?.properties?.updated ?? new Date().toISOString();

    return { daily, updatedAt, sourceUrl: forecastUrl };
  } catch {
    return null;
  }
}
