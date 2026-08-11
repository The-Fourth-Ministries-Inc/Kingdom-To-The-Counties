# Working in this repo

Notes for anyone — human or AI — making changes here.

## Bump the version on every user-facing change

This app is a PWA that volunteers open on field signal, often on a phone that
has the old copy cached. Three things have to move together, in the same
commit, whenever you change the shell (`index.html`, `js/*.js`, `sw.js`) or
anything a volunteer sees:

1. **The version badge** in `index.html` — the `<span class="ver">` in the
   `.brand` header. This is the number a leader reads out when someone says
   "my app looks different from yours."
2. **The service worker cache name** in `sw.js` — `var CACHE = "k2c-vNN"`.
   Bump the number. The SW is network-first so fresh code wins when online,
   but the bump is what evicts the stale precache for phones that have been
   offline.
3. **The README** — if you added or changed a feature, update its section and
   the `(vX.Y.Z)` marker on that section's heading.

Use semver-ish judgement: patch for a fix, minor for a feature. Keep the badge,
the `sw.js` comment header, and the README markers **consistent with each
other** — they have drifted before (the badge sat at v1.10.0 while the README
said v1.12.0), and a version that lies is worse than no version.

## House style

- **No build step.** `index.html` carries all the CSS in one `<style>` block
  and all the page markup; `js/app-core.js` is plain ES5-flavoured JavaScript
  (`var`, string concatenation, `function`). Match the surrounding code —
  don't introduce arrow functions, template literals, or a bundler.
- **Design tokens, not hex codes.** Use the CSS custom properties defined at
  the top of the `<style>` block (`--ink`, `--cream`, `--card`, `--line`,
  `--muted`, `--rust`, `--wine`, `--good`, `--bad`, `--serif`, `--sans`,
  `--shadow`).
- **Tap targets are 44px minimum.** This is used outdoors, in gloves, in a
  hurry.
- **Escape everything** that reaches `innerHTML` with `esc()`. Ids get
  interpolated into `onclick="fn('...')"` attributes all over `app-core.js`,
  so `esc()` escapes both quote styles on purpose.
- **Writes go through `queueWrite()`**, which states the *final* value rather
  than a toggle, so a retry or two people acting at once lands on the same
  answer. Offline writes queue in the outbox and send themselves later.
  Leader-only actions must be listed in `OB_LEADER` (client) **and**
  `LEADER_ACTIONS` (`netlify/functions/data.mjs`).

## Never ship fabricated content

An offline or demo boot must not render invented announcements, issues, counts
or miracles. A phone in a dead zone once showed a seeded "Stay clear of the
crane zone" announcement that read as real. `seedDemo()` is confined to local
development (`isLocalDev()`); in the field an offline boot shows the last good
cached payload, or empty state. Do not add placeholder content that a
volunteer could mistake for a real instruction.

## Before you commit

- `npm test` — runs the syntax check across every JS file (including the
  inline block in `index.html`) plus the node test suite.
- If you changed the trailer, checklist or announcement UI, actually open it.
  Chromium is available and the app runs from `python3 -m http.server`; seed
  `localStorage.k2c_bins` from `data/bins.json` to get the real roster without
  a backend.
