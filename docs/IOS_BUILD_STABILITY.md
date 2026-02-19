# iOS Build Stability Contract

## Versions
- Capacitor: 8.0.0
- Xcode: 15.x
- iOS Simulator: 18.0+

## Rules
- Do not commit `.dd/`, `DerivedData/`, `Pods/`, or `.xcresult`.
- Do not edit `project.pbxproj` by hand.
- Do not vendor Capacitor source unless it’s plain files (no nested .git) or a real submodule.
- Canonical build flow:
  ```
  npm run build
  npx cap sync ios
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,id=<SIM_ID>' build
  ```

---

# iOS Dependency Manager Policy

## Default: SwiftPM (Mainline)

Mainline branches (`main`, `feature/*`, `sprint/*`) use **SwiftPM** for Capacitor iOS integration.

Rationale:
- Single dependency resolver
- Cleaner CI
- Fewer moving parts
- Aligns with modern Xcode workflows

---

## Demo Escape Hatch: CocoaPods

If SwiftPM breaks due to plugin API surface mismatches (e.g., `StatusBarPlugin`, `PluginConfig.getString`, `UIColor.fromHex` vs `argb`, etc.), a `demo/*` branch may switch to **CocoaPods** strictly to unblock a time-sensitive build.

This is an operational escape hatch — not a permanent architecture decision.

---

## When to Switch to CocoaPods

Switch only if ALL are true:

- Build fails inside Capacitor plugins (not app code)
- JS versions are confirmed aligned (all `@capacitor/*` same version)
- DerivedData + SwiftPM caches were reset
- `cap sync ios` was rerun
- Time constraint requires deterministic unblock

---

## How to Switch (SwiftPM → CocoaPods)

On a `demo/*` branch only:

```bash
git checkout -b demo/ios-pods
rm -rf ios
npx cap add ios --packagemanager Cocoapods

npm run build
npx cap sync ios
npx cap open ios
```

Confirm CocoaPods integration:

```bash
ls ios/App/Podfile ios/App/App.xcworkspace 2>/dev/null && echo "Pods OK"
```

In Xcode:
- Open `App.xcworkspace`
- Select **App target**
- Enable automatic signing
- Select Team
- Do NOT configure signing on Pod targets

---

## Switching Back to SwiftPM

After demo:

```bash
git checkout main
rm -rf ios
npx cap add ios

npm run build
npx cap sync ios
```

Re-verify build via canonical commands.

---

## Repo Hygiene

`.gitignore` must include:

```gitignore
DerivedData/
*.xcresult
.dd/
ios/App/Pods/
*.bak.*
```

---

## Tag Every Demo

Once iOS builds successfully for demo:

```bash
git tag demo-stable-<date>
git push origin demo-stable-<date>
```

Never demo from a moving branch without tagging.

---

## Summary

SwiftPM is the default.

CocoaPods is allowed on demo branches when SwiftPM plugin API drift blocks iOS builds.

Revert back to SwiftPM after demo unless a formal decision is made.
