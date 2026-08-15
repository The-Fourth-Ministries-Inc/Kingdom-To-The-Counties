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

## Trailer Load List (v1.14.0)

**Specialists → 📦 Trailer Load List** is the team's real inventory — both
trailers, bin by bin, seeded from the inventory sheet the logistics team
built: **100s Tech/Worship**, **300s Logistics**, **350s Guest Services**
(~60 numbered bins plus ~66 pieces of loose gear, each with the location it
rides in).

### Page order — volunteer first

The page is stacked in the order a volunteer needs it, with leader-only
controls pushed below everything they touch:

1. **Search** — the first thing under the title, and **sticky**, so it stays
   reachable however far down the roster you've scrolled.
2. **Results**, with the view controls (**🔲 Show only what's left**) sitting
   with the search where you reach for them.
3. **The bins themselves**, with the identifier set in 20px: the **number**
   leads for a numbered bin, and — because over half the roster is loose gear
   with no number — the **name** leads for everything else, rather than a grid
   of identical "LOOSE" tags. The ☐ tick sits in the chip's own top-right
   corner; it used to be a separate box alongside, which read as an empty
   second card and stole width from every name. Empty / unassigned bins are
   shelved into a **☐ N empty bins** expander per trailer instead of padding
   out the grid.
4. The **🚚 Load-out** progress bar, at the foot of the roster.
5. **🚩 Reports & leader tools** below a divider: the flag board, then the
   leader-gated card (add a bin, **♻️ Start a new load-out**).

Tapping a bin opens its card with a **✕ top-left** — a full bin (contents,
reports, and the leader edit form) is taller than a phone, so the card scrolls
its body and pins the header and Close row rather than running off-screen.

When the phone has no signal the page says so plainly: *"showing the roster
this phone downloaded at 9:14 AM — leader edits since then aren't here yet."*
The cache is what makes the list work in a metal trailer; the cost is reading
a roster that may have moved on, and that shouldn't be silent.

Searching hides everything below the results, so a match is never buried under
the roster.

### Search — by bin number or by the thing in your hand

Volunteers look things up two ways, and both hit the same index (bin numbers,
titles, every item line, and the location notes):

- **"Where does 109 go?"** — type the number.
- **"Which bin has the gaff tape?"** — type the thing. (It's bin 111,
  Tiedowns.)

Volunteers don't type the sheet's words, so a small synonym table treats each
group as one word — "cable ties" finds the zip ties, "walkie" finds the radios,
"gaffer" finds the gaff tape. And a search whose words don't *all* land
("black gaff tape", where nothing records "black") no longer dead-ends: it
falls back to everything matching at least one word, most words first.

Results carry the **☐ tick** too. Search is how most people reach a bin now,
so finding one mid-load shouldn't mean opening it just to mark it — and a
result that's already on the truck says so without being opened.

Every result answers the whole question in one card: which trailer and
section, the bin number, where it rides, quantity where recorded, matched
words highlighted, and — pulled from the reports below — **anything the team
has already flagged about that bin**, so "someone reported that missing an
hour ago" reaches you *before* the walk to the trailer. Results rank exact bin
number → title match → item match, with empty bins last.

### Load-out — ticking bins onto the truck

A **🚚 Load-out** bar sits above the roster: tick the ☐ beside any bin as it
goes on the truck and it lights up on everyone's phone within a few seconds, with a
live "31 / 60 bins on the truck · 52%" and how many are still to load. Ticks
are **final-state writes** — a retry, or two people ticking the same bin, lands
on the same answer instead of toggling it back off — and they **queue offline**
and send themselves when signal returns, so nobody has to stand still.

Mis-taps happen in gloves, so every tick raises a toast with **Undo**.

Two things answer "what's left?" without arithmetic: each trailer header
carries its **own** count and progress bar (crews split by trailer), and
**🔲 Show only what's left** hides everything already on the truck. That
filter sticks across reloads, because a load-out spans them.

Leaders get **♻️ Start a new load-out**, which clears every tick. The
end-of-day reset clears them too.

### On the Leader Dashboard

Leaders shouldn't have to walk the Load List to know how it's going, so the
dashboard carries **📦 Trailer load-out** — the overall bar plus a line per
trailer, since crews split that way and "which trailer is behind" is the
actual question — and **🚩 Open bin flags**, listing what's been reported and
the most recent roster edits with who made them.

### Who's got it — custody for loose gear

The generator, the ladders, the Ark, the hand truck — the things that aren't in
a numbered bin are the things that actually go missing *between* counties. Any
bin or item takes a **🙋 I've got this** tap, with an optional "where is it /
when's it back", and shows **🙋 Kyle** on its chip until someone marks it
returned.

Custody deliberately **survives the reset and county switches** — packed ticks
are about tonight's truck, but who has the generator is exactly what you still
need to know next week.

### Photos of every bay

Each entry shows **📷 See this spot in the trailer** — the actual photo of the
bay, rack, nose or packout stack it lives in, matched off its location text
(17 photos covering all 66 located entries). Loaded lazily and only when
tapped, since the app is opened on field signal.

Originals live in `assets/Trailer Photos/`; the app serves ~1100 px copies from
`assets/trailer/` (86 MB → 6 MB, with EXIF rotation applied — the shots were
taken sideways). Rebuild them with:

```bash
pip install Pillow && python3 scripts/optimize-trailer-photos.py
```

### Reporting — missing items and extras

The roster is **read-only for volunteers**; what they can do is report what
they actually find, without interrupting a leader mid-load:

- **🔺 next to any item** — one tap (with a confirm, since a mis-tap sends
  someone hunting for nothing) files it as **MISSING**. The item shows struck
  through with "reported missing by …" for everyone.
- **➕ Extra item in here** — something in the bin that isn't on the list.
- **📝 Note about this bin** — anything else. There's also a general note box
  on the page for things that aren't about one bin.

Everything lands on one shared board at the top of the page and on the bin
itself. Leaders mark reports **✓ Handled** (reversible, nothing is deleted),
and an **extra** gets a one-tap **"➕ Add to bin 306 & mark handled"** that
appends the item to the roster and files the report in the same motion, so
the two can't drift apart.

### Leaders own the roster

Open any bin → **✏️ Edit this bin**: number, title, contents (one item per
line), where it rides, quantity, and a leader note. Leaders can also add new
bins/gear and remove entries. Every change bumps a revision, syncs to every
phone, and is logged with the leader's name — "who changed 109 and when" is
answerable.

Each bin also carries an edit **version**. The editor sends the version it
opened, and a save against a stale version is **refused with a 409** rather
than applied — otherwise a leader who opened bin 111 five minutes ago would
save their stale copy of the contents straight over another leader's work.
The refusal re-downloads the current version and says so, so the second leader
can redo their change on top of it. (A retry of a write that already landed is
*not* treated as a conflict.)

- The roster lives in its own `bins` blob and is fetched separately
  (`GET ?part=bins`, own ETag) because it's ~19 KB — far too big to ride the
  5-second poll. Phones re-download only when the rev changes, and the last
  copy is cached in `localStorage`, so the page opens instantly and **works
  with no signal** — the normal state inside a metal trailer.
- Starter bins self-seed on read and deleted ones are tombstoned (same
  pattern as starter scripts and churches), so leader edits are never
  overwritten by seed data.
- Not county-scoped and **survives the end-of-day reset** — the trailers are
  the same trailers at the next county.

### Editing the seed data

`data/bins.json` is the transcription of the team's sheet and the single
source of truth for the *starter* roster — bins, section/trailer labels, and
the photo→location map. Contents are kept close to verbatim; the only edits
are spelling fixes that would otherwise break search ("paper towles" never
matches a search for *towels*). Deliberately playful bin names the team chose
— Krazy Kids Klub Krate, Paakin Tote — are left alone, with a searchable
`note` added instead. After editing it:

```bash
node scripts/sync-starter-bins.mjs   # validates ids/sections, regenerates the server copy
```

Day-to-day corrections should be made **in the app** (leaders), not here —
this file only seeds a fresh deployment.

## Announcements (v1.13.0)

**Post → 📣 Announcements** is the app's only push channel: a leader posts,
and the headline drops into the bar under the header on every phone. Urgent
ones re-open that bar even for someone who dismissed the last message, and
buzz the handset.

Because it's the only push channel, leaders can take a message **down** as
well as put one up:

- **✓ Take it down** hides it — off the feed, out of the badge count, and the
  push bar rolls on to the next live announcement instead of holding a
  headline that's over. Reversible with **↩ Put back up**; taken-down messages
  stay in a collapsed list with who took them down and when.
- **🗑 Delete** removes it permanently, for a genuine mis-post. Confirm-gated,
  and the copy steers toward hiding first.

Both are leader-PIN-gated (`setAck` / `annDelete`) and go through the offline
outbox like every other write.

**The board ships empty.** There are no seeded announcements, in any mode — a
placeholder "Stay clear of the crane zone" reads as a real safety instruction
the moment it renders on a volunteer's phone.

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

## Graphics for Sharing (v1.15.1)

Under **Ambassador Resources → 🖼️ Graphics for Sharing**: a download-and-post
strip of everything a volunteer can put on their own feed. Two formats per
county — the tall `· Flyer` (print/story shaped) and the wide `· Banner` (built
for a Facebook event header or cover photo) — plus the **Come and See** hero,
the **Mission & Vision** card, and the promo video. Cards run in season order
so the next county is near the top.

Card copy (dates, venues, towns) is written from the county roster in
`js/counties.js`, **not** transcribed off the artwork, so the page can't drift
from the schedule the rest of the app runs on. When you add a graphic, copy the
venue string from the roster entry.

**A card whose image is missing hides itself.** `gfxMiss()` (inline at the
bottom of `#page-graphics`) drops the whole card on an image `error`, and a
sweep on `load` catches images that failed before the handler was parsed. So a
graphic that hasn't been deployed yet, or an offline boot with a cold cache,
shows a shorter list rather than a row of broken-image icons and a download
button that 404s. The `N graphics + promo video` badge counts what actually
rendered, so it can't go stale either.

All ten graphics are live as of v1.15.1. The banners are 1920×1080 and the
mission card 1080×1350, matching what the socials want; keep new artwork at
those sizes and under ~300KB so the precache stays reasonable on field signal.

## Tech I/O List (v1.16.0)

Under **Specialists → 🎛️ Tech I/O List**. Three views of one dataset, switched
with the segmented control at the top:

- **👤 Musicians** — the original per-pack cards. What one player needs, and the
  patch checkmarks techs tick off during line check.
- **🎚 Inputs** — the full input list as a table, **keyed on the AVB stream
  number**, with the FOH and 32SC channel numbers side by side: source, role,
  physical patch point, mic/hardware, +48V and the sheet's notes. Where the two
  consoles wrote different things for one signal, both readings show — the
  32SC's on its own line, labelled.
- **🎧 Outputs** — the Ark 32R IEM mixes (transmitter, pack, assignee,
  stereo/mono) and the NSB 32.16 PA buses.

**The tables are the master routing and the musician cards are built from
them.** Editing happens *only* in a table — there is no edit affordance on the
musician cards at all, so nobody changes routing from a view that can't show
routing. The tables sit behind the **leader PIN**; the Musicians view stays
open to any tech past the Day PIN, along with the patch checkmarks they tick
during line check. (Ticking an input off is progress, not a change to the
routing, which is why it stays on the open view.)

### The columns follow the signal

Left to right, the Inputs table runs the way the signal does — the stream it
ends up on, then the three ways it can get in:

| Column | What it is |
| --- | --- |
| **AVB** | the network stream, the number every console agrees on |
| **Snake** | an on-stage NSB 32.16 port, for anything patched at the stage box |
| **Ark split** | an Ark XLR splitter input — the splitter feeds the 32R |
| **32R** | the 32R's own channel |

A row uses exactly one entry point. Computer sources (tracks, click, guide)
have none of the three — they land straight on the AVB network from the
playback Mac — so their entry columns read `—` and the note says where they
come from. Console channels (FOH ch, 32SC ch) sit at the far right: they're the
least useful number when you're stood at a patch bay.

**The 32R column imports empty.** The sheet never writes a 32R channel. The
Ark splitter feeds the 32R, so in practice it's the same number as the splitter
input, but that's an inference and the importer doesn't invent data — fill it
in once and it sticks.

### Musicians are a roster, not free text

Every Source cell in the edit view is a dropdown of the people already on the
list, so a musician's card and the table can't drift into describing two
different people. Picking a different name **moves that input onto their card**
— that single action is what "the tables feed the performer view" means in
practice. **＋ Add a musician** puts a new name on the roster (and into every
dropdown) before they have any inputs.

The sheet's own Source wording still rides along per row, so "Zach TB" and
"Zach AG" stay distinguishable while both resolving to Zach's card.

### Why AVB is the left-hand column

We run three consoles — the FOH board, a 32SC for monitors, and a 32R mostly
for patching — and **their channel numbers disagree**. The FOH board takes drums
discrete (Tom 1–3 and overheads on channels 23–27); the 32SC takes them
pre-mixed on 23–24 and spends the freed channels on the raw vocal splits. The
one identifier both consoles name for the same signal is the AVB stream, so
that's the key the table sorts and merges on. Each row still shows both channel
numbers, and the **Console** filter narrows to just the FOH or just the 32SC
view when you're standing at one of them.

### IEM packs stay colour-coded

The belt packs are colour-coded on the hardware and the team reads them that
way, so the colour is a real field, not a label: the Outputs table shows the
pack as a coloured chip, and in edit mode the chip becomes a text field plus a
colour swatch. Change the pack a musician is on and the chip follows.

### Collapsing an IEM mix to mono

Everyone wants stereo — an aux pair, a whole transmitter, two outputs. But the
32R has sixteen outputs, so with more musicians than pairs somebody has to go
mono. On the **Outputs** view a leader taps **Split to mono →** on a stereo mix:
the current owner keeps the left leg, and the right leg opens as a free mono
slot on the same transmitter. **← Back to stereo** merges the two legs again.

Splitting doesn't consume more outputs — it buys another *mix* out of the same
pair, which is why the header counts both ("16 of 16 outputs in use · 9 mixes").
Going back to stereo always costs somebody their mix, so the app names who and
asks first; that person keeps all their inputs and drops to "no mix assigned"
until a leader hands them another. The assignee dropdown moves a mix between
people, swapping if the target already holds one.

### The sheet is canon — including where it disagrees with itself

The roster is imported from `The Fourth Routing and Input Lists — K2C.xlsx`,
tab `K2C Cheshire - INP-OUT Map`, and imported **verbatim**. That sheet
contradicts itself in a few places, so rather than guess a winner the importer
keeps both readings and the Inputs view flags them in a banner at the top:

- **AVB 41** is written as both Tom 1 (FOH ch 23, NSB.32-1) and a spare channel
  (FOH ch 32, Ark splitter 32).
- **AVB 38 / 39** appear as both 32SC spares on NSB.32-4/5 and FOH unused
  channels on Ark splitter 29/30 — and NSB.32-4/5 are also the overheads.
- **The saxophone** is AVB 37 on FOH and AVB 28 on the 32SC, off one splitter
  port.

Two more worth knowing that the app can't detect: the Toms/overheads mixdown is
sent on **AVB 49/50** by the FOH output table but received on **AVB 57/58** by
the 32SC input list, and the transmitters run 1, 2, 3, 4, **9**, 6, 7, 8 — there
is no unit 5. Fix any of these in the app and the app becomes the truth.

### Non-production deploys get their own data

Netlify Blobs are **site-wide, not deploy-scoped**. Every deploy preview and
branch deploy used to read and write the live event data, so opening a preview
link and tapping anything edited production — which is exactly how a preview of
this feature overwrote the team's Tech I/O roster. `storeName()` now namespaces
the store by `CONTEXT` and branch, so only the real production deploy touches
`k2c-ambassador`; anything else lands in
`k2c-ambassador--deploy-preview--<branch>` and is safe to poke at.

### An older stored roster is shown, never silently replaced

A roster saved before v1.16.0 carries only role / gear / location — no AVB, no
channel numbers, no patch point — so it cannot fill the tables. Because the
stored roster overrides the deployed defaults, a phone reading one would show a
short, half-empty input list and look like the import had failed.

The app detects that (no AVB anywhere in the list), falls back to the deployed
defaults **for display only**, and says so in a banner rather than leaving a
leader guessing which roster is real. Replacing the stored roster takes a
deliberate **Reload defaults**.

An earlier revision tried to be clever here and upgraded the roster
automatically on the first patch tap. `ioSetRow` is open to any tech behind the
Day PIN, so that turned one checkbox into a silent overwrite of the team's own
I/O map, and it destroyed a real roster. The `seed` payload now only populates
a server that has **no** roster at all.

### Merged cells are the whole ballgame

A merged cell stores its value only in the top-left slot; every other slot in
the block reads back empty even though the sheet *displays* the value on all of
them. `sheetToRows` expands merges before anything else looks at the grid,
because that is where a third of this sheet's content lives: Kyle's name down
the eight drum rows, the physical port and hardware for the playback returns,
the `13/14 (stereo)` channel labels, the `Aux 16` bus, and every note written
once against a block of rows. Skip that step and the import looks complete
while quietly dropping ~70 values. `test/io-consolidate.test.js` pins the
behaviour, including that expansion never becomes a general fill-down over
genuinely blank cells.

### Re-importing from the workbook

```bash
node scripts/excel-to-io.mjs --workbook "The Fourth Routing and Input Lists — K2C.xlsx" \
  --sheet "K2C Cheshire - INP-OUT Map" \
  --output data/io-default.json --write-index --verbose
```

`--write-index` rewrites `IO_DEFAULT` and `IO_BUSES` in `js/app-core.js`; both
halves of the sheet, the IEM table and the PA bus table are discovered by their
header text, not by hard-coded row numbers, so the other county tabs import with
`--sheet`. Note that this only changes the *defaults* — phones keep whatever
roster is stored on the server until a leader taps **Reload defaults**.

## Recording Studio (Teleprompter) (v1.14.2)

Under **Ambassador Resources → 🎬 Recording Studio**: invite-video scripts for
every county, each with a due date and assignee, opening into a full-screen
camera teleprompter (adjustable font/speed, 3-2-1 countdown, in-browser
recording, save/share). Viewing and recording is open to anyone past the Day
PIN; **adding/editing scripts, due dates, and assignees is leader-PIN only**
(that's Laura's board). After recording, the app reminds the filmer to save the
video and send it to Laura, then mark the script ✅ done with their initials.

**The default scroll speed halved in v1.14.2.** Measured on a 390px phone at
the stock 28px font, `1.0×` used to scroll ~220 wpm — far faster than anyone
reads aloud on camera — so every filmer tapped `⟨⟨` a few times before their
first take. It now runs ~110 wpm, a natural speaking pace. The `⟨⟨` / `⟩⟩`
range is unchanged (0.1×–4.0×), so the old pace is `2.0×`.

The `~m:ss` runtime estimate beside the speed badge assumes 140 wpm at `1.0×`.
That was a ~55% over-estimate at the old speed and is now a ~20% under-estimate
— closer, but still an estimate; it can't know the phone's width or the reader's
pace. Deriving it from the scroll geometry instead would make it exact.

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
- **Reset never touches Tech I/O (v1.15.2).** The end-of-day reset clears
  checklists, check-ins, counts, radios, praise, announcements and issues. It
  leaves the **entire** Tech I/O section alone — the roster *and* the patch
  checkmarks. The I/O map is the tech team's record of how the rig is wired,
  maintained outside the event-day cycle; reset used to clear the checkmarks,
  which cost them work. The section is still captured in the pre-reset snapshot,
  so a reset stays fully recoverable.
- **Tech I/O patch checkmarks are merged per-row (v1.10.0).** A checkbox tap
  sends just that row's state (`ioSetRow`) and the server merges it into the
  stored roster — the previous design uploaded the whole roster per tap
  (last-write-wins), so two techs patching simultaneously erased each other's
  checkmarks. Wholesale `setIOList` is still used for structural edits
  (edit list / reload defaults / collapsing an IEM mix to mono), which are
  single-leader operations and leader-PIN gated. The PA output buses ride along
  on that same write.
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
  **The Tech I/O roster is included as of v1.16.0.** `setIOList` replaces a
  whole blob from the client and used to store the array verbatim, so the
  roster was the one stored collection that never met the field whitelist. It
  is now normalized on write, on seed, and on read.
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
   `test/io-consolidate.test.js` covers the routing-sheet importer: that the
   FOH and 32SC halves merge on AVB, that both channel numbers survive, and
   that the places where the sheet contradicts itself stay as two rows instead
   of being quietly resolved.

## Contributing

Push changes to a branch and open a pull request, or commit to `main` to deploy.
