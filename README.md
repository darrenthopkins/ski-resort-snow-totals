# Lift

Lift is an Ionic + React + Capacitor iOS app that helps identify the best local ski day using recent snowfall, forecast data, and structured planning logic.

This repository contains the full web + native stack powering the demo build.

---

# What Lift Does

Lift combines:

- Recent snowfall (last 24–48 hours)
- Short-term forecast (next 24 hours)
- Per-day NWS weather bins (temp + wind)
- Structured scoring + week planning logic
- Drive-distance personalization
- Deterministic selection behavior

The result is a fast, explainable recommendation model that outputs:

- GO / WAIT / SKIP
- Ranked resorts per day
- A week-level plan
- Stable “Why” explanations

---

# Documentation Index

All major subsystems are documented in `/docs`.

## Core Architecture & Distribution

👉 **[ARCHITECTURE_AND_DISTRIBUTION.md](docs/ARCHITECTURE_AND_DISTRIBUTION.md)**  
Full system overview:
- React + Ionic structure
- SnowService data flow
- Planner pipeline
- Capacitor bridge
- TestFlight distribution model

---

## Scoring & Selection Model

👉 **[SCORING_AND_SELECTION.md](docs/SCORING_AND_SELECTION.md)**  
Defines:

- DayFacts construction
- Per-day weather bin usage
- Score calculation (0–100)
- GO / WAIT / SKIP thresholds
- Storm floor rules
- Drive penalty smoothing
- Anti-repeat resort logic
- Testing requirements

This is the canonical reference for product behavior.

---

## Development Workflow

👉 **[RUNNING_IN_DEVELOPMENT.md](docs/RUNNING_IN_DEVELOPMENT.md)**  
Step-by-step instructions for:

- Running in browser (Vite)
- Local API testing
- Cloudflare proxy validation
- iOS dev builds
- Deterministic workflow expectations

---

## iOS Build Stability & Rules

### Build Hygiene & Repo Rules
👉 **[IOS_BUILD_RULES.md](docs/IOS_BUILD_RULES.md)**  
Defines:

- CocoaPods usage constraints
- What must NOT be committed
- AppDelegate stability rules
- Native directory expectations
- Deterministic build guardrails

### Build Stabilization History
👉 **[IOS_BUILD_STABILITY.md](docs/IOS_BUILD_STABILITY.md)**  
Explains:

- Known iOS breakages encountered
- Fix patterns
- Stability guardrails
- Lessons learned for maintaining native consistency

---

## GPT Workflow Documentation

Lift uses structured GPT threads for feature isolation and deterministic iteration.

### Hero Card Workflow
👉 **[GPT_HERO_COMMANDS.md](docs/GPT_HERO_COMMANDS.md)**  
Defines:

- Hero thread boundaries
- Region-based editing rules
- Prompt structure
- Deterministic patch workflow

### Next Thread Template
👉 **[NEXT_THREAD_PROMPT.md](docs/NEXT_THREAD_PROMPT.md)**  
Template for launching new structured GPT threads:
- Scope declaration
- Constraints
- Required context
- Acceptance criteria

---

# Repository Structure

```
src/
  pages/                → Ionic pages (Snow, etc.)
  components/           → UI components
  services/snow/        → Snow providers (NWS, OnTheSnow, etc.)
  lib/
    confidence.ts       → Scoring engine
    snowMetricsAdapter  → SnowMetrics → DayFacts
    weekOutlook.ts      → Per-day ranking
    weekPlanner.ts      → Multi-day selection
    weekPlannerViewModel.ts → UI-ready transformation

ios/App/                → Native iOS project (Xcode)
docs/                   → All system documentation
capacitor.config.ts     → App identity + Capacitor config
```

---

# Development

## Fastest Iteration (Browser)

```bash
npm install
npm run dev
```

Best for:
- UI changes
- Planner logic
- Scoring tweaks
- Data modeling
- Unit tests

---

## iOS Simulator / Device

```bash
npm run build
npx cap sync ios
```

Then open `ios/App/App.xcworkspace` in Xcode and run.

Follow iOS rules in:

👉 docs/IOS_BUILD_RULES.md

---

# Testing & Determinism

Before committing:

```bash
npm run typecheck
npm run test.unit
npm run precheck
```

Tests must remain deterministic.

Scoring changes must be reflected in:

👉 docs/SCORING_AND_SELECTION.md

---

# Distribution (Demo-Oriented)

Recommended path:

1. `npm run build`
2. Sync Capacitor
3. Archive in Xcode
4. Upload to TestFlight

Full workflow:

👉 docs/ARCHITECTURE_AND_DISTRIBUTION.md

---

# Current State

- Per-day NWS weather bins integrated
- Storm floor rules active
- Smooth drive penalty
- Anti-repeat resort logic
- Deterministic scoring + unit tests passing
- iOS build stabilized under documented constraints

---

# Philosophy

Lift is intentionally:

- Deterministic
- Explainable
- Test-driven
- Architecturally conservative
- Iterated via structured GPT threads

All behavioral changes must be reflected in documentation.

If scoring or selection changes, update:

👉 docs/SCORING_AND_SELECTION.md
