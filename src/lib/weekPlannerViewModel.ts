import type { Resort } from "../data/resorts";
import type { DayFacts } from "./confidence";

type Label = "green" | "yellow" | "red";

type PickVM = {
  resortId: string;
  resortName: string;
  score: number;
  label: Label;
  facts?: DayFacts;
  bullets: string[];
};

export type WeekPlanViewModel = {
  summary: {
    decision: WeekDecision;
    bestWindow: { startISO: string; endISO: string; label: string };
    topPicks: Array<{
      dateISO: string;
      label: Label;
      resortId: string;
      resortName: string;
      score: number;
    }>;
    bestOverallResort: { id: string; name: string };
    backupResort: { id: string; name: string; reason: string };
    narrative: string;
  };
  days: Array<{
    dateISO: string;
    label: Label;
    topPick: PickVM;
    runnersUp: PickVM[];
    // Back-compat: day-level bullets (mirrors topPick bullets)
    bullets: string[];
  }>;
  resorts: Array<{
    resortId: string;
    resortName: string;
    weekTag: "steady" | "peaky" | "skip";
  }>;
};

export type WeekDecision = {
  picks: Array<{
    dateISO: string;
    resortId: string;
    resortName: string;
    label: Label;
    score: number;
  }>;
  backup?: { resortId: string; resortName: string; reason: string };
  window: { startISO: string; endISO: string; label: string };
  why: string[]; // short bullets for the hero card
};

function normalizeLabel(x: any): Label {
  if (x === "green" || x === "yellow" || x === "red") return x;
  return "yellow";
}

function pickTopTwoDayPicks(daysVM: WeekPlanViewModel["days"]) {
  const sorted = [...daysVM].sort((a, b) => b.topPick.score - a.topPick.score);
  const out: WeekPlanViewModel["summary"]["topPicks"] = [];
  for (const d of sorted) {
    out.push({
      dateISO: d.dateISO,
      label: d.topPick.label,
      resortId: d.topPick.resortId,
      resortName: d.topPick.resortName,
      score: d.topPick.score,
    });
    if (out.length >= 2) break;
  }
  return out;
}

function pickBestOverallResort(params: {
  days: Array<{
    best: { resortId: string; resortName: string; result: { score: number } };
    topResorts: Array<{
      resortId: string;
      resortName: string;
      result: { score: number };
    }>;
  }>;
  resorts: Resort[];
}) {
  const { days, resorts } = params;

  // Score each resort by best score observed across the week (simple & stable v0).
  const bestByResort: Record<string, number> = {};
  const nameByResort: Record<string, string> = {};
  for (const r of resorts) nameByResort[r.id] = r.name;

  for (const d of days) {
    const all = [d.best, ...d.topResorts];
    for (const row of all) {
      const prev = bestByResort[row.resortId] ?? -Infinity;
      bestByResort[row.resortId] = Math.max(prev, row.result.score);
    }
  }

  let bestId = resorts[0]?.id ?? "unknown";
  let bestScore = -Infinity;
  for (const r of resorts) {
    const s = bestByResort[r.id];
    if (typeof s === "number" && s > bestScore) {
      bestScore = s;
      bestId = r.id;
    }
  }

  return { id: bestId, name: nameByResort[bestId] ?? bestId };
}

function pickBackupResort(params: {
  bestOverallId: string;
  resorts: Resort[];
  driveMilesByResortId?: Record<string, number>;
}) {
  const { bestOverallId, resorts, driveMilesByResortId } = params;

  // If we have drive miles, backup is the closest resort that isn't the best overall.
  if (driveMilesByResortId) {
    let best: { id: string; name: string; miles: number } | null = null;
    for (const r of resorts) {
      if (r.id === bestOverallId) continue;
      const miles = driveMilesByResortId[r.id];
      if (typeof miles !== "number" || !Number.isFinite(miles)) continue;
      if (!best || miles < best.miles) best = { id: r.id, name: r.name, miles };
    }
    if (best) {
      return {
        id: best.id,
        name: best.name,
        reason: `Closest backup option (~${Math.round(best.miles)} mi)`,
      };
    }
  }

  // Fallback: second resort in list (stable, deterministic v0)
  const fallback = resorts.find((r) => r.id !== bestOverallId) ?? resorts[0];
  return {
    id: fallback.id,
    name: fallback.name,
    reason: "Solid backup option",
  };
}

function computeWeekTags(params: {
  daysVM: WeekPlanViewModel["days"];
  resorts: Resort[];
}) {
  const { daysVM, resorts } = params;

  const scoresByResort: Record<string, number[]> = {};
  for (const r of resorts) scoresByResort[r.id] = [];

  for (const d of daysVM) {
    const all = [d.topPick, ...d.runnersUp];
    for (const row of all) {
      if (!scoresByResort[row.resortId]) scoresByResort[row.resortId] = [];
      scoresByResort[row.resortId].push(row.score);
    }
  }

  function mean(xs: number[]) {
    if (xs.length === 0) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  function stdev(xs: number[]) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
    return Math.sqrt(v);
  }

  const out: WeekPlanViewModel["resorts"] = [];
  for (const r of resorts) {
    const xs = scoresByResort[r.id] ?? [];
    const m = mean(xs);
    const sd = stdev(xs);

    let weekTag: "steady" | "peaky" | "skip" = "skip";
    if (m >= 60) weekTag = sd <= 10 ? "steady" : "peaky";
    else if (m >= 45) weekTag = "peaky";
    else weekTag = "skip";

    out.push({ resortId: r.id, resortName: r.name, weekTag });
  }
  return out;
}

function windowLabel(startISO: string, endISO: string) {
  const dow = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return dt.toLocaleDateString(undefined, { weekday: "short" });
  };
  return startISO === endISO
    ? dow(startISO)
    : `${dow(startISO)}–${dow(endISO)}`;
}

function truthBulletsFromFacts(facts?: DayFacts): string[] {
  if (!facts) return [];

  const out: string[] = [];

  // Snow
  out.push(
    `Snow signal: ${facts.newSnowInches.toFixed(1)}" (last24+next24 proxy)`,
  );

  // Weather
  out.push(
    `${facts.minTempF}–${facts.maxTempF}°F · wind ≤ ${facts.maxWindMph} mph`,
  );

  // Drive (optional)
  if (facts.driveMiles != null)
    out.push(`Drive ~${Math.round(facts.driveMiles)} mi`);

  return out.slice(0, 3);
}

function cloneFactsWithDriveMiles(params: {
  resortId: string;
  facts?: DayFacts;
  driveMilesByResortId?: Record<string, number>;
}): DayFacts | undefined {
  const { resortId, facts, driveMilesByResortId } = params;
  if (!facts) return undefined;

  const cloned: DayFacts = { ...(facts as any) };

  if (
    (cloned as any).driveMiles == null &&
    driveMilesByResortId &&
    typeof driveMilesByResortId[resortId] === "number" &&
    Number.isFinite(driveMilesByResortId[resortId]!)
  ) {
    (cloned as any).driveMiles = driveMilesByResortId[resortId]!;
  }

  return cloned;
}

function bulletsForResult(params: {
  resortId: string;
  result?: any;
  driveMilesByResortId?: Record<string, number>;
}): { facts?: DayFacts; bullets: string[] } {
  const { resortId, result, driveMilesByResortId } = params;

  const facts = cloneFactsWithDriveMiles({
    resortId,
    facts: result?.facts as DayFacts | undefined,
    driveMilesByResortId,
  });

  const truth = truthBulletsFromFacts(facts);
  const reasons: string[] = Array.isArray(result?.reasons)
    ? result.reasons
    : [];

  const bullets = (truth.length ? truth : reasons).slice(0, 3);

  return {
    facts,
    bullets: (bullets.length
      ? bullets
      : ["Planner score based on snow + risk + crowds + travel"]
    ).slice(0, 3),
  };
}

/**
 * Build a UI-ready week planner view model on top of the existing buildWeekPlan() output.
 * This is the "planner output contract" the UI should depend on.
 */
export function buildWeekPlanViewModel(params: {
  // Existing planner output (from buildWeekPlan in lib/weekPlanner)
  outlook: any;

  resorts: Resort[];
  driveMilesByResortId?: Record<string, number>;
}): WeekPlanViewModel {
  const { outlook, resorts, driveMilesByResortId } = params;

  if (!outlook || !Array.isArray(outlook.days) || !outlook.bestDay) {
    throw new Error("Invalid outlook input to buildWeekPlanViewModel");
  }

  const daysVM: WeekPlanViewModel["days"] = outlook.days.map((d: any) => {
    const best = d.best;
    const bestLabel = normalizeLabel(best?.result?.label);
    const bestScore = Number(best?.result?.score ?? 0);
    const bestResortId = String(best?.resortId);

    const bestFactsAndBullets = bulletsForResult({
      resortId: bestResortId,
      result: best?.result,
      driveMilesByResortId,
    });

    const runners: PickVM[] = Array.isArray(d.topResorts)
      ? d.topResorts
          .filter((x: any) => String(x?.resortId) !== bestResortId)
          .slice(0, 2)
          .map((x: any) => {
            const resortId = String(x.resortId);
            const factsAndBullets = bulletsForResult({
              resortId,
              result: x?.result,
              driveMilesByResortId,
            });
            return {
              resortId,
              resortName: String(x.resortName),
              score: Number(x.result?.score ?? 0),
              label: normalizeLabel(x.result?.label),
              facts: factsAndBullets.facts,
              bullets: factsAndBullets.bullets,
            };
          })
      : [];

    const topPick: PickVM = {
      resortId: bestResortId,
      resortName: String(best?.resortName),
      score: bestScore,
      label: bestLabel,
      facts: bestFactsAndBullets.facts,
      bullets: bestFactsAndBullets.bullets,
    };

    return {
      dateISO: String(d.dateISO),
      label: bestLabel,
      topPick,
      runnersUp: runners,
      bullets: topPick.bullets.slice(0, 3),
    };
  });

  const bestISO = String(outlook.bestDay.dateISO);

  const topPicks = pickTopTwoDayPicks(daysVM);

  const summaryBestOverall = pickBestOverallResort({
    days: outlook.days,
    resorts,
  });

  const backup = pickBackupResort({
    bestOverallId: summaryBestOverall.id,
    resorts,
    driveMilesByResortId,
  });

  const narrative =
    `Best day: ${bestISO}. ` +
    `Top pick: ${String(outlook.bestDay.best?.resortName ?? summaryBestOverall.name)}. ` +
    `Backup: ${backup.name}.`;

  const picks = (topPicks.length ? topPicks : pickTopTwoDayPicks(daysVM)).slice(
    0,
    2,
  );

  const pickISOs = picks.map((p) => p.dateISO).sort();
  const windowStartISO = pickISOs[0] ?? bestISO;
  const windowEndISO = pickISOs[pickISOs.length - 1] ?? bestISO;

  const window = {
    startISO: windowStartISO,
    endISO: windowEndISO,
    label: windowLabel(windowStartISO, windowEndISO),
  };

  const backupDecision = backup?.id
    ? { resortId: backup.id, resortName: backup.name, reason: backup.reason }
    : undefined;

  // Hero “why” bullets: use pick-level bullets for the first pick day when available.
  const why = picks.length
    ? (
        daysVM.find((d) => d.dateISO === picks[0].dateISO)?.topPick?.bullets ??
        []
      ).slice(0, 3)
    : [];

  const defaultWhy = [
    "Midweek timing keeps crowds manageable",
    "Drive stays reasonable for a full-day trip",
    "Conditions look stable enough to plan ahead",
  ];

  const decision: WeekDecision = {
    window,
    picks: picks.map((p) => ({
      dateISO: p.dateISO,
      resortId: p.resortId,
      resortName: p.resortName,
      label: p.label,
      score: p.score,
    })),
    backup: backupDecision,
    why: why.length ? why.slice(0, 3) : defaultWhy,
  };

  return {
    summary: {
      decision,
      bestWindow: decision.window,
      topPicks,
      bestOverallResort: summaryBestOverall,
      backupResort: backup,
      narrative,
    },
    days: daysVM,
    resorts: computeWeekTags({ daysVM, resorts }),
  };
}
