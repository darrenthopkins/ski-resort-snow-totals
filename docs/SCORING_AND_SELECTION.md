# Scoring and Selection

This document describes how the app computes a **day score + label (GO / WAIT / SKIP)** for each resort/day and how it selects recommended resorts across the week.

The intent is product-driven:

- **New snow dominates** decision-making (storm days should not be “SKIP” because of secondary factors).
- **Weather varies per day** (NWS per-day bins), and should influence day-by-day differences.
- **Distance matters**, but should not introduce cliff behavior.
- The UI’s “Why” bullets must reflect the **actual inputs used**.

---

## Terms

### SnowMetrics (input)
Returned by `SnowService.getSnow()`. Includes:

- `last48In`, `next24In`
- Snapshot weather: `minTempF`, `maxTempF`, `maxWindMph` (next-24 derived)
- Per-day bins (preferred):
  - `weekSnowDaily[]` (dateISO → inches)
  - `weekWeatherDaily[]` (dateISO → min/max temp, max wind)

### DayFacts (scoring facts)
Derived per **resort + dateISO** in the adapter layer.

Fields used for confidence scoring:

- `newSnowInches` (per-day snow estimate, see below)
- `baseDepthInches` (currently a conservative synthesized default)
- `minTempF`, `maxTempF`, `maxWindMph` (per-day weather bins preferred)
- `isWeekend` (crowd penalty)
- `driveMiles?` (optional; used for distance penalty)

---

## Adapter: from SnowMetrics → DayFacts

### New snow per day (`newSnowInches`)
Priority order:

1) **Per-day NWS bins** (preferred):  
   `weekSnowDaily.find(dateISO).inches`

2) Fallback (when per-day bins are not available):  
   Uses `last48In` + `next24In` heuristics with `dayIndex`:
   - `dayIndex = 0`: estimate from `last48In/2`
   - `dayIndex = 1`: `next24In`
   - later days: `0` (until per-day snow bins exist)

### Weather per day (min/max temp + wind)
Per-day weather is pulled from:

- `weekWeatherDaily.find(dateISO)` **if bins exist**
- If bins do not exist at all, fall back to snapshot fields:
  - `minTempF`, `maxTempF`, `maxWindMph`
- Otherwise use conservative defaults.

Important behavior:
- If `weekWeatherDaily` exists but a day lookup misses, we **do not** silently revert to snapshot (prevents “frozen week” scoring).

### Base depth (`baseDepthInches`)
SnowMetrics currently does not include base depth. For now:

- `baseDepthInches` is set to a conservative synthesized default (e.g., `24`).

This is intentionally stable and will be revisited once we ingest base depth from a reliable source.

---

## Confidence scoring (score + label + reasons)

The scoring function produces:

- `score` in **0..100**
- `label` in `{ green, yellow, red }`
- `reasons[]` (short bullets for explainability)

### Label mapping
UI interpretation:

- `green` → **GO**
- `yellow` → **WAIT**
- `red` → **SKIP**

### Base formula (additive points)
The raw score is:

Then clamped to 0..100.

### Thresholds (score → label)
By default:

- `score >= 80` → `green`
- `score >= 60` → `yellow`
- otherwise → `red`

### Component scoring
#### Snow (dominant)
Buckets (example intent):
- `>= 8"` → strong positive
- `>= 5"` → strong positive
- `>= 2"` → moderate positive
- otherwise small positive

#### Base depth
Currently mild influence because it’s synthesized and not yet data-driven.

#### Temperature
Uses **per-day** values. Daytime high drives the main bucket, with small modifiers based on morning low (for day-to-day differentiation).

#### Wind
Uses **per-day** values. Wind is penalized and may include a small bonus for very calm days.

#### Crowds
Weekend days receive a penalty.

#### Drive distance
Drive penalty is **smooth** (no cliffs), using a smoothstep ramp from “no penalty” to “max penalty”.
Parameters are centralized.

---

## Storm floor rules (label clamp)

Because product intent prioritizes storm events, we clamp labels upward after the raw label is computed.

Current intent:

- **≥ 2" new snow:** cannot be `red` (at least **WAIT**)
- **≥ 5" new snow:** should be `green` (**GO**) unless/until a “hard veto” is implemented (e.g., rain, unsafe wind)

This prevents “SKIP” on days where meaningful snow is expected.

Notes:
- We do not yet implement a hard veto (e.g., rain), because precipitation type is not reliably present in DayFacts.
- If/when hard veto signals exist, they can override storm floors in a principled way.

---

## Reasons / Explainability (“Why” bullets)

The `reasons[]` output should be:

- Based on **actual DayFacts used**
- Stable and not overly verbose
- Reflect the main contributors:
  - snow bucket
  - base bucket
  - temp/wind bucket
  - weekend crowds
  - drive distance (if present)
  - storm-floor clamp (when applied)

---

## Week outlook selection

### Per-day ranking
For each dateISO:

1) Compute confidence result per resort (score + label + reasons)
2) Rank resorts for that day primarily by:
   - label preference (`green > yellow > red`)
   - score (descending)
   - deterministic tie-breakers (stable ordering)

### Avoid repeating the same resort on adjacent days
To prevent “same resort both days” when choices are close:

- If day N’s best resort is the same as day N-1’s best:
  - choose the best alternative resort **if** its score is within a small delta of the top score
  - otherwise keep the top resort (don’t force a bad switch)

Parameters are centralized (e.g., `MAX_REPEAT_PENALTY_POINTS = 8`).

This preserves “best snow wins” while improving variety and user trust.

---

## Testing / Verification

Unit tests should cover:

- **Per-day weather bins** change score/label when only `minTempF/maxTempF/maxWindMph` differ.
- **Storm floor** clamping:
  - `>= 2"` cannot be red
  - `>= 5"` becomes green
- **Drive penalty** is smooth (no cliff discontinuities).
- **No adjacent repeats**: switches to a close runner-up when the top repeats.

Recommended commands:

```bash
npm run test.unit
npm run typecheck

