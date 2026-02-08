import type { Resort } from "../data/resorts";
import type { SnowMetrics } from "../services/snow/types";
import type { DayFacts } from "./confidence";
import type { ResortDayCandidate, WeekOutlook } from "./weekOutlook";
import { buildWeekOutlook } from "./weekOutlook";
import { snowMetricsToCandidates } from "./snowMetricsAdapter";

export type BuildPlanParams = {
  resorts: Resort[];
  metricsByResortId: Record<string, SnowMetrics>;
  /** Plan start date (local semantics), ISO YYYY-MM-DD */
  startDateISO: string;
  /** number of days to include (default 7) */
  days?: number;
  /** top resorts per day (default 3) */
  topNPerDay?: number;

  /** Optional drive miles per resort id (lets UI personalize without changing SnowService) */
  driveMilesByResortId?: Record<string, number>;
};

/**
 * Build a 7-day plan on top of the locked SnowService contract.
 *
 * v0 projection model (honest + deterministic):
 * - Day 0 uses recent snow estimate: last48In / 2
 * - Day 1 uses forecast snow: next24In
 * - Days 2..N assume 0 new snow (until we add a real multi-day forecast source)
 *
 * Everything else (base/temp/wind) uses neutral defaults for now.
 */
export function buildWeekPlan(params: BuildPlanParams): WeekOutlook {
  const { resorts, metricsByResortId, startDateISO } = params;
  const days = params.days ?? 7;
  const topNPerDay = params.topNPerDay ?? 3;
  const driveMilesByResortId = params.driveMilesByResortId;

  if (days <= 0) throw new Error("buildWeekPlan: days must be > 0");

  const dateISOs = buildDateRangeISO(startDateISO, days);

  const candidates: ResortDayCandidate[] = [];

  for (let i = 0; i < dateISOs.length; i++) {
    const dateISO = dateISOs[i];

    candidates.push(
      ...snowMetricsToCandidates({
        resorts,
        metricsByResortId,
        dateISO,
        dayIndex: i,
        driveMilesByResortId,
      }),
    );
  }

  return buildWeekOutlook(candidates, topNPerDay);
}

export function buildDateRangeISO(
  startDateISO: string,
  days: number,
): string[] {
  const [y, m, d] = startDateISO.split("-").map((x) => Number(x));
  if (!y || !m || !d) throw new Error(`Invalid startDateISO: ${startDateISO}`);

  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(toISODateUTC(dt));
  }
  return out;
}

function toISODateUTC(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
