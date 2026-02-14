# Lift – Scoring & Resort Selection Model

This document explains how Lift currently:

1. Scores ski resorts
2. Selects candidate resorts
3. Produces final recommendations

This is intended to reflect the **actual implemented logic**, not aspirational design.

---

# 1. Data Inputs Used in Scoring

Lift aggregates the following inputs before scoring:

## Dynamic Inputs (Live-Fetched)

- Last 24–48 hour snowfall
- Next 24-hour forecast snowfall
- Base depth (if provided by source)

Source location:
```
src/services/snow/**
```

Normalization and shaping typically occurs before planning logic consumes the data.

---

## Static Inputs (Hard-Coded)

- Resort list
- Resort metadata (ID, name, region)
- Possibly geographic grouping or drive-time grouping

Likely located in:
```
src/lib/** 
or 
src/data/**
```

These are bundled with the app and version-controlled.

---

# 2. Current Scoring Model (As Implemented)

⚠️ This section should reflect what is actually in:

```
src/lib/**
```

Specifically look for:
- `buildWeekPlan`
- `buildWeekPlanViewModel`
- Any `score*` or weighting functions

---

## 2.1 Confirmed Elements (Based on Current Structure)

Lift appears to consider:

- Recent snowfall (last 24–48)
- Near-term forecast snowfall
- Base depth
- Possibly multi-day window optimization

The output type (example):

```
WeekDecision = {
  picks: Array<{
    dateISO: string;
    resortId: string;
    resortName: string;
    label: Label;
    score: number;
  }>;
  backup?: {...};
  window: {...};
  why: string[];
}
```

This confirms:

- Each resort/date combination receives a numeric score.
- A comparison step selects the highest-scoring option(s).

---

## 2.2 What Needs Verification in Code

Open:

```
src/lib/** (planner logic file)
```

Answer these precisely:

1. Is the score additive?
   - Example:
     ```
     score = (recentSnow * weightA)
           + (forecastSnow * weightB)
           + (baseDepth * weightC)
     ```

2. Are there thresholds?
   - Minimum snowfall?
   - Base cutoff?
   - Any “zero out if below X”?

3. Are weights configurable?
   - Hard-coded constants?
   - Environment-configured?
   - Inline magic numbers?

4. Is scoring per-day or per-window?
   - Does it evaluate each day independently?
   - Or evaluate a rolling 2–3 day window?

Once verified, document the actual formula here.

---

# 3. Resort Candidate Selection

Before scoring, Lift must determine which resorts are eligible.

This typically happens in one of two ways:

### Option A – Static Inclusion

All resorts in the hard-coded list are scored.

### Option B – Filtered Inclusion

Resorts are filtered by:

- Region
- Distance
- Availability of data
- Minimum snowfall threshold

To confirm:

Search:
```
rg -n "filter" src/lib
rg -n "resort" src/lib
```

Document whether:

- All resorts are always considered
- Only resorts with non-zero snowfall are considered
- Any geography logic exists

---

# 4. Current Selection Process

After scoring:

1. Resorts are ranked by score.
2. Top candidate(s) are selected.
3. Optional backup candidate is selected.
4. A human-readable “why” explanation is generated.

Verify in code:

- Is it `Math.max()`?
- Is it sorted descending?
- Are ties handled?
- Are adjacent-day wins merged?

---

# 5. What Is Real Right Now vs Conceptual

## Real (Implemented)

- Snow data aggregation
- View model output
- Numeric scoring
- Ranked pick selection
- iOS UI display

## Not Confirmed (Requires Code Inspection)

- Exact weight ratios
- Threshold logic
- Geographic filtering
- Multi-day optimization strategy

---

# 6. How to Audit the Current Model

To fully understand the live scoring model:

1. Open planner logic in:
   ```
   src/lib/**
   ```

2. Identify:
   - The function that returns `score`
   - Any constants defined at the top of file
   - Any conditional boosts or penalties

3. Document:
   - Exact formula
   - Exact weights
   - Any special-case logic

This ensures documentation matches behavior.

---

# 7. Recommendation

Once verified, replace Section 2.2 with:

- Exact formula
- Exact weights
- Explicit inclusion rules

This prevents architectural drift between code and documentation.

---

# README Link

Add to `README.md`:

```markdown
## Scoring & Selection Model

See [docs/scoring-and-selection.md](docs/scoring-and-selection.md)
```

---

**Status:** Document reflects current branch behavior.  
If scoring logic changes, this file must be updated in the same commit.
