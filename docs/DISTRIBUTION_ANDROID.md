# Lift — Android Architecture & Distribution Guide

This document covers the Android-specific architecture, build workflows, and Google Play distribution plan for the Lift app. Because Lift utilizes a shared hybrid architecture, the core UI and planner logic remain identical to iOS, but the native container, build tooling, and launch requirements are strictly tied to the Android ecosystem.

---

# 1. Android Stack Overview

While the application code (`src/`) is built via Vite, the Android platform requires specific tooling to wrap those web assets into an `.apk` or `.aab` (Android App Bundle).

*   **Capacitor Android (`@capacitor/android`):** The bridge layer that wraps the WKWebView equivalent (Android WebView) and exposes device capabilities.
*   **Gradle:** The build automation system used to compile the native Android shell.
*   **Android Studio:** The mandatory IDE for managing the Android project structure, SDK versions, and signing the app for Google Play.
*   **Google Play Console:** The distribution dashboard for managing internal tracks, closed betas, and public releases.

---

# 2. Canonical Build & Sync Flow

To package your shared web codebase into the Android project, use the standard Capacitor workflow. 

### Step 1: Build Web Assets
Ensure your Vite build output is up to date:
```bash
npm ci
npm run build
