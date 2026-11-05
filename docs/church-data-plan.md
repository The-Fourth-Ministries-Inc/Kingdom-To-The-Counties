# Church data plan: live Pre-Crusade list, safe bot writes, partner tracking

**Status:** proposal for Zach's approval. Nothing in this document has been
built, migrated or changed. No production data was written while preparing it.

**Audit date:** 12 Oct 2026. Live numbers come from one read-only
`GET ?part=churches` against production (the same request a phone makes when
the Pre-Crusade tab opens). No pastor names or contact details appear in this
document. It reports counts only.

---

## TL;DR

- **Today:** the whole church list, its activity log and the outreach templates
  live in **one JSON blob** (`churches`) in the Netlify Blobs store
  `k2c-ambassador`. Edits made in the app do reach everyone within a few
  seconds, and the server uses compare-and-swap so two writes can't silently
  erase each other. But there are **no backups**, **no field history**, **hard
  caps that silently drop data** (800 churches, newest 1,200 log entries),
  **no way for a bot to write**, and two of the last church additions were
  made by **editing a seed file and redeploying**.
- **Recommendation:** move the church data into **Supabase Postgres**, behind
  the **same Netlify function** the web app and native apps already call. The
  response shape stays the same, so no app build is needed for the switch.
  Everything else in the app stays on Netlify Blobs.
- **Bot API:** a new `POST /api/churches/v1/import` endpoint with its own API
  key per bot, a dedup key built from the normalized church name and town,
  "fill blanks, never overwrite people" upsert rules, `dryRun`, idempotency,
  rate limits, and a per-record audit trail.
- **Partner tracking:** add partner level (Praying, Partner, Covenant/Host),
  date committed, tier checklist, commitments, pastor needs, how we're serving
  them, next step and due date, owner, follow-up contact, denomination and size,
  plus a **"N / 100 partner churches"** counter.
- **Scout:** keep researching, but **pause writing into the app** until the
  import endpoint exists. Stage records as daily JSONL in the exact import
  shape, somewhere private. This repo is public.

---

## 1. Where church data lives today

### 1.1 Code paths

| Piece | Where | What it does |
|---|---|---|
| Client list and detail UI | `js/mobilize.js` | Renders the list (50 rows at a time), the detail page, the add form, the leader edit form, CSV export and templates. Keeps the last good copy in `localStorage.k2c_churches`. |
| Client read | `chFetch()` in `js/mobilize.js` | `GET {API}?part=churches` with `If-None-Match`. Runs only when the Pre-Crusade tab or a church card is open, and again whenever the main poll reports a new `churchesRev`. |
| Client writes | `chAction()` → `apiPost()` | Optimistic: applies the change locally, POSTs `{action, payload, pin, dayPin}`, then re-fetches the roster. Only `churchLog` (call/text/email/note taps) goes through `queueWrite()` and the offline outbox. Every other church action refuses to run offline. |
| Server | `netlify/functions/data.mjs` | `GET ?part=churches` returns the whole blob. POST actions: `churchAdd`, `churchLog`, `churchConnect`, `churchInterest`, `churchFlag` (any Day-PIN holder); `churchEdit`, `churchDelete`, `churchFlagClear`, `churchTemplate` (leader only, listed in `LEADER_ACTIONS`). |
| Native apps | `netlify/functions/mobile-data.mjs`, `scripts/prepare-mobile.mjs` | The Capacitor build sets `K2C_API_ORIGIN` to `MOBILE_API_ORIGIN` (default `https://ambassadorcompanion.netlify.app`) and `K2C_API_PATH` to `/.netlify/functions/mobile-data`. That function only adds CORS for `capacitor://localhost` and friends, then calls the **same** `data.mjs` handler. **Verified:** native apps already read live data from the server. |
| Storage | Netlify Blobs, store `k2c-ambassador`, key `churches` | `{rev, removed, list, log, tpl}`. Opened with `consistency: "strong"`. Deploy previews use a separate store (`k2c-ambassador--<context>--<branch>`), so previews can't touch production. |
| Seed lists | `netlify/functions/starter-churches.mjs` (25 hand-written Carroll County entries) and `starter-churches-statewide.mjs` (389 entries from the Notion "K2C Statewide Church Outreach" tracker) | **414 seed churches, about 145 KB.** Merged into the blob on every roster read if their id is neither present nor tombstoned. |

### 1.2 Live numbers (verified 12 Oct 2026)

| Fact | Expected | Measured |
|---|---|---|
| Churches and ministries | ~417 | **417** (409 churches, 8 ministries) |
| Log entries | ~279 | **279**, dated 17 Jul to 4 Sep 2026 |
| Payload size | ~240 KB | **240,473 bytes** (list about 193 KB, log about 47 KB) |
| Blob store | `site:k2c-ambassador` | **`k2c-ambassador`** (confirmed in code: `const STORE = "k2c-ambassador"`) |
| `rev` | — | 359 |
| Tombstones (`removed`) | — | 0 (nobody has deleted a church yet) |
| Added in the app, not from seed | — | 3 |
| Seed rows edited in the app | — | 21 |
| Churches with a "we know someone" connection | — | 4 |
| Flagged | — | 1 |
| Leader-edited templates | — | none (built-in defaults in use) |

Log entries by type: 213 notes, 27 edits, 13 emails, 8 interest scores,
5 texts, 4 connections, 3 adds, 3 conversations, 2 calls, 1 flag.

The Notion brief's figures (417 entries, 3 "We've talked", 1 flagged) match.

### 1.3 Do edits persist for everyone, and how fast?

**Yes, for everyone, within seconds.**

1. The editing phone shows the change immediately (optimistic local apply).
2. The server writes the blob with compare-and-swap, usually in well under a
   second, and bumps `rev`.
3. Every phone polls the main payload: every **2.5 s** on the Pre-Crusade tab
   or a church card, 1.2 s on a few live pages, 5 s elsewhere. The payload
   carries `churchesRev` only. A phone on the Pre-Crusade tab sees the new rev
   and re-downloads the roster. Other phones pick it up next time they open the
   tab.
4. Offline phones keep showing their cached copy. Only `churchLog` taps queue
   in the outbox. Adds, edits, connections, interest and flags show "No
   connection — try again".

### 1.4 Risks found

**Data loss**

- **Silent cap of 800 churches.** `normChurches()` keeps only the first 800 of
  `list` on every read and write, and `churchAdd` does
  `c.list.push(rec); c.list = c.list.slice(0, 800)`. The 801st church is
  dropped, but its "add" log entry is still written and the API still answers
  `{ok:true}`. 383 more adds hit the cap, and a daily bot gets there quickly.
- **Silent cap of the newest 1,200 log entries.** `chLogPush()` and
  `normChurches()` keep only `log.slice(-1200)`. When that fills, the oldest
  entries vanish, **including 🗣️ conversation records**. "We've talked" is
  computed from those records (`chLastEngage()`), so a church can silently flip
  back to "Don't know anyone yet". Each bot add also writes a log entry, which
  speeds this up. Smaller caps: 40 connections per church, 500 tombstones.
- **No backups of the church blob.** `snapshot()` runs only before `reset`,
  `capturePurge` and Tech I/O template/restore. The CRM is never snapshotted,
  and Netlify Blobs has no built-in versioning or point-in-time restore.
  `churchDelete` is a hard delete. Today the only copies are whatever phones
  have cached in `localStorage` and any CSV someone exported.
- **No field history.** A leader edit logs "Details updated" with no before or
  after values. If a phone number gets overwritten, the old one is gone.

**Overwrite and concurrency**

- **Whole-blob writes, but safe ones.** Every action rewrites the full 240 KB
  blob through `compareAndSwap()` (`onlyIfMatch` etag, up to 30 retries with
  jittered backoff, plus a re-read check against duplicate appends). Two
  simultaneous writes don't erase each other. The costs: every write rewrites
  everything, a burst of writers (a bulk import plus phones) competes for one
  key, and after 30 lost races the function throws, which surfaces as an HTTP
  500.
- **Field-level lost updates on edit.** The leader edit form sends **every**
  field as it looked when the form opened. Leader A opens the form, Leader B
  fixes the phone number, Leader A saves a notes change, and B's phone fix is
  reverted. There is no version check.
- **Failures are silent on the phone.** `chAction()` swallows POST errors
  (`.catch(function(){})`). If a write fails (500, 429), the phone keeps
  showing a change the server never saved until the next re-download quietly
  removes it.
- **Weak duplicate guard.** `churchAdd` rejects only an exact, case-insensitive
  match on name and town. "St. Mary's Church" and "Saint Marys" in the same
  town both go in. When the guard does fire, the server still answers `ok`, so
  the phone toasts "added" and the row then vanishes on re-download.

**Auth**

- Reads and ordinary writes need the **Day PIN**. Edit, delete, clear flag and
  templates need the **leader PIN** (env `LEADER_PIN`, or a 14-hour leader
  token). Both are checked server-side. Wrong PINs are limited to 15 per
  10 minutes per IP. Non-leader writes are limited to 400 per 10 minutes per
  IP. Leaders are exempt from that write limit.
- **The Day PIN is the event Saturday as MMDD.** The season ended on 10 Oct,
  and `currentEvent()` returns the last event after the season, so the
  automatic PIN is now **"1010" until someone changes it**. That date is on the
  public website, and the derivation is in this public repo. The full CRM
  (pastors' names, numbers, private notes, flags) sits behind it. This is
  outside this plan's scope, but it is listed as an open question.
- **There is no bot credential.** A bot today could only post as an anonymous
  ambassador with the Day PIN, with no provenance and under the per-IP limit,
  or borrow the leader PIN, which would also unlock the seekers' contact list.
  Neither is acceptable.

**Size and performance**

- Netlify's documented limits (5 GB per blob, about 6 MB per function response,
  10 s default function timeout) are far away. The real limits are the 800 and
  1,200 caps above, and the phone: painting 400+ rows once crashed Chrome
  (fixed in v1.19.10 with 50-row pages).
- `assemble()` reads the **whole** churches blob on every main poll just to
  report `churchesRev` and `churchCount`. With phones polling every 1.2 to 5 s,
  that's a full 240 KB server-side read per poll per phone.

**Process**

- Commit `58dc1e7` ("Add Gilmanton Community Church and Baptist Church of
  Franklin to church roster") added churches by **editing the seed file and
  deploying**. Zach wants to rule that out.
- The seed files contain church contact info and alignment judgments (for
  example "verify doctrinal fit"), and **this repository is public**.

---

## 2. The most stable, low-maintenance setup

### 2.1 Options compared

| | (a) Harden Netlify Functions + Blobs | (b) Supabase Postgres behind Netlify Functions | (c) Airtable or Notion as the backend |
|---|---|---|---|
| New accounts | None | Supabase org and project | Airtable base, or a Notion integration |
| No duplicates by construction | Hand-built (`onlyIfNew` lock blob per dedup key) | Yes: `UNIQUE` index on the dedup key | No native uniqueness |
| Per-record writes | Per-record keys are possible, but phones still need one combined list, so an index blob comes back as the hot spot | Yes, row-level, with a `version` column for edit conflicts | Yes |
| Change history | Hand-built (history blobs) | Trigger-filled audit table (before, after, who, source) | Airtable record history (plan-dependent), Notion page history. Neither is queryable per field. |
| Backups and restore | Hand-built scheduled snapshot, manual restore | Daily backups on Pro; point-in-time restore as an add-on; plus our own nightly export | Vendor snapshots; restoring one record is manual |
| Edit data without the app | Raw JSON in the Netlify UI only | Spreadsheet-like Table Editor, CSV export, SQL | Best human UI of the three |
| Counter toward 100, filters | Computed in JS over the whole blob | One SQL query | Formula or rollup fields |
| Rate limits and latency | None of note | Fine at this scale | Airtable about 5 req/s per base; Notion about 3 req/s and 100 rows per page. Phones polling every 2.5 s would need a cache layer in front anyway. |
| Breakage risk | Low (our code) | Low (our code, managed database) | **High:** renaming a column in the UI breaks the app |
| Cost | Included | Pro is about $25/month per org; point-in-time restore is extra (check current pricing) | About $20+/seat/month (Airtable Team), or Notion plan seats |
| Upkeep | We maintain a homemade mini-database | Managed; schema changes through migration files | Ongoing schema drift between people and code |

### 2.2 Pick: (b) Supabase Postgres, behind the existing Netlify function

In plain words: a church list that a bot adds to every day, that several
people edit, and that has to count honestly toward 100 is a small database.
Postgres gives us the safety features without building them ourselves: it
refuses duplicates, keeps every change with who made it, takes daily backups,
and gives Zach a spreadsheet-style screen to fix a phone number with no app
and no deploy. The phones won't notice, because the same Netlify endpoint
keeps answering in the same JSON shape.

What stays the same:

- **The phone-facing contract.** `GET ?part=churches` still returns
  `{rev, removed, list, log, tpl}` with an ETag, and the same POST actions
  still work. The web app and already-installed native apps keep working with
  **no build and no store review**. That's possible because `mobile-data.mjs`
  just wraps `data.mjs`.
- **Auth.** Day PIN and leader PIN for people. The bot gets its own key.
- **Netlify Blobs for everything else** (checklists, Tech I/O, captures,
  miracles, bins and so on). Only the church CRM moves.

Design details that keep it low-maintenance:

- **Server-side only.** The Supabase URL and service key live in Netlify env
  vars. Row-level security is on with no public policies, so the Supabase
  anon key can't read anything, and no Supabase key ever reaches a phone.
- **Calls go over HTTPS** with `@supabase/supabase-js`. That avoids
  connection-pool trouble in serverless functions. Multi-step writes (upsert
  plus audit plus rev bump) run as single Postgres functions called via RPC,
  so each one is one transaction.
- **The poll never touches Postgres.** After each successful church write, the
  function updates a tiny `churches-meta` blob (`{rev, count, partnerCount}`).
  `assemble()` reads that instead of the 240 KB roster, which also fixes the
  per-poll read noted in 1.4. Postgres sees only roster downloads and writes.
- **Our own nightly export** (a scheduled Netlify function, like the existing
  `pco-sync-scheduled.mjs`) writes `churches-backup-YYYY-MM-DD` to Blobs and
  keeps 90 days. That copy doesn't depend on Supabase.
- **The seed merge goes away** after migration. Seeds are imported once, then
  retired. Adding a church is a data operation and never a deploy.

**If Zach would rather not add a vendor,** option (a) is the fallback, at
minimum: raise or remove the 800 and 1,200 caps and move the log to monthly
blobs; add a nightly snapshot; add the same import endpoint with an
`onlyIfNew` dedup-lock blob per key; per-church `version` checks on edit; and
history blobs per edit. That's most of the work of (b) without the Table
Editor, SQL or managed restore.

**Not recommended as the system of record:** Airtable or Notion. If the team
wants to *see* the list in Notion, a one-way nightly export into a read-only
Notion database is easy to add later.

> Netlify also offers a built-in Postgres product (Netlify DB, powered by
> Neon). It would keep billing inside Netlify. Its status and limits should be
> checked before choosing it over Supabase. The design below works the same
> on either.

---

## 3. Safe bot writes

### 3.1 Endpoints

All endpoints live in a new function, `netlify/functions/churches-api.mjs`, at
path `/api/churches/v1/*`. Bot traffic never mixes with the Day PIN logic.

| Method and path | Scope | Purpose |
|---|---|---|
| `POST /api/churches/v1/import` | `churches:import` | Create or upsert up to 100 records per call. Supports `dryRun`. |
| `GET /api/churches/v1/keys?state=NH` | `churches:read-keys` | Returns `[{id, dedupKey, updatedAt}]` only, with no contact info, so Scout can skip churches already on the list. |
| `GET /api/churches/v1/lookup?name=…&town=…&state=NH` | `churches:read-keys` | Returns the computed dedup key, the exact match if any, and possible duplicates. |

### 3.2 Auth

- `Authorization: Bearer <key>`. Each bot gets its own key, for example
  `k2c_scout_<32 random chars>`.
- Netlify env `CHURCH_API_CLIENTS` holds JSON, for example
  `{"scout":{"sha256":"…","scopes":["churches:import","churches:read-keys"],"dailyCreateMax":150}}`.
  Only hashes are stored. A key can be rotated or revoked by editing one env
  var and redeploying.
- The key identifies the actor. Every write is attributed as `bot:scout`.
- Bots can never use the leader PIN or Day PIN, and those PINs never work on
  this API.
- Kill switch: `CHURCH_API_WRITES=off` makes every import return 503 while
  reads keep working.

### 3.3 Dedup key

`dedupKey = state | townKey(town) | nameKey(name, town)`

Normalization, applied to both name and town:

1. Unicode NFKD, strip accents (`Église` → `eglise`, `Coös` → `coos`), lowercase.
2. `&` → `and`. Apostrophes are removed without a space (`St. Mary's` → `st marys`).
3. Any other punctuation becomes a space. Collapse whitespace.
4. Token rewrites: `st` → `saint`, `ste` → `sainte`, `mt` → `mount`, `ft` → `fort`,
   `1st`/`2nd`/`3rd`… → `first`/`second`/`third`…, `n`/`s`/`e`/`w` → `north`/`south`/`east`/`west`.
5. Name only: drop a leading `the`; drop trailing `church`, `inc`,
   `incorporated`, `nh` (repeatedly, but never down to an empty name); drop a
   parenthetical that just repeats the town (`(Amherst)` in Amherst).
6. Town only: drop a leading `town of`, and trailing `nh` or `village`.
7. Join tokens with `-`.

Examples:

| Input name + town | Key |
|---|---|
| `St. Mary's Church` + `Dover` | `nh\|dover\|saint-marys` |
| `Saint Marys` + `dover` | `nh\|dover\|saint-marys` |
| `The First Baptist Church` + `Concord, NH` | `nh\|concord\|first-baptist` |
| `1st Baptist Church, Inc.` + `CONCORD` | `nh\|concord\|first-baptist` |
| `St. Paul Lutheran Church (Amherst)` + `Amherst` | `nh\|amherst\|saint-paul-lutheran` |
| `Mt. Zion Church` + `Town of Wilton` | `nh\|wilton\|mount-zion` |

**Tested:** applied to all 414 seed churches, this produces **414 unique keys
and 0 collisions**, so migration won't merge two real churches by accident.
The same function runs in the migration, the import API and the in-app add
form, so all three agree.

**Second-level matching.** Some duplicates won't share a key: a village name
versus its town (North Conway / Conway), or a renamed church. When the key
doesn't match but the **phone digits** or **website domain** match an existing
church in the same county, the record is returned as `possible_duplicate` and
**not** created. A leader decides. A small NH town-to-county table (234 towns
and cities) lets the API fill in or check `county`, and can carry village
aliases later.

### 3.4 Create vs upsert rules

- `mode: "create_only"` (Scout's default): a new key creates the church. An
  existing key returns `exists` and changes nothing.
- `mode: "upsert"`: an existing key may **fill blank fields**. A non-blank
  field may be overwritten **only if that same bot set it last**. Each church
  stores `field_sources` (`{phone: {by: "bot:scout", at: "…"}}`). Anything a
  person typed is human-owned. A differing bot value becomes a **conflict** in
  the response and a row in `church_suggestions` for a leader to accept or
  dismiss (that review screen is phase 2).
- Fields a bot can **never** set: `partnerLevel` and the whole partnership
  section, `align`, `flag`, `interest`, `connections`, `owner`, activity-log
  entries other than its own audit lines, and deletion.
- Every bot-created church requires `sourceUrls` (at least one) and
  `researchedAt`. It's stored with `origin: "scout"` and
  `verified: false`, and shown with a "🤖 Added by Scout · unverified" chip
  until a person confirms it. That follows the house rule against content a
  volunteer could mistake for verified fact.
- `id` for new churches: a slug from the name key plus town, cut to 40
  characters of `[a-zA-Z0-9_-]` (the same rule as `idStr()`), with a short
  suffix on collision. Existing ids are kept as-is.

### 3.5 Request

```http
POST /api/churches/v1/import HTTP/1.1
Host: ambassadorcompanion.netlify.app
Authorization: Bearer k2c_scout_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Content-Type: application/json
Idempotency-Key: scout-2026-10-13-batch-1
```

```json
{
  "dryRun": true,
  "mode": "create_only",
  "records": [
    {
      "ref": "scout-2026-10-13-001",
      "name": "St. Example's Church",
      "kind": "church",
      "town": "Dover",
      "state": "NH",
      "county": "Strafford",
      "address": "1 Example St, Dover 03820",
      "phone": "603-555-0100",
      "email": "office@example.org",
      "website": "https://example.org",
      "leader": "Rev. Example Name",
      "contact": "",
      "contactRole": "",
      "denomination": "Non-denominational",
      "sizeBand": "100-249",
      "notes": "Hosts a Wednesday prayer night.",
      "sourceUrls": ["https://example.org/about"],
      "researchedAt": "2026-10-13"
    }
  ]
}
```

(All values are illustrative placeholders, not real churches.)

Field rules: `name`, `town`, `state`, `sourceUrls` and `researchedAt` are
required. `county` must agree with the town table, or it is filled in from it.
`phone` is stored as typed and matched on digits. `email` must look like an
address. `website` passes the existing `safeUrl()` (http/https only). Length
caps match `normChurch()`.

### 3.6 Response

```json
{
  "ok": true,
  "dryRun": true,
  "runId": "imp_2026-10-13T14-02-11Z_7f3a",
  "rev": 359,
  "summary": {
    "received": 5, "created": 1, "updated": 1, "exists": 0,
    "conflict": 1, "possibleDuplicate": 1, "invalid": 1
  },
  "results": [
    { "ref": "scout-2026-10-13-001", "status": "created",
      "id": "saint-examples-dover", "dedupKey": "nh|dover|saint-examples" },
    { "ref": "scout-2026-10-13-002", "status": "updated",
      "id": "first-baptist-concord", "dedupKey": "nh|concord|first-baptist",
      "changes": { "email": { "from": "", "to": "office@example.org" } } },
    { "ref": "scout-2026-10-13-003", "status": "conflict",
      "id": "grace-chapel-keene", "dedupKey": "nh|keene|grace-chapel",
      "conflicts": [ { "field": "phone", "current": "603-555-0199", "proposed": "603-555-0100",
                       "currentSetBy": "human", "reason": "human-owned field" } ] },
    { "ref": "scout-2026-10-13-004", "status": "possible_duplicate",
      "matches": [ { "id": "new-life-conway", "name": "New Life Church", "town": "Conway",
                     "why": ["same phone", "same website domain"] } ] },
    { "ref": "scout-2026-10-13-005", "status": "invalid",
      "errors": [ { "field": "town", "error": "required" } ] }
  ]
}
```

- With `dryRun: true`, the whole batch runs inside a transaction that is
  rolled back. The response is exactly what a real run would do, and `rev`
  doesn't move.
- With `dryRun: false`, created and updated records commit in one
  transaction. Conflicts, possible duplicates and invalid records are
  reported and skipped. They don't fail the batch.

Error responses:

| Status | When |
|---|---|
| 401 | Missing or unknown key |
| 403 | Key lacks the scope |
| 409 | `Idempotency-Key` reused with a different body |
| 413 | More than 100 records |
| 422 | Body isn't valid JSON or isn't the expected shape |
| 429 | Rate limited. `Retry-After` header and `{"error":"rate_limited","retryAfterSec":42}` |
| 503 | Writes switched off, or the database is unreachable. Safe to retry with the same `Idempotency-Key`. |

### 3.7 Idempotency, rate limits and audit

- **Idempotency:** the result of each `Idempotency-Key` is stored for 7 days in
  `import_runs`. Re-sending the same key and body returns the stored result
  without writing again, so a timed-out request can be retried safely.
- **Rate limits per key:** 30 requests per minute, 100 records per request,
  and a daily cap on **creates** (`dailyCreateMax`, start at 150 for Scout).
  Dry runs count toward requests but not creates. The limits sit in env so
  they change without code.
- **Phone traffic:** a bulk import is one transaction and **one** `rev` bump,
  so phones re-download once per batch, not once per church.
- **Audit:** every insert, update and soft delete on `churches` writes a
  `church_audit` row from a database trigger:
  `{at, actor ("bot:scout" | "amb:<name>" | "leader:<name>" | "migration"),
  source ("app" | "api" | "table-editor" | "migration"), run_id, ref, action,
  changed_fields, before, after}`. Edits made directly in the Supabase Table
  Editor are captured too, as `source: "table-editor"`. The app's church
  history shows a plain line such as "🤖 Scout added this · source ↗". The
  audit table is never capped.

---

## 4. Partner-tracking fields

Zach's brief opened: "🤝 K2C Research Brief: Partner Churches & Statewide
Unity (Oct 2026)". It defines three checkable tiers and recommends counting a
church toward 100 once it reaches **Partner Church** or above. Money never
counts toward any tier. The fields below follow its "Suggestions for Peter"
list.

### 4.1 Schema (Postgres)

**`churches`.** All current fields carry over, with the same names in the JSON
the phones get:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Existing ids kept (log entries and phone caches reference them) |
| `dedup_key` | text UNIQUE | Section 3.3 |
| `name`, `kind`, `town`, `county`, `state`, `address`, `phone`, `email`, `website`, `contact`, `contact_role`, `leader`, `notes`, `intro`, `ask`, `align`, `interest`, `flag` (jsonb), `added_by` | as today | Same caps as `normChurch()` |
| `denomination` | text | Free text with suggestions (open question: fixed list?) |
| `size_band` | text | `under-50`, `50-99`, `100-249`, `250-499`, `500-999`, `1000+`, `unknown` |
| `partner_level` | enum | `none`, `praying`, `partner`, `covenant` |
| `partner_since` | date | Date committed to the current level |
| `partner_confirmed_by` | text | Who confirmed it |
| `tier_checks` | jsonb | One entry per brief checkbox: `{done, date, by, note}`. Keys: `t1_pastor_yes`, `t1_contact_on_file`, `t1_prayed_publicly`, `t2_church_team`, `t2_five_trained`, `t2_pastors_gathering`, `t2_48h_followup`, `t3_county_hub`, `t3_steering`, `t3_volunteer_team`, `t3_statewide_sunday` |
| `commitments` | jsonb | `{prayer, promote, counselorsTrained (count), volunteers (count), busAttendance, financial}`. Financial is optional and never counts toward a tier. |
| `pastor_needs` | text | In the pastor's own words |
| `serving_notes` | text | "How we're serving them" |
| `next_step` | text | One clear action |
| `next_step_due` | date | Drives the "overdue" filter |
| `owner` | text | Ambassador caring for this relationship |
| `followup_name`, `followup_phone`, `followup_email` | text | Person who receives new believers |
| `origin` | text | `seed`, `app`, `scout`, `import` |
| `verified` | bool | False for bot-added rows until a person confirms |
| `source_urls` | text[] | Provenance for bot rows |
| `researched_at` | date | |
| `field_sources` | jsonb | Who last set each field (for bot upsert rules) |
| `version` | int | Bumped on every update; edits must send it back |
| `created_at`, `updated_at`, `updated_by` | | |
| `deleted_at` | timestamptz | Soft delete replaces tombstones |

**Other tables:** `church_connections` (replaces the 40-per-church cap),
`church_log` (the human activity log: call, text, email, convo, note… never
capped), `church_audit` (trigger-filled field history), `church_templates`
(the current `tpl`), `church_suggestions` (bot conflicts awaiting a leader),
`import_runs` (idempotency and run history), `church_meta` (rev).

**Counter:** `count(*) where partner_level in ('partner','covenant') and
deleted_at is null`, broken down by tier and by county. Which churches count
(ministries? out-of-state?) is an open question.

### 4.2 UI touch points (all in `js/mobilize.js` and `index.html`)

| Where | Change |
|---|---|
| **Pre-Crusade tab, top** (`renderMobilize`, `#mobStats`) | New first card: **"🤝 23 / 100 partner churches"** progress bar, a tier line (🙏 Praying 12 · 🤝 Partner 18 · 🏛 Covenant 5), and a tap-to-expand county breakdown. The existing "We've talked / Know someone / Don't know anyone" tiles stay below. |
| **Event Day dashboard** | A small "23 / 100 partner churches" chip fed by `partnerCount` in the main poll payload (from `churches-meta`). The homepage still never downloads the roster, which keeps the v1.19.10 out-of-memory fix intact. |
| **List rows** (`chRowHtml`) | Tier chip, a red "⏰ Next step overdue" chip when `next_step_due` is past, the owner's name in the subline, and the "🤖 Scout · unverified" chip. |
| **List filters** (`#chViews`) | Add **Partners** (Partner and Covenant), **Praying**, **Overdue**, **Mine** (owner = me). Add a "Sort by next step date" option. |
| **Detail page** (`renderChurchPage`) | New **"🤝 Partnership"** card under Contact info: level, date committed and who confirmed; the tier checklist with date and name per box; commitments; pastor's needs; how we're serving them; next step and due date; owner; follow-up contact (tap to call or email); denomination and size. |
| **Edit form** | Denomination and size join the leader edit form. A separate partnership edit section: next step, due date, needs, serving notes and owner are editable by any Day-PIN ambassador and logged. Partner level, date committed and tier checks are **leader-only**, because they drive the 100 counter (open question). |
| **CSV export** (`chExportCSV`) | Add every new column. |

All 44px tap targets, design tokens, `esc()` on every rendered value,
`queueWrite()` for the new set-style writes, and leader-only actions listed in
both `OB_LEADER` and `LEADER_ACTIONS`, per `CLAUDE.md`.

**Builds.** The *data* is live with no build. The *new fields UI* is a feature:
the web app gets it on the next Netlify deploy, but native apps need **one**
store build to show the partnership card. After that, adding churches,
editing details, logging connections and moving partner levels never need a
build. Optionally, the partnership card can render from a field list the
server sends, so future field additions don't need a native build either.

---

## 5. Migration plan

Each step can be stopped and reversed. Nothing touches production until
step 7.

**Step 0. Approvals and accounts (Zach).** Approve this plan. Create the
Supabase org and project (Pro; region near Netlify's functions, for example
US East). Add the env vars to Netlify. Decide the open questions in section 7.

**Step 1. Back up first.**
- `netlify blobs:get k2c-ambassador churches > churches-2026-MM-DD.json`
  (needs a Netlify login with site access). Record `rev`, list and log
  counts, and a SHA-256 of the file.
- Keep two copies **outside this public repo**: one offline, and one copied
  to a new blob key `churches-premigration-<date>` in the same store.
- Also download the app's CSV export as a human-readable copy.

**Step 2 (recommended now, small, server-only). Protect the current blob
while the rest is built.**
- Nightly scheduled snapshot of `churches` (keep 60).
- Stop the silent drops: raise the 800 and 1,200 caps well above current use,
  and return an error instead of `ok` when `churchAdd` drops a duplicate.
- This is one `data.mjs` change plus one scheduled function, with a patch
  version bump per `CLAUDE.md`.

**Step 3. Schema and migration script.** SQL migration files in
`supabase/migrations/`. Add `scripts/migrate-churches-to-pg.mjs`. It reads
the backup JSON (not the live blob), keeps original ids, computes dedup keys,
and inserts churches, connections, log entries and templates. It's idempotent
and safe to re-run. It **never merges**: any key collision stops the run and
lists the rows for a person to resolve.

**Step 4. Prove zero loss on staging.** Run the script into a staging Supabase
project. A parity script exports staging back into the exact
`{rev, removed, list, log, tpl}` shape and deep-compares it with the backup
after `normChurches()` on both sides. It must be identical: 417 churches,
279 log entries, 4 connected churches, 1 flag, and the same 21 rows edited in the app.

**Step 5. Data layer behind a switch.** Env `CHURCH_BACKEND = blob | pg`.
In `pg` mode, `GET ?part=churches` builds the same JSON from Postgres, and
the existing POST actions write to Postgres (edits carry `version`; a stale
edit gets 409 and a "someone else just changed this, reload" toast). After
each Postgres write, the function **mirrors** the full roster back into the
`churches` blob in the old shape. That keeps rollback lossless. Tests extend
the existing in-memory store seam with a repository interface, so `npm test`
runs without a database.

**Step 6. Deploy preview against staging.** Preview contexts already get
their own Blobs store. Point them at the staging database the same way, then
click through Pre-Crusade on web and in a native debug build.

**Step 7. Cut over.** Pick a quiet moment (the season is over). Take a final
backup (repeat step 1), re-run the migration against production, run the
parity check, set `CHURCH_BACKEND=pg`, and redeploy. Netlify only applies env
changes to functions on deploy, so this is a redeploy with no code change.
Watch the function logs and spot-check a write from a phone.

**Step 8. Turn on the bot API.** Scout's key starts with `dryRun` only
(server-enforced flag in `CHURCH_API_CLIENTS`). Review its dry-run reports
for a few runs, then allow real writes with a low daily cap and import the
staged backlog in batches.

**Step 9. Partner fields UI.** Web deploy first, then the native build when
convenient. Version badge, `sw.js` cache name and README markers bumped
together per `CLAUDE.md`.

**Step 10. Clean up after 30 stable days.** Stop the blob mirror, keep the
frozen pre-migration backup, delete the seed files, and remove the
merge-on-read code. Optionally scrub church contact data from the public
repo's history, which is a separate decision with its own trade-offs.

**Rollback (any time after step 7):** set `CHURCH_BACKEND=blob` and redeploy.
Thanks to the mirror, the blob already holds every change made since cutover.
If the mirror ever failed, regenerate the blob from Postgres with the parity
export script. Worst case: restore the step-1 backup and replay
`church_audit` rows newer than the cutover time.

### 5.1 Effort (technical size, not calendar time)

| Piece | Size | Notes |
|---|---|---|
| Step 2 hotfix | Small | One `data.mjs` edit, one scheduled function, tests |
| Schema and migrations | Small to medium | About 8 tables, one audit trigger, 2 or 3 RPC functions |
| Migration and parity scripts | Medium | The zero-loss proof lives here |
| `data.mjs` church section on Postgres | Medium to large | 9 actions plus the roster read, `version` checks, mirror, meta blob |
| `churches-api.mjs` (import, keys, lookup) | Medium | Auth, dedup, rules, dry run, idempotency, rate limits |
| Partner UI | Medium | List, detail, edit, counter, filters, CSV; one native build |
| Leader review screen for Scout suggestions | Small to medium | Can follow later |

**Main risks:** getting the JSON shape exactly identical (mitigated by the
parity check); env vars set in the wrong Netlify context (mitigated by the
staging preview); a Supabase outage (the roster still shows each phone's cached
copy, writes fail loudly, and the nightly Blobs export is independent).

### 5.2 What needs Zach

- **Accounts and cost:** a Supabase org and project on Pro (about $25/month),
  and optionally point-in-time restore (extra; check current pricing).
- **Keys:** add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CHURCH_BACKEND`,
  `CHURCH_API_CLIENTS` and `CHURCH_API_WRITES` in Netlify site settings.
  Decide where Scout's key is stored on Scout's side.
- **Access for the backup:** someone with a Netlify login and site access runs
  step 1, or grants a personal access token for it.
- **Decisions:** the open questions in section 7.
- **Review:** the brief names Peter as the app's code owner. He should review
  the schema and the UI changes.

---

## 6. Should Scout pause?

**Pause writing into the app. Keep researching.**

Scout has no safe way to write today:

- Posting `churchAdd` with the Day PIN would mean anonymous attribution, the
  weak duplicate guard, the silent drop at 800, extra log churn toward the
  1,200 cap, and no source links.
- Editing the seed files and deploying is exactly what Zach wants to stop.

What Scout can safely do meanwhile:

1. **Stage records as JSON Lines**, one object per line, using exactly the
   `records[]` shape in section 3.5 (including `ref`, `sourceUrls` and
   `researchedAt`). One file per day, for example
   `scout-churches-2026-10-13.jsonl`. These files import later with no
   reshaping.
2. **Store them somewhere private,** such as a private Google Drive folder, a
   Notion database, or a private repository. **Not in this repo, which is
   public.** The records carry pastors' names and contact details.
3. **Compute `dedupKey`** with the normalization in section 3.3 and skip its
   own repeats. The importer remains the authority on duplicates against the
   live list, so Scout doesn't need Day-PIN access to read the roster.
4. **Leave out** partner level, alignment, flags and interest. Those are
   people's judgments. An observation such as "statement of faith mentions X"
   can go in `notes` with its source.
5. **When the endpoint ships,** import the backlog with `dryRun: true` first,
   review the report, then import for real in batches of 100 under the daily
   cap.

---

## 7. Open questions for Zach

1. **New vendor:** OK to add Supabase (Pro, about $25/month), or prefer the
   hardened-Blobs fallback? Add point-in-time restore?
2. **Partner level:** set by a leader (with the checklist as a guide), or
   computed automatically from the tier checkboxes?
3. **Who edits what:** partner level, date committed and tier checks
   leader-only, with next step, needs, owner and serving notes open to any
   ambassador? Is that the right split?
4. **What counts toward 100:** Partner and Covenant only, as the brief
   recommends? Do ministries count? Out-of-state churches (3 today, in Maine)?
5. **Scout's limits:** what daily cap? Should Scout-added churches show as
   "unverified" until a person checks them? Who reviews Scout's conflicts?
6. **Single source of truth:** is the Notion "K2C Statewide Church Outreach"
   tracker still being edited? After migration, should the app's database be
   the only place church data is edited, with Notion as a read-only export?
7. **Day PIN after the season:** the automatic PIN is now "1010" (derivable
   from the public schedule) and guards the full CRM. Set a manual PIN now?
   Later, move the CRM behind per-person sign-in?
8. **Public repo:** the seed files with church contacts and alignment notes
   are public. Remove them after migration? Scrub the git history too?
9. **Denomination and size:** fixed picklists or free text? Size as a band
   (proposed) or a number?
10. **Peter:** confirm he reviews and owns the implementation.
