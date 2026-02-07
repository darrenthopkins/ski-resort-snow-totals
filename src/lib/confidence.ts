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

function scoreTemperature(_minTempF: number, maxTempF: number): ComponentScore {
  const hi = maxTempF;

  if (hi >= 20 && hi <= 32) return { points: 10, reasons: ["Temperatures ideal for snow quality"] };
  if (hi >= 10 && hi <= 19) return { points: 0, reasons: ["Cold temps (manageable)"] };
  if (hi >= 33 && hi <= 38) return { points: -5, reasons: ["Above-freezing risk (possible wet/icy conditions)"] };
  if (hi < 10) return { points: -10, reasons: ["Very cold (comfort/lift exposure risk)"] };
  return { points: -20, reasons: ["Warm temps (melt/ice risk)"] };
}

function scoreWind(maxWindMph: number): ComponentScore {
  const w = Math.max(0, maxWindMph);

  if (w <= 10) return { points: 0, reasons: ["Light winds"] };
  if (w <= 20) return { points: -5, reasons: ["Breezy (minor lift exposure)"] };
  if (w <= 30) return { points: -10, reasons: ["Windy (lift exposure / potential holds)"] };
  return { points: -20, reasons: ["Very windy (high lift/comfort risk)"] };
}

function scoreCrowds(isWeekend: boolean): ComponentScore {
  return isWeekend
    ? { points: -15, reasons: ["Weekend crowds"] }
    : { points: 0, reasons: ["Weekday crowds"] };
}

function scoreDriveMiles(driveMiles?: number): ComponentScore {
  if (driveMiles == null || !Number.isFinite(driveMiles)) return { points: 0, reasons: [] };

  const m = Math.max(0, driveMiles);

  // Tuned for "parent + kid" convenience: closer is meaningfully better.
  if (m <= 50) return { points: 0, reasons: [`Short drive (${Math.round(m)} mi)`] };
  if (m <= 80) return { points: -5, reasons: [`Moderate drive (${Math.round(m)} mi)`] };
  if (m <= 110) return { points: -10, reasons: [`Long drive (${Math.round(m)} mi)`] };
  return { points: -20, reasons: [`Very long drive (${Math.round(m)} mi)`] };
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
  const label = labelForScore(score);

  return { score, label, reasons };
}
