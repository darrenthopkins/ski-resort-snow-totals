//src/lib/snowMetricsAdapter.ts
import type { Resort } from "../data/resorts";
import type { SnowMetrics } from "../services/snow/types";
import type { DayFacts } from "./confidence";
import type { ResortDayCandidate } from "./weekOutlook";

function wxDebug(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("srs_debug_wx") === "1"
    );
  } catch {
    return false;
  }
}

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

  const DEFAULT_WEATHER_FACTS = {
    minTempF: 18,
    maxTempF: 34,
    maxWindMph: 15,
  } as const;

  return resorts.map((r) => {
    const m = metricsByResortId[r.id];

    const last48 = m?.last48In ?? null;
    const next24 = m?.next24In ?? null;

    const estimatedLast24 = last48 == null ? 0 : last48 / 2;
    const forecastNext24 = next24 == null ? 0 : next24;

    // Preferred: NWS daily snow bins if available (already day-bucketed)
    const weekDailySnow = m?.weekSnowDaily ?? null;
    const binnedSnowForDay =
      weekDailySnow?.find((d) => d.dateISO === dateISO)?.inches ?? null;

    // New snow for this specific day
    const newSnowInches =
      binnedSnowForDay != null
        ? binnedSnowForDay
        : dayIndex == null
        ? estimatedLast24 + forecastNext24
        : dayIndex === 0
        ? estimatedLast24
        : dayIndex === 1
        ? forecastNext24
        : 0;

    // Preferred: NWS per-day weather bins
    const dailyWx = m?.weekWeatherDaily ?? null;
    const hasDailyWxBins = Array.isArray(dailyWx) && dailyWx.length > 0;
    const wxForDay = dailyWx?.find((x) => x.dateISO === dateISO) ?? null;

    // If daily bins exist for the week, prefer them strictly.
    // Only fall back to snapshot fields when the week has no daily bins at all.
    const minTempF =
      wxForDay?.minTempF ??
      (!hasDailyWxBins ? m?.minTempF : null) ??
      DEFAULT_WEATHER_FACTS.minTempF;

    const maxTempF =
      wxForDay?.maxTempF ??
      (!hasDailyWxBins ? m?.maxTempF : null) ??
      DEFAULT_WEATHER_FACTS.maxTempF;

    const maxWindMph =
      wxForDay?.maxWindMph ??
      (!hasDailyWxBins ? m?.maxWindMph : null) ??
      DEFAULT_WEATHER_FACTS.maxWindMph;

    if (r.id === "patspeak") {
      if (wxDebug()) {
        console.log(`[${r.id} wx]`, dateISO, {
          hasDailyWxBins,
          dailyLen: dailyWx?.length ?? 0,
          dates: (dailyWx ?? []).map((x) => x.dateISO),
          wxForDay,
          used: { minTempF, maxTempF, maxWindMph },
          snapshot: { min: m?.minTempF, max: m?.maxTempF, wind: m?.maxWindMph },
        });
      }
    }

    // Base depth: keep your existing behavior (if you have m.baseDepthIn, use it; else default)
    const DEFAULT_BASE_DEPTH_INCHES = 24;
    const baseDepthInches = DEFAULT_BASE_DEPTH_INCHES;

    const facts: DayFacts = {
      dateISO,
      newSnowInches,
      baseDepthInches,
      minTempF,
      maxTempF,
      maxWindMph,
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
