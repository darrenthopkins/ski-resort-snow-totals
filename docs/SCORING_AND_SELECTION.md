# SCORING_AND_SELECTION

This document defines how ski-resort-snow-totals computes:

- Per-day resort scores
- Labels (GO / WAIT / SKIP)
- Explanatory “Why” bullets
- Week-level selection behavior (including anti-repeat logic)

This is the canonical reference for product behavior.

---

# 1. High-Level Product Principles

The scoring system is designed around the following intent:

1. **New snow dominates.**
   Storm days should not be marked SKIP due to secondary factors.

2. **Weather is per-day.**
   Temperature and wind vary day-to-day and must affect the score.

3. **Distance matters, but smoothly.**
   No harsh cliffs in drive penalties.

4. **Explainability is mandatory.**
   The UI must reflect the actual facts used in scoring.

5. **Avoid same-resort repetition when reasonable.**
   If two resorts are close in score, don’t repeat the same one on adjacent days.

---

# 2. Data Flow Overview

SnowService → SnowMetrics → Adapter → DayFacts → calculateConfidence() → WeekOutlook

## SnowMetrics (input from SnowService)

Includes:

- last48In
- next24In
- minTempF / maxTempF / maxWindMph (snapshot)
- weekSnowDaily[]
- weekWeatherDaily[]

Per-day bins are preferred whenever available.

---

# 3. Adapter: SnowMetrics → DayFacts

Each (resort, dateISO) pair becomes a DayFacts object.

## 3.1 newSnowInches

Priority order:

1) weekSnowDaily (per-day NWS bins)
2) Fallback:
   - dayIndex 0 → last48In / 2
   - dayIndex 1 → next24In
   - later days → 0

## 3.2 Weather (minTempF, maxTempF, maxWindMph)

Priority order:

1) weekWeatherDaily.find(dateISO)
2) Snapshot fields (only if no daily bins exist at all)
3) Conservative defaults

If daily bins exist but a lookup fails, we do NOT revert to snapshot to avoid frozen-week behavior.

## 3.3 Base Depth

Currently synthesized (e.g., default 24").
This will be upgraded when real base depth is ingested.

---

# 4. Confidence Scoring

calculateConfidence(facts: DayFacts) produces:

- score: number (0–100)
- label: "green" | "yellow" | "red"
- reasons: string[]

## 4.1 Label Mapping (UI)

green  → GO  
yellow → WAIT  
red    → SKIP  

## 4.2 Score Calculation

```
raw =
  BASELINE_POINTS
  + snow.points
  + base.points
  + temperature.points
  + wind.points
  + crowds.points
  + drive.points
```

Clamped to 0–100.

### Thresholds

- score ≥ 80 → green
- score ≥ 60 → yellow
- else → red

---

# 5. Component Scoring

## 5.1 Snow (dominant)

Example buckets:

- ≥ 8" → very strong positive
- ≥ 5" → strong positive
- ≥ 2" → moderate positive
- otherwise small positive

Snow is intentionally weighted heavily.

## 5.2 Base

Currently mild influence due to synthesized value.

## 5.3 Temperature (Per-Day)

Uses both minTempF and maxTempF.

- Daytime high determines main bucket.
- Morning low can apply small modifier for differentiation.
- Extreme warmth or extreme cold penalizes.

## 5.4 Wind (Per-Day)

Wind penalizes lift reliability and comfort.

- Very calm days may receive a small bonus.
- Penalty increases progressively with wind speed.

## 5.5 Crowds

Weekend → penalty  
Weekday → neutral

## 5.6 Drive Distance

Uses smooth ramp (no cliffs):

- No penalty under threshold
- Smooth increase toward max penalty
- Parameters centralized

---

# 6. Storm Floor Rules (Label Clamp)

Storm floors override the raw label to match product intent.

Current rules:

- ≥ 2" new snow:
  → Cannot be red (at least WAIT)

- ≥ 5" new snow:
  → Should be green (GO)

This prevents SKIP on meaningful snow days.

Note:
Hard veto conditions (rain, unsafe wind) are not yet implemented.
When added, they may override storm floors.

---

# 7. Explainability (“Why” Bullets)

Reasons reflect actual scoring inputs:

- Snow bucket
- Base bucket
- Temperature bucket
- Wind bucket
- Weekend penalty
- Drive penalty
- Storm-floor adjustments (when applied)

Reasons must remain stable and concise.

---

# 8. Week Outlook Selection

## 8.1 Per-Day Ranking

For each date:

1. Compute confidence for all resorts
2. Rank by:
   - label priority (green > yellow > red)
   - score (descending)
   - deterministic tie-breakers

## 8.2 Avoid Same Resort on Adjacent Days

To prevent repetitive plans:

If day N’s best resort equals day N-1’s best:

- Select the best alternative resort
- Only if its score is within MAX_REPEAT_PENALTY_POINTS
- Otherwise keep original best

This preserves snow dominance while improving variety.

---

# 9. Testing Requirements

Unit tests must verify:

- Per-day weather bins affect scoring
- ≥ 2" snow cannot be red
- ≥ 5" snow becomes green
- Drive penalty is smooth (no cliffs)
- Adjacent-day repeat logic works
- Deterministic ordering is preserved

Run:

```
npm run typecheck
npm run test.unit
```

---

# 10. Known Limitations

- Base depth is synthetic.
- No precipitation-type veto yet.
- Weather buckets may be further tuned.

This document must be updated whenever scoring constants or thresholds change.
