import {
  calculateConfidence,
  type ConfidenceResult,
  type DayFacts,
} from "./confidence";
type ConfidenceWithFacts = ConfidenceResult & { facts: DayFacts };

export type ResortDayCandidate = {
  resortId: string;
  resortName: string;
  /** ISO date, local semantics: YYYY-MM-DD */
  dateISO: string;
  facts: DayFacts;
};

export type RankedResort = {
  resortId: string;
  resortName: string;
  result: ConfidenceWithFacts;
};

export type DayOutlook = {
  dateISO: string;
  /** The best-scoring resort for this day */
  best: RankedResort;
  /** Top resorts for this day (sorted by score desc, stable tie-breaker) */
  topResorts: RankedResort[];
};

export type WeekOutlook = {
  days: DayOutlook[];
  /** Best day across the window (highest score; tie-breaker = earlier date; then weekday over weekend) */
  bestDay: DayOutlook;
};

function stableResortSort(a: RankedResort, b: RankedResort): number {
  // score desc
  if (b.result.score !== a.result.score) return b.result.score - a.result.score;
  // label preference (green > yellow > red) (mostly redundant given score but keeps deterministic)
  const order = { green: 0, yellow: 1, red: 2 } as const;
  const la = order[a.result.label];
  const lb = order[b.result.label];
  if (la !== lb) return la - lb;
  // name asc as stable tie-breaker
  return a.resortName.localeCompare(b.resortName);
}

function dateSortAsc(aISO: string, bISO: string): number {
  // ISO "YYYY-MM-DD" sorts lexicographically
  return aISO.localeCompare(bISO);
}

function daySortForBest(a: DayOutlook, b: DayOutlook): number {
  // Prefer higher score
  if (b.best.result.score !== a.best.result.score)
    return b.best.result.score - a.best.result.score;

  // Tie-breaker 1: earlier date
  if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);

  // Tie-breaker 2: prefer weekday over weekend (if still tied and date same, this won't matter)
  // (kept for future-proofing if dateISO includes time)
  const aWeekend = a.best.result.reasons.includes("Weekend crowds");
  const bWeekend = b.best.result.reasons.includes("Weekend crowds");
  if (aWeekend !== bWeekend) return aWeekend ? 1 : -1;

  return 0;
}

export function buildWeekOutlook(
  candidates: ResortDayCandidate[],
  topNPerDay = 3,
): WeekOutlook {
  if (candidates.length === 0) {
    throw new Error("buildWeekOutlook: candidates must be non-empty");
  }

  // Group by date
  const byDate = new Map<string, ResortDayCandidate[]>();
  for (const c of candidates) {
    const list = byDate.get(c.dateISO);
    if (list) list.push(c);
    else byDate.set(c.dateISO, [c]);
  }

  const dayKeys = Array.from(byDate.keys()).sort(dateSortAsc);

  const days: DayOutlook[] = dayKeys.map((dateISO) => {
    const dayCandidates = byDate.get(dateISO)!;

    const ranked: RankedResort[] = dayCandidates.map((c) => ({
      resortId: c.resortId,
      resortName: c.resortName,
      result: { ...calculateConfidence(c.facts), facts: c.facts },
    }));

    ranked.sort(stableResortSort);

    const topResorts = ranked.slice(0, Math.max(1, topNPerDay));
    const best = topResorts[0];

    return { dateISO, best, topResorts };
  });

  const bestDay = [...days].sort(daySortForBest)[0];

  return { days, bestDay };
}
