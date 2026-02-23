# 🏂 Lift — Running in Development Mode

This document explains how to run **Lift** locally in development mode.

It covers:

- Verifying the Cloudflare Worker
- Running in browser (Vite dev mode)
- Running natively in iOS (Capacitor + Xcode)
- Clean rebuild workflow
- Common troubleshooting

---

# 1️⃣ Verify Cloudflare Worker (Production Proxy)

Before testing native mode, confirm the Worker is reachable and returning JSON.

## Worker Base URL

```bash
https://sweet-waterfall-ccaa.darrenthopkins.workers.dev
```

## Test basic upstream access (weather.gov)

```bash
curl -i "https://sweet-waterfall-ccaa.darrenthopkins.workers.dev/api/fetch?url=https://api.weather.gov"
```

Expected:
- HTTP 200
- JSON body
- `content-type: application/json`
- `x-proxy-*` headers present

If you see:
- HTML → proxy misrouting
- 429 → rate limited
- 5xx → Worker failure

Do not proceed with native testing until this succeeds.

---

# 2️⃣ Run in Browser (Fast UI Iteration)

Browser mode uses:
- Vite dev server
- Local `/api/fetch` proxy
- Hot module reload

## Install dependencies

```bash
npm ci
```

## Start dev server

```bash
npm run dev
```

Default URL:

```bash
http://localhost:5173
```

Browser mode:
- Fast reload
- No native bridge
- Does NOT test ATS or real device networking

Use this mode for UI changes.

---

# 3️⃣ Run in Native iOS (Production Networking Path)

Native mode uses:
- Capacitor
- Cloudflare Worker
- Real device networking
- ATS enforcement (HTTPS only)

---

## Step 1 — Build Web Assets

Optionally inject commit SHA:

```bash
export VITE_GIT_SHA=$(git rev-parse --short HEAD)
npm run build
```

---

## Step 2 — Sync Capacitor

```bash
npx cap sync ios
```

This copies built web assets into the native iOS project.

---

## Step 3 — Open Xcode Workspace

⚠️ Always open the workspace (Pods required):

```bash
open ios/App/App.xcworkspace
```

Do NOT open:

```bash
open ios/App/App.xcodeproj
```

---

## Step 4 — Run on Physical Device

In Xcode:

- Select your phone as the target
- Press ▶ Run

Native mode behavior:
- Uses `Capacitor.isNativePlatform()`
- Routes `/api/fetch` to Cloudflare Worker
- Validates HTTPS (ATS)
- Tests real LTE networking

---

# 4️⃣ Clean Native Rebuild (When Things Feel Stale)

If UI changes do not appear:

```bash
rm -rf ios/App/App/public
npm run build
npx cap sync ios
```

Then in Xcode:

```
Product → Clean Build Folder
```

Re-run.

---

# 5️⃣ Confirm Native Networking Path

To confirm native is using the Worker:

1. Turn off Wi-Fi (force LTE)
2. Pull to refresh
3. Confirm snow + NWS timestamps load
4. Confirm no "Ionic App" HTML is returned

If networking fails:
- Re-test Worker via curl
- Re-run `npx cap sync ios`
- Clean build folder in Xcode

---

# 6️⃣ Development Mode Differences

| Mode    | Proxy Used            | HMR | Tests ATS | Real Device Networking |
|----------|-----------------------|-----|-----------|------------------------|
| Browser  | Vite local proxy      | Yes | No        | No                     |
| Native   | Cloudflare Worker     | No  | Yes       | Yes                    |

---

# 7️⃣ Deterministic Dev Workflow

```bash
git checkout demo/ios-demo
git pull
npm ci
npm run dev
```

Before native testing:

```bash
export VITE_GIT_SHA=$(git rev-parse --short HEAD)
npm run build
npx cap sync ios
open ios/App/App.xcworkspace
```

---

# 8️⃣ Common Errors

## Worker returns HTML

Cause:
- Upstream blocked
- Proxy misconfigured

Fix:
- Test via curl
- Confirm allowed hosts list

---

## Tabs not updating in native

Cause:
- Assets not synced

Fix:

```bash
npm run build
npx cap sync ios
```

---

## NWS timestamp shows “—”

Cause:
- Worker returned unexpected JSON
- UpdatedAt extraction failed

Fix:
- Confirm Worker curl returns JSON
- Confirm updated fallback logic exists

---

# 9️⃣ Principles

- Always verify Worker first
- Always test LTE once before distribution
- Always sync before running native
- Never archive from Simulator
- Keep `demo/ios-demo` clean

---

# 🎯 Summary

Lift development intentionally separates:

Browser → fast iteration  
Native → production-accurate networking  

If the Worker works, native mode works.

If native mode works, distribution is safe.
