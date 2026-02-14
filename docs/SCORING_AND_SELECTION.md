# SCORING AND SELECTION

**Branch:** `v1-demo-truth`  
**Authority:** Implementation in `/src` (code is authoritative)

This document is a precise technical specification of the scoring and resort selection system as implemented in this branch.

If behavior described here conflicts with the code, the code is authoritative.

---

# TL;DR — How Scoring Works

Every resort-day receives a score from **0–100**:

```
Score =
  20 (baseline)
+ Snow points (10–50)
+ Base depth points (0–20)
+ Temperature points (-20 to +10)
+ Wind penalty (0 to -20)
+ Weekend penalty (0 or -15)
+ Drive penalty (0 to -20)
```

Then:

- Clamped to `[0, 100]`
- Rounded to nearest integer
- Labeled:
  - `>= 80` → green
  - `>= 60` → yellow
  - `< 60` → red

## Key Characteristics (Sunny-Day View)

- Snow has the largest influence (up to +50).
- A "sunny 28°F weekday with low wind and no drive penalty" typically scores mid-to-high yellow even with moderate snow.
- Weekend always costs -15.
- Temperature scoring uses **maxTempF only**.
- Base depth is currently hard-coded to 30 inches.
- Multi-day optimization is not implemented.
- Backup selection is distance-based (not score-based).

---

# 1. End-to-End Flow

## Planner Pipeline

1. Fetch snow/weather metrics  
   `src/services/snow/realSnowService.ts`

2. Convert metrics to day candidates  
   `src/lib/snowMetricsAdapter.ts`

3. Score each candidate  
   `src/lib/confidence.ts`

4. Rank per-day + choose best day  
   `src/lib/weekOutlook.ts`

5. Build UI decision model  
   `src/lib/weekPlannerViewModel.ts`

---

# 2. Inputs Used in Scoring

Defined in:

```
src/lib/confidence.ts
```

```ts
export type DayFacts = {
  newSnowInches: number;
  baseDepthInches: number;
  minTempF: number;
  maxTempF: number;
  maxWindMph: number;
  isWeekend: boolean;
  driveMiles?: number;
};
```

No other inputs are used.

If something is not listed above, it is not part of scoring.

---

# 3. How Snow Is Derived

Defined in:

```
src/lib/snowMetricsAdapter.ts
```

### SnowMetrics Inputs

```
last48In
next24In
minTempF
maxTempF
maxWindMph
```

### Snow Projection Logic

```
estimatedLast24 = last48In == null ? 0 : last48In / 2
forecastNext24  = next24In == null ? 0 : next24In
```

When used inside the week planner:

| Day Index | newSnowInches |
|-----------|---------------|
| 0         | estimatedLast24 |
| 1         | forecastNext24 |
| ≥ 2       | 0 |

Because `getOnTheSnowLast48()` currently returns `null`,
Day 0 snow is effectively 0 in current implementation.

---

# 4. Scoring Components (Exact Buckets)

Defined in:

```
src/lib/confidence.ts
```

---

## 4.1 Baseline

```
BASELINE_POINTS = 20
```

---

## 4.2 Snow (max +50)

| New Snow (in) | Points |
|---------------|--------|
| ≥ 8           | +50    |
| ≥ 5           | +38    |
| ≥ 2           | +22    |
| < 2           | +10    |

---

## 4.3 Base Depth (max +20)

| Base (in) | Points |
|-----------|--------|
| ≥ 40      | +20    |
| ≥ 30      | +14    |
| ≥ 20      | +7     |
| < 20      | +0     |

Note: Base depth is currently defaulted to 30 inches in `snowMetricsAdapter.ts`.

---

## 4.4 Temperature (max +10, min -20)

Uses **maxTempF only**.

| Max Temp (°F) | Points |
|---------------|--------|
| 20–32         | +10    |
| 10–19         | +0     |
| 33–38         | -5     |
| < 10          | -10    |
| > 38          | -20    |

`minTempF` is not used in scoring.

---

## 4.5 Wind (max 0, min -20)

| Max Wind (mph) | Points |
|----------------|--------|
| ≤ 10           | 0      |
| ≤ 20           | -5     |
| ≤ 30           | -10    |
| > 30           | -20    |

---

## 4.6 Weekend Penalty

| isWeekend | Points |
|-----------|--------|
| true      | -15    |
| false     | 0      |

---

## 4.7 Drive Penalty

If driveMiles missing → 0 points.

| Miles | Points |
|-------|--------|
| ≤ 50  | 0      |
| ≤ 80  | -5     |
| ≤ 110 | -10    |
| >110  | -20    |

---

# 5. Final Score Calculation

```
raw =
  20
+ snow
+ base
+ temp
+ wind
+ weekend
+ drive
```

Then:

```
score = round(clamp(raw, 0, 100))
```

---

# 6. Label Thresholds

Defined in:

```
labelForScore(score)
```

| Score | Label  |
|-------|--------|
| ≥ 80  | green  |
| ≥ 60  | yellow |
| < 60  | red    |

---

# 7. Per-Day Ranking

Defined in:

```
src/lib/weekOutlook.ts
```

Sorting priority:

1. Higher score
2. Label priority (green > yellow > red)
3. Resort name alphabetical

Top N per day selected (minimum 1).

---

# 8. Best Day Selection Across Week

Sorting priority:

1. Higher best resort score
2. Earlier date
3. Prefer weekday over weekend

---

# 9. Multi-Day Window Logic

Defined in:

```
src/lib/weekPlannerViewModel.ts
```

Current implementation:

- Take top 2 scoring days (sorted by score only).
- Window start = earliest selected day.
- Window end = latest selected day.
- No adjacency optimization.
- No stretch scoring.

---

# 10. Backup Resort Logic

Not score-based.

If drive distances available:
- Choose closest resort (excluding best overall).

Otherwise:
- Choose second resort in input list.

---

# 11. Worked Example

Given:

```
newSnowInches = 6
baseDepthInches = 30
maxTempF = 28
maxWindMph = 18
isWeekend = true
driveMiles = 75
```

Component breakdown:

```
Baseline     = 20
Snow         = +38
Base         = +14
Temp         = +10
Wind         = -5
Weekend      = -15
Drive        = -5
--------------------------------
Raw          = 57
Final Score  = 57
Label        = red
```

---

# 12. Explicit Non-Features

The following are not implemented:

- No continuous normalization
- No tunable weights
- No terrain/lift count influence
- No snowfall decay modeling
- No multi-day stretch optimization
- No crowd prediction beyond weekend penalty
- No live base depth ingestion

---

# 13. Files of Record

```
src/lib/confidence.ts
src/lib/snowMetricsAdapter.ts
src/lib/weekOutlook.ts
src/lib/weekPlanner.ts
src/lib/weekPlannerViewModel.ts
src/services/snow/*
src/data/resorts.ts
```

---

# Summary

This scoring system is:

- Deterministic
- Bucket-based
- Snow-dominant
- Temperature-aware (via maxTempF only)
- Penalized for wind, weekend, and long drives
- Not stretch-optimized

All values and thresholds are hard-coded in `confidence.ts`.
