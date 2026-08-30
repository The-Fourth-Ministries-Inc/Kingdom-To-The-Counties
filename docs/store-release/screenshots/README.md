# DRAFT App Store screenshots (iPhone 6.7-inch)

**DRAFT. Not submitted.** These files are listing assets for a human to upload
in App Store Connect. This repository never submits to the App Store.

## Size

| Field | Value |
| --- | --- |
| Apple display class (2026) | **6.9-inch Display** (this is the required iPhone slot) |
| File pixels | **1290 × 2796** portrait PNG |
| Why 1290×2796 | Classic **6.7-inch** size (iPhone 14 Pro Max / 15 Plus). Apple still lists it as an accepted portrait size inside the 6.9-inch class, alongside 1320×2868 and 1260×2736. |
| Color | Opaque sRGB RGB (no alpha / no transparency) |
| CSS viewport used | 430 × 932 at 3× |

Source: [App Store Connect screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications).

Upload these into the **6.9-inch Display** screenshot well. A 1290×2796 set
satisfies the iPhone screenshot requirement. Do not scale them.

## What each file shows

All shots are empty / honest. No Day PIN or Leader PIN is typed. No
`seedDemo()` content. No invented announcements, counts, miracles, names, or
guest lists. The thin Now/Next strip on in-app shots is the published Saturday
order of events evaluated against the clock — not a live announcement and not
field counts.

| File | What it shows | Source |
| --- | --- | --- |
| `iphone-6.7-1290x2796-01-day-pin.png` | Day PIN lock (`index.html` `#dayGate`). Name, team, and PIN fields empty. | Live public app (local empty stub is the fallback) |
| `iphone-6.7-1290x2796-02-privacy.png` | Public `privacy.html` (no PIN). | Live public page (local file is the fallback) |
| `iphone-6.7-1290x2796-03-resources.png` | Ambassador Resources hub. Static empty UI (pills at 0). | Local server + empty API stub (`dayPinSet: false` so the gate is not needed; payload has no people or posts) |
| `iphone-6.7-1290x2796-04-graphics.png` | Graphics for Sharing — real ministry artwork already in `assets/`. | Same local empty stub |

## How to regenerate

Playwright is not a production dependency.

```bash
npm i playwright
node scripts/capture-store-screenshots.mjs
```

Or `npm run capture:screenshots` after Playwright is installed. The script
starts a local static server, prefers the live public pages for the lock and
privacy shots, and stubs an **empty** API for inner pages so `seedDemo()` never
runs. It refuses to write a file if a PIN field is filled or known demo strings
appear.

Optional env:

- `K2C_LIVE_URL` — default `https://ambassadorcompanion.netlify.app`
- `K2C_CHROMIUM` — Chrome / Chromium executable
- `K2C_SHOT_PORT` — local static server port (default 8766)

## What this is not

- Not a store submit.
- Not review notes with a PIN (see `../reviewer-notes.DRAFT.md`).
- Not fabricated event-day content.
