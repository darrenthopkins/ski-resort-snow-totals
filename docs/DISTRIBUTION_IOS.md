# iOS Distribution Plan (Demo-Oriented)

## Recommended: TestFlight (Internal Testing)

### Steps

1. Build production assets:

```bash
npm run build
npx cap sync ios
```

2. In Xcode:
   - Archive
   - Distribute
   - Upload to TestFlight

3. Add testers in App Store Connect
4. Share TestFlight link


**Status:** iOS build stable (Xcode 15.x / iOS 18 sim)  
**App Display Name:** Lift  
**Vitest excludes:** `vendor/**`, `.dd/**`
