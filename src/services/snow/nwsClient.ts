import type { Resort } from "../../data/resorts";

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
  const pointsResp = await fetch(pointsUrl, {
    headers: { Accept: "application/geo+json" },
  });
  if (!pointsResp.ok) {
    throw new Error(
      `NWS points failed ${pointsResp.status} for ${resort.name}`,
    );
  }
  const pointsJson = (await pointsResp.json()) as NwsPointsResponse;
  const gridUrl = pointsJson?.properties?.forecastGridData;
  const forecastUrl = pointsJson?.properties?.forecast;

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
  const gridResp = await fetch(gridUrl, {
    headers: { Accept: "application/geo+json" },
  });
  if (!gridResp.ok) {
    throw new Error(`NWS grid failed ${gridResp.status} for ${resort.name}`);
  }
  const gridJson = (await gridResp.json()) as NwsGridResponse;

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
  const fcResp = await fetch(forecastUrl, {
    headers: { Accept: "application/geo+json" },
  });
  if (!fcResp.ok) {
    throw new Error(`NWS forecast failed ${fcResp.status} for ${resort.name}`);
  }
  const fcJson = (await fcResp.json()) as NwsForecastResponse;
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
  const updatedAt = updatedAtISO
    ? new Date(updatedAtISO).toLocaleString()
    : "NWS";

  return {
    next24In: anySnow ? Math.round(totalIn * 10) / 10 : null,
    minTempF,
    maxTempF,
    maxWindMph,
    updatedAt,
    sourceUrl: gridUrl, // you can also include forecastUrl elsewhere if desired
  };
}
