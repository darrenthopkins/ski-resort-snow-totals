# Lift – App Review Notes

## Overview

Lift is a ski day planning application that aggregates recent snowfall and weather forecast data to help users identify the best nearby ski day.

The app displays:
- A daily snow score
- Recent snowfall totals
- Forecast data
- Nearby ski resorts sorted by distance

There is no account system and no user-generated content.

---

## Login Requirements

No login or account creation is required.

All functionality is available immediately after launch.

---

## Location Usage

Lift requests optional location access in order to:

- Calculate distance to nearby ski resorts
- Sort resorts by proximity

If the user denies location permission:
- The app defaults to a predefined regional location.
- All core functionality remains available.

---

## Data Usage

Lift consumes publicly available weather and snowfall data from third-party providers.

The app:
- Does not collect personal user data
- Does not store user data remotely
- Does not require analytics accounts

No sensitive data is transmitted.

---

## How to Test

1. Launch the app.
2. (Optional) Allow location permission.
3. Use the horizontal day selector to switch between days.
4. Observe that:
   - The Snow Score updates per day
   - Resort rankings adjust based on forecast and distance
5. Open the location selector to confirm proximity-based sorting.

There are no hidden features, subscriptions, or gated content.

---

Thank you for reviewing Lift.
