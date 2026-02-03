import type { Resort } from '../../data/resorts';

type NwsPointsResponse = {
  properties: {
    forecastGridData: string; // URL
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
function parseValidTimeInterval(validTime: string): { start: Date; end: Date } | null {
  const [startStr, durStr] = validTime.split('/');
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
  if (u.includes('wmoUnit:mm') || u.endsWith(':mm') || u.endsWith('/mm') || u.endsWith('mm')) {
    return value / 25.4;
  }
  if (u.includes('wmoUnit:cm') || u.endsWith(':cm') || u.endsWith('/cm') || u.endsWith('cm')) {
    return (value * 10) / 25.4;
  }
  if (u.includes('wmoUnit:m') || u.endsWith(':m') || u.endsWith('/m') || u.endsWith(' m')) {
    return (value * 1000) / 25.4;
  }
  return value;
}

function overlapFraction(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end <= start) return 0;
  return (end - start) / (aEnd.getTime() - aStart.getTime());
}

export async function getNext24SnowInches(resort: Resort): Promise<{
  next24In: number | null;
  updatedAt: string;
  sourceUrl: string;
}> {
  // 1) Convert lat/lon -> forecastGridData URL via /points
  const pointsUrl = `https://api.weather.gov/points/${resort.lat},${resort.lon}`;
  const pointsResp = await fetch(pointsUrl, {
    headers: { Accept: 'application/geo+json' },
  });
  if (!pointsResp.ok) {
    throw new Error(`NWS points failed ${pointsResp.status} for ${resort.name}`);
  }
  const pointsJson = (await pointsResp.json()) as NwsPointsResponse;
  const gridUrl = pointsJson?.properties?.forecastGridData;
  if (!gridUrl) {
    throw new Error(`NWS points missing forecastGridData for ${resort.name}`);
  }

  // 2) Fetch grid data which includes snowfallAmount layer
  const gridResp = await fetch(gridUrl, {
    headers: { Accept: 'application/geo+json' },
  });
  if (!gridResp.ok) {
    throw new Error(`NWS grid failed ${gridResp.status} for ${resort.name}`);
  }
  const gridJson = (await gridResp.json()) as NwsGridResponse;

  const layer = gridJson?.properties?.snowfallAmount;
  const values = layer?.values ?? [];
  const uom = layer?.uom;

  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let totalIn = 0;
  let any = false;

  for (const v of values) {
    if (v.value == null) continue;
    const iv = parseValidTimeInterval(v.validTime);
    if (!iv) continue;

    const frac = overlapFraction(iv.start, iv.end, now, end);
    if (frac <= 0) continue;

    // Values are amounts over the interval; prorate for partial overlap
    const inches = inchesFromUom(v.value, uom) * frac;
    totalIn += inches;
    any = true;
  }

  const updateTime = gridJson?.properties?.updateTime;
  const updatedAt = updateTime ? new Date(updateTime).toLocaleString() : 'NWS';

  return {
    next24In: any ? Math.round(totalIn * 10) / 10 : null, // 0.1" precision
    updatedAt,
    sourceUrl: gridUrl,
  };
}
