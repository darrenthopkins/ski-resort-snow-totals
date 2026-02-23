// src/lib/confidence.ts

export type ConfidenceLabel = "green" | "yellow" | "red";

export type DayFacts = {
  /** last 24h + next 24h (or however you compute it upstream) */
  newSnowInches: number;
  baseDepthInches: number;
  minTempF: number;
  maxTempF: number;
  maxWindMph: number;
  isWeekend: boolean;

  /** Optional drive distance (miles). If absent, no drive penalty is applied. */
  driveMiles?: number;
};

export type ConfidenceResult = {
  score: number; // 0..100
  label: ConfidenceLabel;
  reasons: string[];
};

function clampInt(n: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, n));
  return Math.round(clamped);
}

function labelForScore(score: number): ConfidenceLabel {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

type ComponentScore = {
  points: number;
  reasons: string[];
};

const BASELINE_POINTS = 20;

function scoreSnow(newSnowInches: number): ComponentScore {
  const s = Math.max(0, newSnowInches);

  if (s >= 8) return { points: 50, reasons: ["8+ inches of new snow"] };
  if (s >= 5) return { points: 38, reasons: ["5–7 inches of new snow"] };
  if (s >= 2) return { points: 22, reasons: ["2–4 inches of new snow"] };
  return { points: 10, reasons: ["Little to no new snow"] };
}

function scoreBase(baseDepthInches: number): ComponentScore {
  const b = Math.max(0, baseDepthInches);

  if (b >= 40) return { points: 20, reasons: ["Deep base (40+ inches)"] };
  if (b >= 30) return { points: 14, reasons: ["Solid base (30–39 inches)"] };
  if (b >= 20) return { points: 7, reasons: ["Marginal base (20–29 inches)"] };
  return { points: 0, reasons: ["Thin base (< 20 inches)"] };
}

function scoreTemperature(minTempF: number, maxTempF: number): ComponentScore {
  const hi = maxTempF;
  const lo = minTempF;

  // Base score driven by daytime high (as before)
  let points: number;
  let reason: string;

  if (hi >= 20 && hi <= 32) {
    points = 10;
    reason = "Temperatures ideal for snow quality";
  } else if (hi >= 10 && hi <= 19) {
    points = 0;
    reason = "Cold temps (manageable)";
  } else if (hi >= 33 && hi <= 38) {
    points = -5;
    reason = "Above-freezing risk (possible wet/icy conditions)";
  } else if (hi < 10) {
    points = -10;
    reason = "Very cold (comfort/lift exposure risk)";
  } else {
    points = -20;
    reason = "Warm temps (melt/ice risk)";
  }

  // NEW: morning low modifier to differentiate per-day bins
  // (kept small so it doesn't dominate snow)
  if (lo < 5) {
    points -= 4;
    return {
      points,
      reasons: [reason, "Frigid morning low (added exposure penalty)"],
    };
  }
  if (lo >= 20 && hi <= 32) {
    points += 2;
    return { points, reasons: [reason, "Mild morning low (bonus)"] };
  }

  return { points, reasons: [reason] };
}

function scoreWind(maxWindMph: number): ComponentScore {
  const w = Math.max(0, maxWindMph);

  if (w <= 5) return { points: 2, reasons: ["Calm winds"] };
  if (w <= 10) return { points: 0, reasons: ["Light winds"] };
  if (w <= 20) return { points: -5, reasons: ["Breezy (minor lift exposure)"] };
  if (w <= 30)
    return {
      points: -10,
      reasons: ["Windy (lift exposure / potential holds)"],
    };
  return { points: -20, reasons: ["Very windy (high lift/comfort risk)"] };
}

function scoreCrowds(isWeekend: boolean): ComponentScore {
  return isWeekend
    ? { points: -15, reasons: ["Weekend crowds"] }
    : { points: 0, reasons: ["Weekday crowds"] };
}

type DriveParams = {
  zeroPenaltyMiles: number; // no penalty at/below this
  fullPenaltyMiles: number; // max penalty at/above this
  maxPenaltyPoints: number; // negative points (e.g. -20)
};

const DRIVE_PARAMS: DriveParams = {
  zeroPenaltyMiles: 50,
  fullPenaltyMiles: 140,
  maxPenaltyPoints: -20,
};

function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function scoreDriveMiles(driveMiles?: number): ComponentScore {
  if (driveMiles == null || !Number.isFinite(driveMiles))
    return { points: 0, reasons: [] };

  const m = Math.max(0, driveMiles);

  if (m <= DRIVE_PARAMS.zeroPenaltyMiles) {
    return { points: 0, reasons: [`Short drive (${Math.round(m)} mi)`] };
  }

  const span = Math.max(
    1,
    DRIVE_PARAMS.fullPenaltyMiles - DRIVE_PARAMS.zeroPenaltyMiles,
  );
  const t = (m - DRIVE_PARAMS.zeroPenaltyMiles) / span;
  const ramp = smoothstep01(t);

  const points = Math.round(ramp * DRIVE_PARAMS.maxPenaltyPoints); // negative
  const bucket = m < 80 ? "Moderate" : m < 110 ? "Long" : "Very long";

  return { points, reasons: [`${bucket} drive (${Math.round(m)} mi)`] };
}

export function calculateConfidence(facts: DayFacts): ConfidenceResult {
  const snow = scoreSnow(facts.newSnowInches);
  const base = scoreBase(facts.baseDepthInches);
  const temp = scoreTemperature(facts.minTempF, facts.maxTempF);
  const wind = scoreWind(facts.maxWindMph);
  const crowds = scoreCrowds(facts.isWeekend);
  const drive = scoreDriveMiles(facts.driveMiles);

  const reasons: string[] = [
    "Baseline rideability",
    ...snow.reasons,
    ...base.reasons,
    ...temp.reasons,
    ...wind.reasons,
    ...crowds.reasons,
    ...drive.reasons,
  ];

  const raw =
    BASELINE_POINTS +
    snow.points +
    base.points +
    temp.points +
    wind.points +
    crowds.points +
    drive.points;

  const score = clampInt(raw, 0, 100);
  let label = labelForScore(score);

  // Storm floor rule (label clamp)
  // Product intent:
  // - ≥ 3" new snow: should not be red (at least "wait/consider")
  // - ≥ 5" new snow: should be green/go unless we later add a hard veto (rain/unsafe)
  if (Number.isFinite(facts.newSnowInches)) {
    const s = facts.newSnowInches;

    if (s >= 5 && label !== "green") {
      label = "green";
      reasons.push(`Storm floor: ${s.toFixed(1)}" new snow → go (green)`);
    } else if (s >= 2 && label === "red") {
      label = "yellow";
      reasons.push(`Storm floor: ${s.toFixed(1)}" new snow → wait (not red)`);
    }
  }

  return { score, label, reasons };
}
