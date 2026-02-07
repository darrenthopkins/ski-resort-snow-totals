import type { Resort } from "../data/resorts";
import type { SnowMetrics } from "../services/snow/types";
import type { DayFacts } from "./confidence";
import type { ResortDayCandidate } from "./weekOutlook";

/**
 * Convert SnowService SnowMetrics into the planning layer's ResortDayCandidate[] for a specific day.
 *
 * Notes / assumptions (v0):
 * - SnowService does not provide per-day forecasts beyond next24, nor base depth/temp/wind.
 * - We synthesize DayFacts using conservative defaults so the rest of the pipeline can work.
 * - newSnowInches is estimated as: (last48In / 2) + next24In
 *   (roughly "typical last 24h" + forecast). This is intentionally simple and deterministic.
 */
export function snowMetricsToCandidates(params: {
  resorts: Resort[];
  metricsByResortId: Record<string, SnowMetrics>;
  /** The day these candidates represent, ISO: YYYY-MM-DD */
  dateISO: string;
}): ResortDayCandidate[] {
  const { resorts, metricsByResortId, dateISO } = params;

  const isWeekend = isoDateIsWeekend(dateISO);

  return resorts.map((r) => {
    const m = metricsByResortId[r.id];

    const last48 = m?.last48In ?? null;
    const next24 = m?.next24In ?? null;

    const estimatedLast24 = last48 == null ? 0 : last48 / 2;
    const forecastNext24 = next24 == null ? 0 : next24;

    const newSnowInches = estimatedLast24 + forecastNext24;

    // Defaults (until we add base/temp/wind sources):
    const facts: DayFacts = {
      newSnowInches,
      baseDepthInches: 30, // neutral-ish "solid base" default
      minTempF: 15,
      maxTempF: 28,        // ideal-ish to avoid penalizing unknowns
      maxWindMph: 8,       // light wind default
      isWeekend,
    };

    return {
      resortId: r.id,
      resortName: r.name,
      dateISO,
      facts,
    };
  });
}

export function isoDateIsWeekend(dateISO: string): boolean {
  // Interpret YYYY-MM-DD as local date in the user's locale; construct a Date at midnight UTC
  // and use getUTCDay for determinism in tests.
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  if (!y || !m || !d) throw new Error(`Invalid dateISO: ${dateISO}`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 Sun .. 6 Sat
  return day === 0 || day === 6;
}
