Context: Ionic/Capacitor app. Goal: keep SwiftPM stable and only fix iOS delegate/build issues.

Environment:
- Capacitor iOS via SwiftPM (capacitor-swift-pm 8.0.0)
- Xcode 15.x
- iOS Simulator 18.0

Known landmines (do NOT revisit):
- No local SwiftPM overrides
- No package identity mismatch workarounds
- No manual pbxproj edits
- No ObjC runtime shims

Current status:
- xcodebuild for ios/App/App.xcodeproj succeeds
- AppDelegate forwards universal links via URL handler (no continue/restoration proxy overload call)
- Simulator install requires device booted (`simctl install` needs Booted state)

If something fails:
- Provide exact `xcodebuild` error lines with file:line:col
- Provide `rg -n "ApplicationDelegateProxy" -S ios node_modules vendor | head -n 120`
- Provide `capacitor.config.ts` webDir/server settings

