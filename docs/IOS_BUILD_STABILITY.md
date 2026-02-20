# iOS Build Stability Contract

This document defines the deterministic iOS build and dependency policy for `ski-resort-snow-totals`.

This is an operational contract. Deviations must be intentional and documented.

---

# 1. Known Good Versions

- Capacitor: 8.0.0  
- Xcode: 15.x  
- iOS Simulator: 18.0+

All `@capacitor/*` packages MUST be exact-version aligned.

Verify alignment:

```bash
npm ls @capacitor/core @capacitor/ios @capacitor/*
```

If versions differ, fix before debugging native builds.

---

# 2. Repo Hygiene Rules

Never commit:

```gitignore
DerivedData/
*.xcresult
.dd/
ios/App/Pods/
*.bak.*
```

Never:

- Edit `project.pbxproj` manually
- Vendor Capacitor source unless plain files (no nested `.git`) or true submodule
- Demo from an untagged moving branch
- Configure signing on Pod targets

All Xcode changes must be reproducible via:

- `npx cap sync ios`
- Or documented, deterministic steps in this file

---

# 3. Canonical Build Flow

Build must be reproducible from a clean state.

---

## 3.1 SwiftPM (Mainline Default)

Used on:

- `main`
- `feature/*`
- `sprint/*`

Canonical build:

```bash
npm ci
npm run build
npx cap sync ios
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<SIM_ID>' \
  build
```

---

## 3.2 CocoaPods (Demo Escape Hatch)

Used only on `demo/*` branches when SwiftPM fails due to plugin API drift.

Canonical build:

```bash
npm ci
npm run build
npx cap sync ios
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<SIM_ID>' \
  build
```

IMPORTANT:

- When using CocoaPods, ALWAYS open `App.xcworkspace`
- NEVER build `.xcodeproj` when Pods are active

---

# 4. Dependency Manager Policy

## 4.1 Default: SwiftPM

Rationale:

- Single dependency resolver
- Cleaner CI
- Fewer drift vectors
- Aligns with modern Xcode workflows

SwiftPM is the architectural default.

---

## 4.2 Demo Escape Hatch: CocoaPods

Allowed ONLY when all are true:

- Build fails inside Capacitor plugin code (not app code)
- All `@capacitor/*` versions verified aligned
- DerivedData cleared
- SwiftPM caches reset
- `npx cap sync ios` rerun
- Time constraint requires deterministic unblock

CocoaPods use is operational, not architectural.

---

# 5. Deterministic Recovery Procedure

Before switching dependency managers, perform full reset:

```bash
rm -rf ios
rm -rf node_modules
rm -rf ~/Library/Developer/Xcode/DerivedData
npm ci
npx cap add ios
npm run build
npx cap sync ios
```

If SwiftPM still fails due to plugin API surface mismatch → only then switch to CocoaPods.

---

# 6. Switching to CocoaPods (Demo Only)

```bash
git checkout -b demo/ios-pods
rm -rf ios
npx cap add ios --packagemanager Cocoapods

npm ci
npm run build
npx cap sync ios
npx cap open ios
```

Verify CocoaPods integration:

```bash
ls ios/App/Podfile ios/App/App.xcworkspace && echo "Pods OK"
```

In Xcode:

- Open `App.xcworkspace`
- Enable automatic signing on **App target only**
- Select correct Team
- Do NOT configure signing on Pod targets

---

# 7. Switching Back to SwiftPM

After demo:

```bash
git checkout main
rm -rf ios
npx cap add ios

npm ci
npm run build
npx cap sync ios
```

Verify canonical SwiftPM build passes.

---

# 8. Tag Every Demo

After successful archive/upload to TestFlight:

```bash
git tag demo-stable-<YYYY-MM-DD[-HHMM]>
git push origin demo-stable-<YYYY-MM-DD[-HHMM]>
```

Never demo from a moving branch without tagging.

Tags are the immutable source of truth for shipped builds.

---

# 9. Operational Principles

- SwiftPM is the default.
- CocoaPods is a time-sensitive escape hatch.
- Builds must be reproducible from a clean checkout.
- Version alignment is mandatory.
- Native drift must be reversible.
- Tags are required for demo traceability.

If behavior conflicts with this document, fix the repo to comply.
