# Kingdom To The Counties — Ambassador Companion

A lightweight, no-login companion app for K2C ambassadors. Everyone shares one
live view: checklist, announcements, check-ins, headcount, praises, and feedback
all stay in sync across phones within a few seconds.

## How it works

- **`index.html`** — the entire app (front end).
- **`assets/`** — images, the counselor booklet PDF, and self-hosted fonts. These
  used to be base64-embedded in `index.html` (which made it ~3 MB); keeping them
  as separate files keeps the page small and lets the browser cache them.
- **`netlify/functions/data.mjs`** — the sync backend, built on [Netlify Blobs](https://docs.netlify.com/blobs/overview/). All phones read and write one shared record in the cloud.
- **`netlify.toml`** — tells Netlify where the site and functions live.
- **`package.json`** — lists the `@netlify/blobs` dependency.

## Ambassador Quick Capture (v1.7.0)

Under **Ambassador Resources → 📇 Quick Capture** (also one tap from the Event
Day page): a frictionless way for ambassadors on the street to capture an
encounter and move on, in one of **three lanes** — 📷 a photo of a filled-out
physical contact card, 🎙️ a recorded voice note, or ⌨️ a typed entry. Pop-up
reminders enforce the minimum the follow-up team needs: **name, contact info
(phone or email), and notes on the encounter** — typed entries require all
three; card-photo and voice-note submissions get a "does your photo/recording
cover these?" confirmation instead, so nothing blocks a fast capture.

Captures sync to the shared backend (destined for Planning Center Online — the
CRM push is a later build). Privacy & resilience:

- The polling payload only carries a **count** — the records themselves (names,
  phones, emails, notes) are fetched with the **leader PIN** (`capturesList`),
  and photo/audio blobs are stored per-capture and fetched on demand
  (`captureMedia`). Leaders can review, listen/view, **export a CSV**, and
  delete captures once they're entered into Planning Center.
- No signal? Captures queue in the phone's local storage and **auto-send when
  the app is back online** (server-side idempotency means a retry can't
  double-submit). The "Captured from this phone" list shows sent/waiting state.
- Photos are downscaled client-side (≤1400 px JPEG) and voice notes cap at 3
  minutes so submissions stay field-signal friendly.
- Captures **survive the end-of-day reset** — like praises, they're not
  day-scoped data. (Issues are day-scoped and DO clear on reset as of v1.10.0.)
- **Storage meter + purge (v1.7.1):** the Leader Dashboard shows a live
  "Quick Capture storage" bar — the backend tracks exactly how many bytes
  capture media is using against a budget (default **1 GB**, override with a
  `CAPTURE_BUDGET_MB` environment variable on Netlify). At **80%** a warning
  appears in the dashboard; at **95%** it goes mission-critical, and once the
  budget is full new photo/voice attachments are refused server-side (typed
  info still saves, with a note flagging the dropped media). A **🧹 Purge all
  exported captures** button — behind a type-PURGE confirmation *and* the
  leader PIN (the confirmation is a speed bump in the browser; the leader PIN
  is the real gate and is verified server-side)
  — permanently deletes every capture record and media blob once leadership
  confirms it has all been entered into Planning Center Online.

## Pre-Crusade Mobilization (v1.8.0)

Its own bottom tab: the **season-long church CRM** — a master list of NH (and
interested out-of-state) churches and ministries, built for collaborative
outreach from ambassadors' phones. Ships pre-seeded with the Carroll County
(King Pine) contact list — 22 churches + 3 ministries, tiers, verified emails,
and each church's **personalized outreach email** (intro + specific referral
ask) from the research doc.

- **Per church:** address, town, county, state, phone, email, website, primary
  contact, pastor/leader, alignment badge (✅ strong / 🟡 verify), pop-up
  notes, a 1–5 ⭐ **interest score**, and the list of team **connections**
  ("my aunt is a member") so everyone can see who knows whom.
- **Tap-to-reach, auto-logged:** 📞 Call / 💬 Text / ✉️ Email buttons log to
  that church's history the moment they're tapped. The Email button opens the
  phone's mail app **pre-filled with the personalized email** for that church
  (subject, intro, core message, their referral ask, promo video, sign-off).
- **Share toolkit:** a 20-second "What is K2C?" script (Great-Commission
  elevator pitch — copying it logs to the church's history), copy-the-email
  for Facebook/website forms, promo-video link, and one-tap jumps to Graphics,
  the Playbook, the Counselor Booklet and the Give page.
- **Dashboard:** stat tiles (on the list / engaged / connected / still cold)
  plus a "🚨 Need a connection ASAP" queue — strong-fit churches nobody knows
  and nobody has touched.
- **Vision flags:** any ambassador can flag a church as not aligned
  (non-traditional-marriage promotion, heavy politics, heresy…). The flag
  warns the whole team to hold outreach; clearing it is leader-only.
- **Change log:** every add, edit, call, text, email, share, score and flag —
  newest first, with names — doubles as each church's history.
- **Permissions:** everything sits behind the **Day PIN** (whole-app gate).
  Ambassadors can add churches, log outreach, claim connections, score
  interest and flag; **editing/deleting master-list entries is leader-PIN
  only** (enforced server-side).
- **Fast on mobile:** the roster is *not* in the 5-second polling payload — it
  lives in its own blob with a `rev` counter and its own ETag endpoint
  (`GET ?part=churches`), is re-downloaded only when the rev changes, and the
  last good copy is cached in localStorage so the tab opens instantly even
  offline. Starter churches self-seed on first read and deleted ones are
  tombstoned (same pattern as starter scripts). The CRM **survives the
  end-of-day reset** — it's season-long relationship data.

## Miracle Tracker (v1.12.0)

Under **Post → 🙌 Miracle Tracker**: one centralized, season-long record of
what God is doing across all eight counties — **salvations, rededications,
healings**, and anything else — that anybody behind the Day PIN can feed and
everybody can see live.

- **Reporting is frictionless:** pick the type, optionally add the person's
  name (optional *on purpose* — nobody is pressured to be named), describe
  what happened, sign it as the reporter. Reports queue offline through the
  same persistent outbox as everything else.
- **Validation is the biblical standard** — *"by the testimony of two or three
  witnesses every matter shall be established"* (Deuteronomy 19:15,
  2 Corinthians 13:1). A report sits in **⏳ Awaiting witnesses** until **two
  other people** tap "🤝 I witnessed this too"; only then does it join the
  confirmed tally, the per-type season counts, and the leader dashboard.
- **What counts as a witness is enforced server-side**, not in the browser:
  the reporter's own name never counts (their report *is* their testimony),
  the same person counts once no matter the casing, and the reporting phone's
  device id counts for nobody — so two confirmations really are two different
  people on two different phones. Any teammate or leader can validate;
  multiple leaders naturally can.
- **Season-long by design:** the `miracles` blob is not county-scoped and
  survives the end-of-day reset, so half-confirmed reports keep their
  witnesses and October's "what did God do this season?" has one answer in
  one place. Each report is stamped with the county it happened in.
- **Removing a report is leader-PIN only** (server-enforced), so a stray
  thumb can't erase a testimony.

## Recording Studio (Teleprompter)

Under **Ambassador Resources → 🎬 Recording Studio**: invite-video scripts for
every county, each with a due date and assignee, opening into a full-screen
camera teleprompter (adjustable font/speed, 3-2-1 countdown, in-browser
recording, save/share). Viewing and recording is open to anyone past the Day
PIN; **adding/editing scripts, due dates, and assignees is leader-PIN only**
(that's Laura's board). After recording, the app reminds the filmer to save the
video and send it to Laura, then mark the script ✅ done with their initials.

An empty board shows leaders a **Load starter scripts** button that seeds A/B/C
scripts for all counties (Sullivan ships with `[DATE]`/`[VENUE]` placeholders —
edit once confirmed).

The script editor (v1.7.0) is dropdown-driven — no typing county/venue strings:
the **county/event** is a dropdown of all 8 counties (plus "Other / custom"),
the **assignee** is a dropdown of the leader roster (plus "Other…" for anyone
else), and a **template picker offers 10 versions of every script** (Come As
You Are, Logistics/Urgency, Pain Point/Hope, Personal Testimony, Family & Kids,
For the Skeptic, Come Back Home, Young Adults, Bring Someone, Final Call) that
fill the title + body with the chosen county's date and venue — and every
generated script stays fully editable.

Every phone re-reads the shared state every 5 seconds (re-rendering only when
something actually changed), so updates show up for everyone within a few
seconds. No accounts, no separate database to set up — Netlify enables Blobs
automatically on deploy.

## Security & data model (v20)

- **Leader PIN is verified server-side** on every privileged action (checklists,
  announcements, event/day-PIN/funding settings, reset, script editing). Rotate
  it by setting a `LEADER_PIN` environment variable in Netlify and redeploying —
  the code fallback is only used when the variable is unset.
- **The Day PIN is never sent to clients.** The API only reports whether one is
  set; entered PINs are verified server-side.
- **PIN guessing is rate-limited.** 15 wrong PIN entries in 10 minutes from one
  IP blocks further PIN checks (HTTP 429) until the window slides past. Empty
  PINs never count and a correct leader PIN clears the record, so shared event
  WiFi and morning-huddle typos won't lock real volunteers out.
- **The Recording Studio board self-seeds.** Starter scripts for all 8 counties
  are merged into the shared board on read, so every user sees every county
  without a leader having to seed anything; a script a leader deletes is
  tombstoned and stays deleted.
- **Storage is split by domain** (`core`, `checkins`, `io`, `prompter`, plus one
  `count-<device>` / `tally-<device>` shard per phone) so concurrent writes can't
  clobber each other. Old single-blob data migrates automatically on first read.
- **Shared blobs use compare-and-swap.** Every read-modify-write on `core` and
  friends re-reads the current value + etag and writes only-if-unchanged,
  retrying on a conflict. Two leaders toggling different checkmarks at the same
  instant both stick (the pre-v20 last-write-wins was the cause of checkmarks
  that "only occasionally" saved).
- **Every tap-frequency write goes through a persistent outbox (v1.10.0).**
  Checkmarks, item notes, acknowledge-&-hide, Tech I/O patch rows, radio
  checkouts, check-ins, praise posts, issue reports, announcements and
  comments are queued in `localStorage` and retried with backoff until the
  server confirms — a failed request delays the write instead of silently
  dropping it, and the queue survives a reload or closed tab. Queued writes
  are re-applied on top of every incoming poll, so the background sync can
  never visually "undo" work that hasn't flushed yet (the bug behind
  volunteers' checkmarks disappearing — and acknowledged issues reappearing —
  even on a working connection). The sync pill shows how many changes are
  still waiting to send.
- **Every queued action is idempotent, so retries are safe.** Set-style writes
  (`setCheck`, `setAck`, `setRadio`, `ioSetRow`) carry the explicit FINAL
  state — a retry that already landed, or two people doing the same thing at
  once, is a no-op rather than a re-toggle. Add-style writes (check-ins,
  praise, issues, announcements, comments) carry a client-generated id the
  server dedupes on, so a retry can't create duplicates. (The old
  toggle-style `toggleCheck`/`ackCard`/`radioToggle` actions remain server-side
  for phones still running an older client.)
- **Tech I/O patch checkmarks are merged per-row (v1.10.0).** A checkbox tap
  sends just that row's state (`ioSetRow`) and the server merges it into the
  stored roster — the previous design uploaded the whole roster per tap
  (last-write-wins), so two techs patching simultaneously erased each other's
  checkmarks. Wholesale `setIOList` is still used for structural edits
  (edit list / reload defaults), which are single-leader operations.
- **The Day PIN and the active county follow the schedule (v1.11.0).** The Day
  PIN is simply the event's Saturday as `MMDD` (Jul 25 → `0725`). An event stays
  current **through its Sunday** — so a rain-date Sunday keeps the same PIN and
  the same board — and the next county takes over on the **Monday following**.
  Nobody has to set anything between events. Dates live in `SCHEDULE` in
  `data.mjs` (keep in step with `COUNTIES` in `js/counties.js`) and roll over on
  New Hampshire time, not UTC, so the change never lands mid-teardown. Leaders
  see the live PIN and exactly when it rolls over in the dashboard; volunteers
  never receive it. Either can be pinned by hand and switched back to automatic.
- **Each county is its own board (v1.11.0).** A leader picks the current county
  in the dashboard; every day-scoped blob is namespaced per county
  (`core~carroll`, `checkins~carroll`, `count-agg~carroll`, per-phone tally and
  decision shards, …). Switching counties swaps checklists, check-ins, counts,
  decisions, radios, issues, announcements and I/O progress in one write — so
  **reset is no longer needed between events**, and the previous county's work
  stays exactly where it was. Season-long data (church CRM, teleprompter
  scripts, Quick Captures, season summaries, backups) is deliberately NOT
  scoped, and neither is the **Day PIN** — one PIN for the whole season, stored
  in its own blob. With no county selected, the original unscoped keys are used,
  so existing deployments behave exactly as before; the first county switch
  adopts that in-progress board as the chosen county's data rather than
  stranding it.
- **Destructive actions snapshot first (v1.10.0).** Reset and capture-purge
  copy the data they're about to destroy into a `backup-<timestamp>-<tag>`
  blob (newest 20 kept) before clearing anything. There's no in-app restore;
  recovery is copying a backup's contents back over the live blobs via the
  Netlify Blobs UI or CLI. Reset clears checklists, check-ins, counts,
  announcements, radios **and issues** (praises, captures, the church CRM,
  event info, Day PIN, funding and the I/O roster structure survive).
- **The head count is O(1) to read.** Taps still land in per-phone shards (never
  lost), but a cached `count-agg` blob is kept in sync incrementally, so a `GET`
  reads one blob instead of listing + fetching every device shard. It rebuilds
  itself from the shards whenever it goes missing, so it can't be wrong for long.
- **Counter taps are pushed as absolute per-phone tallies (v1.6.0).** Each phone
  keeps its own running tally in `localStorage` and pushes the whole thing
  (`tallySet` → `tal2-<device>` shard): "my total is N, split by name". A retried
  request can't double-count and a dropped one can't lose taps — the next push
  carries them, even across a page reload. A leader reset rotates a `tallyEpoch`
  so phones holding a pre-reset tally clear it instead of re-pushing old numbers.
  (Legacy `count-`/`tally-` delta shards from older clients still sum in.)
- **Polls are cheap.** `GET` returns a weak `ETag`; clients send `If-None-Match`
  and get a bodyless `304` (and skip re-rendering) whenever nothing changed.
- **The Day PIN is enforced server-side (v1.10.0).** Every request carries the
  Day PIN (or a leader credential); without one, `GET` returns only enough to
  draw the lock screen, `?part=churches` is refused, and every write is
  rejected. Before this the PIN only gated the browser UI — the API itself was
  open to anyone with the URL. Sites that have not set a Day PIN stay open, as
  before.
- **Leaders hold a revocable session token, not the PIN.** `verifyLeaderPin`
  issues a random token (14h TTL) that the phone stores and sends; the PIN
  itself is never persisted. `revokeLeaderTokens` signs every leader out at
  once (lost phone, PIN shared too widely).
- **Per-IP write budgets.** Non-leader writes are capped (400 / 10 min) and
  media uploads more tightly (40 / hour), reusing the PIN-throttle blob
  pattern. Captures at the 1000-record ceiling are **refused** (HTTP 507) so
  the oldest irreplaceable contacts are never silently evicted; the phone
  keeps the record queued and says storage is full.
- **User-submitted content is normalized server-side** — feedback, praise,
  announcements, check-ins and comments have their fields whitelisted, lengths
  capped, and `priority`/`pri` validated against a fixed set. Clients can't
  inject markup through a priority class or pre-set a report as acknowledged.
- **`sw.js`** is a network-first service worker: online behavior is identical to
  having no cache (fresh deploys always win), but if the field signal drops the
  app shell, fonts, and images still load.

## Hosting (Netlify)

This repo is set up for automatic deploys: connect it to a Netlify site and
every push to `main` rebuilds and publishes the site.

1. In Netlify: **Add new site → Import an existing project → Deploy with GitHub**
2. Pick this repository.
3. Build settings come from `netlify.toml` (publish `.`, functions `netlify/functions`).
4. Deploy.

## Checking it's live

Open the site and look at the little pill near the top:

- **"Live — synced to everyone"** = working
- **"Demo mode — deploy to sync"** = the function isn't reachable yet

## Local development

Requires [Node.js](https://nodejs.org). Then:

```bash
npm install
npx netlify dev
```

### Code layout

The app still has **no build step** — the browser loads plain ES5 scripts in
order, all sharing globals, exactly as when everything lived inline. The three
big script blocks were split out of `index.html` so each is editable on its own:

| File | What's in it |
| --- | --- |
| `js/app-core.js` | sync layer & outbox, checklists, counters, radios, Tech I/O, boards, dashboard, Quick Capture |
| `js/counties.js` | shared county roster + Recording Studio / teleprompter |
| `js/mobilize.js` | Pre-Crusade Mobilization church CRM |

Order matters (`app-core` → `counties` → `mobilize`); they are listed at the
bottom of `index.html` and precached in `sw.js`. When adding a file, add it to
both.

### Tests

```bash
npm test
```

Runs two things, neither needing a network or a Netlify account:

1. **`npm run check:syntax`** — parses every shipped script (`js/*.js`,
   `netlify/functions/*.mjs`, `scripts/*.mjs`, `sw.js`), every inline block in
   `index.html`, and verifies each `<script src>` the page references exists.
   With no build step this is the only thing standing between a typo and a
   phone in a field.
2. **`node --test test/`** — unit tests over the server-side normalizers plus
   an integration test that drives the real request handler against an
   in-memory blob store (per-county isolation, shared Day PIN, season-long
   data, reset scoping). Normalizer coverage: id
   sanitization, URL scheme filtering, field whitelisting, clamping, tombstones
   and the legacy tally conversion. These encode rules the rest of the app
   relies on — e.g. if `idStr` stopped stripping quotes, the `onclick`
   handlers in the client would become injectable again.

## Contributing

Push changes to a branch and open a pull request, or commit to `main` to deploy.
