# iOS Build Stability Contract

## Versions
- Capacitor: 8.0.0
- Xcode: 15.x
- iOS Simulator: 18.0+

## Rules
- Do not commit `.dd/`, `DerivedData/`, `Pods/`, or `.xcresult`.
- Do not edit `project.pbxproj` by hand.
- Do not “vendor” Capacitor source unless it’s plain files (no nested .git) or a real submodule.

## Canonical build
npm run build
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,id=<SIM_ID>' build

