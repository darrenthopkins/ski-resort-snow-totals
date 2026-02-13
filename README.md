# Lift

Lift is an Ionic + React + Capacitor iOS app that helps identify the best local ski day using recent snowfall, forecast data, and structured planning logic.

This repository contains the full web + native stack powering the demo build.

---

## What Lift Does

Lift combines:

- Recent snowfall (last 24–48 hours)
- Short-term forecast (next 24 hours)
- Base depth and resort metadata
- Structured scoring + week planning logic

The result is a clear, UI-ready recommendation model designed for fast decision-making.

---

## Architecture

Lift is built as a hybrid mobile app:

- **React + Ionic** — UI layer
- **Vite** — Dev server + production bundler
- **Capacitor** — Native bridge + iOS packaging
- **Swift / Xcode** — Native iOS container

For a full architectural breakdown, see:

👉 **[Architecture & Distribution Guide](docs/architecture.md)**

---

## Repository Structure

```
src/
  UI components and pages
  services/snow/      → Snow data providers + caching
  lib/                → Planner logic + view models

ios/App/              → Native iOS project (Xcode)
capacitor.config.ts   → App identity + Capacitor config
docs/architecture.md  → Full system overview
```

---

## Development

### Browser (Fastest Iteration)

```bash
npm install
npm run dev
```

Best for:
- UI changes
- Planner logic
- Snow modeling
- Rapid debugging

---

### iOS Simulator / Device

```bash
npm run build
npx cap sync ios
```

Then open in Xcode and run.

---

## Distribution (Demo-Oriented)

The recommended path for demo distribution is:

- Build production assets
- Archive in Xcode
- Upload to TestFlight (internal testing)

Full details are documented in:

👉 **[docs/architecture.md](docs/architecture.md)**

---

## Current State

- iOS bu
