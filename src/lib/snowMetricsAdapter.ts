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
  /** 0..N within the planning window (lets us do day0 recent / day1 forecast / rest 0) */
  dayIndex?: number;
  /** Optional drive miles per resort id (lets UI personalize without changing SnowService) */
  driveMilesByResortId?: Record<string, number>;
}): ResortDayCandidate[] {
  const {
    resorts,
    metricsByResortId,
    dateISO,
    dayIndex,
    driveMilesByResortId,
  } = params;

  const isWeekend = isoDateIsWeekend(dateISO);

  return resorts.map((r) => {
    const m = metricsByResortId[r.id];

    const last48 = m?.last48In ?? null;
    const next24 = m?.next24In ?? null;

    const estimatedLast24 = last48 == null ? 0 : last48 / 2;
    const forecastNext24 = next24 == null ? 0 : next24;

    // Preferred: NWS daily bins if available (already day-bucketed)
    const weekDaily = m?.weekSnowDaily;
    const binnedForDay =
      weekDaily?.find((d) => d.dateISO === dateISO)?.inches ?? null;

    // New snow for this specific day
    const newSnowInches =
      binnedForDay != null
        ? binnedForDay
        : dayIndex == null
          ? estimatedLast24 + forecastNext24
          : dayIndex === 0
            ? estimatedLast24
            : dayIndex === 1
              ? forecastNext24
              : 0;

    // Defaults (until we add base/temp/wind sources):
    const facts: DayFacts = {
      newSnowInches,
      baseDepthInches: 30, // neutral-ish "solid base" default
      minTempF: m?.minTempF ?? 18,
      maxTempF: m?.maxTempF ?? 34,
      maxWindMph: m?.maxWindMph ?? 15,
      isWeekend,
      driveMiles: driveMilesByResortId?.[r.id],
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
  const dt = new Date(y, m - 1, d); // local midnight
  const day = dt.getDay(); // local
  return day === 0 || day === 6;
}
