# iOS Build Stability Contract

This document defines the deterministic iOS build policy for `ski-resort-snow-totals`.

This is an operational contract. Deviations must be intentional and documented.

---

## Versions (Known Good)

- Capacitor: 8.0.0
- Xcode: 15.x
- iOS Simulator: 18.0+

All `@capacitor/*` packages MUST be exact-version aligned.

Verify with:

```bash
npm ls @capacitor/core @capacitor/ios @capacitor/*
