import { getStore } from "@netlify/blobs";
// Starter teleprompter scripts. Missing ones are merged into the live board
// automatically on read, so every user sees every county without a leader
// having to seed anything. Generated from data/scripts.json — regenerate with
// `node scripts/sync-starter-scripts.mjs` after editing that file.
import STARTER_SCRIPTS from "./starter-scripts.mjs";
// Pre-Crusade Mobilization: starter church roster (merged on read, tombstoned
// on delete — same pattern as the starter scripts).
import STARTER_CHURCHES from "./starter-churches.mjs";
// Trailer Load List: the real bin roster from the team's inventory sheet.
// Merged on read, tombstoned on delete — same pattern again.
import STARTER_BINS from "./starter-bins.mjs";

const STORE = "k2c-ambassador";
const DEFAULT_DAY_PIN = "0711";
// Leader PIN is verified SERVER-SIDE. Rotate it by setting a LEADER_PIN
// environment variable in Netlify (Site settings → Environment variables),
// then redeploying — no code change needed.
const LEADER_PIN = () => process.env.LEADER_PIN || "2026";

/* ---------------- storage layout ----------------
 v20 (app v1.4.0) — split-by-domain blobs + compare-and-swap writes:
 core      — checklist, announcements, feedback (issues + comments), praises,
             event, dayPin, funding
 checkins  — check-in list
 io        — Tech I/O roster + patch progress
 prompter  — Recording Studio scripts. Season-long, but a county's scripts
             stop being seeded and stop being sent once its event weekend has
             passed — an invite script for a past Saturday is not something a
             volunteer should be reading to camera (see countyRetired)
 radios    — 10-radio checkout board (initials + times)
 captures  — Ambassador Quick Capture contact records (text fields only)
 miracles  — season-long Miracle Tracker: {list}. Every report (salvation,
             rededication, healing…) is one record with an OPTIONAL name, the
             reporter, and its witness confirmations. A miracle only counts in
             the tracker once at least two DISTINCT witnesses (Deuteronomy
             19:15 / 2 Corinthians 13:1 — "by the testimony of two or three
             witnesses every matter shall be established") have confirmed it —
             the reporter's own testimony is the report, not a witness, and
             one phone can't stack confirmations. Survives reset: it is the
             season's testimony record, not day-scoped data.
 binnotes  — Trailer Load List packing FYIs: {list}. Volunteers can't edit bin
             contents, but anyone can pin a quick note to a bin ("couldn't
             find the 50ft XLR", "extra patch cable tossed in 002-007") so
             the leaders hear about it WITHOUT being interrupted mid-pack.
             Leaders acknowledge & hide them once handled, like issues.
             Survives reset — the note describes the physical trailer, and
             the trailer is the same trailer next week.
 churches  — Pre-Crusade Mobilization church CRM: {rev, removed, list, log, tpl}.
             tpl = leader-edited master outreach templates {subject, email, sms};
             empty strings mean "use the client's built-in default".
             rev bumps on every write so phones only re-download the roster
             when it actually changed; the roster itself is NOT in the main
             GET payload (fetched separately via GET ?part=churches with its
             own ETag) so the 5-second poll stays light. Survives reset —
             it's a season-long relationship record, not day-scoped data.
 capmedia- — one blob per capture holding its photo/audio as a data URL,
             fetched on demand by leaders (never included in the GET payload,
             so polling stays light and contact PII isn't broadcast to every
             phone — only a count is)
 count-    — LEGACY numeric counter shard per phone (still summed, still works)
 tally-    — LEGACY per-phone delta-built tally {total, by} (still summed)
 tal2-     — v1.6.0 per-phone ABSOLUTE tally {total, by:{name:n}}. The phone
             owns its shard and pushes its whole tally each time ("my total is
             N"), so a retried or dropped request can never double-count or
             lose taps the way lost "+1 deltas" could.
 tallyEpoch— {e} rotated on every reset; a phone whose stored epoch is stale
             gets told to clear its local tally instead of re-pushing
             pre-reset numbers.
 backup-   — pre-destructive-action snapshots: reset and capturePurge write a
             backup-<ms>-<tag> copy of the data they are about to destroy
             (newest 20 kept). Recovery is manual via the Netlify Blobs UI/CLI.
 count-agg — CACHED {total, by} aggregate of every count-/tally- shard so a GET
             is one read instead of listing + fetching ~50 shards. Maintained
             incrementally on each tap and rebuilt from the shards whenever it
             is missing, so it is self-healing and can never be authoritative-
             wrong (the shards are).
 Every shared blob is now written through compareAndSwap(): read the current
 value + its etag, apply the change, write only-if-unchanged, and retry on a
 conflict. Two leaders toggling different checkmarks at the same instant can no
 longer clobber each other (the pre-CAS "last write wins" was the bug behind
 checkmarks that "only occasionally stuck").
 Old single-blob data migrates automatically on first read. */

const EMPTY_CORE = { checklist:{}, notes:{}, announcements:[], feedback:[], praises:[], event:{name:"",date:""}, dayPin:DEFAULT_DAY_PIN, funding:{pct:64, needed:"$60,000"} };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const str = (v, n) => (v == null ? "" : v.toString()).slice(0, n);
/* Record ids end up inside onclick="fn('<id>')" attributes on the client, so
   they are restricted to characters that can't break out of a JS string or an
   HTML attribute. Applied to every id the client can choose. */
export const idStr = (v, n = 40) => (v == null ? "" : v.toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, n);
/* Links are rendered as href="…" — only http(s) may through, so a stored
   javascript:/data: URL can't execute when someone taps a church website. */
export function safeUrl(v, n = 200){
 const s = str(v, n).trim();
 if(!s) return "";
 if(/^https?:\/\//i.test(s)) return s;
 if(/^[a-z][a-z0-9+.-]*:/i.test(s)) return ""; // some other scheme (javascript:, data:, …) — drop it
 return "https://" + s.replace(/^\/+/, "");
}

/* ---- user-submitted content is normalized server-side: fields are
   whitelisted, lengths capped, and priority/pri validated against a fixed set.
   This is authoritative — the client is never trusted to have escaped anything
   or to leave `hidden`/`ackBy` alone. Applied both when a new item is stored
   AND on every read, so any pre-existing junk is neutralized too. ---- */
const ISSUE_PRIOS = new Set(["low","med","urgent"]);
const ANN_PRIOS = new Set(["urgent","heads","info"]);

function normComments(list){
 if(!Array.isArray(list)) return [];
 return list.map(c => ({
  cid: idStr(c && c.cid), // client-generated id so a retried addComment can't duplicate
  name: str((c && c.name) || "Volunteer", 40),
  text: str(c && c.text, 500),
  t: str(c && c.t, 12)
 })).slice(-100);
}
export function normIssue(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  priority: ISSUE_PRIOS.has(x.priority) ? x.priority : "med",
  title: str(x.title, 140),
  body: str(x.body, 2000),
  by: str(x.by || "Volunteer", 40),
  t: str(x.t, 12),
  hidden: !!x.hidden,
  ackBy: str(x.ackBy, 40),
  ackT: str(x.ackT, 12),
  comments: normComments(x.comments)
 };
}
function normPraiseItem(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  name: str(x.name || "Anonymous", 40),
  body: str(x.body, 2000),
  t: str(x.t, 12),
  hidden: !!x.hidden,
  ackBy: str(x.ackBy, 40),
  ackT: str(x.ackT, 12),
  comments: normComments(x.comments)
 };
}
function normAnn(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  pri: ANN_PRIOS.has(x.pri) ? x.pri : "info",
  title: str(x.title, 140),
  body: str(x.body, 2000),
  by: str(x.by, 60),
  t: str(x.t, 12),
  /* Same hide/acknowledge shape as praises and issues, so setAck drives all
     three. A hidden announcement stays in the record but drops out of the
     feed, the push bar and the badge counts. */
  hidden: !!x.hidden,
  ackBy: str(x.ackBy, 40),
  ackT: str(x.ackT, 12),
  comments: normComments(x.comments)
 };
}
/* ---- Ambassador Quick Capture ----
   A capture is one street encounter: name + contact + notes, optionally with a
   photo of a filled-out contact card or a voice memo. Text fields live in the
   `captures` list; media lives in its own capmedia-<id> blob (data URL). */
const CAPTURE_LANES = new Set(["photo","audio","text"]);
const CAPTURE_MEDIA_MAX = 5 * 1024 * 1024; // ~5 MB data URL (post-compression photos & <3 min voice notes fit easily)
// Capture storage budget. Netlify Blobs has no small hard cap (5 GB per
// object; usage bills through the plan's credits), so this is OUR ceiling for
// how much media Quick Capture may hold before the dashboard warns and new
// media stops being stored. Override with a CAPTURE_BUDGET_MB env var.
const CAPTURE_BUDGET = () => Math.max(50, Number(process.env.CAPTURE_BUDGET_MB) || 1024) * 1024 * 1024;
// Old records that predate byte accounting count as a generous flat estimate
// so the meter can only over-warn, never silently under-report.
const CAPTURE_BYTES_FALLBACK = 750 * 1024;
function captureUsage(list){
 let bytes = JSON.stringify(list || []).length;
 for(const c of (list || [])) bytes += (c.bytes > 0 ? c.bytes : (c.hasMedia ? CAPTURE_BYTES_FALLBACK : 0));
 return bytes;
}
/* The counselor booklet requires the response type on every encounter, and the
   leader pipeline needs per-record follow-up state so "purge, it's all in
   Planning Center" can be verified rather than trusted. */
const CAPTURE_RESPONSES = new Set(["", "salvation", "dedication", "rededication", "prayer"]);
const CAPTURE_STATES = new Set(["new", "entered", "done"]);
export function normCapture(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  lane: CAPTURE_LANES.has(x.lane) ? x.lane : "text",
  resp: CAPTURE_RESPONSES.has(x.resp) ? x.resp : "",
  st: CAPTURE_STATES.has(x.st) ? x.st : "new",
  name: str(x.name, 80),
  phone: str(x.phone, 40),
  email: str(x.email, 80),
  county: str(x.county, 60),
  notes: str(x.notes, 4000),
  by: str(x.by || "Ambassador", 40),
  t: str(x.t, 12),
  d: str(x.d, 10),
  hasMedia: !!x.hasMedia,
  mediaKind: x.mediaKind === "photo" || x.mediaKind === "audio" ? x.mediaKind : "",
  bytes: Math.max(0, Math.min(CAPTURE_MEDIA_MAX, Number(x.bytes) || 0))
 };
}
/* Hard ceiling on stored captures. Reaching it REFUSES new records (507)
   rather than evicting old ones — see captureAdd. */
const CAPTURE_LIST_MAX = 1000;
export const normCaptures = v => Array.isArray(v) ? v.map(normCapture).slice(-CAPTURE_LIST_MAX) : [];
const capMediaKey = id => "capmedia-" + (id || "").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 40);

/* ---- Trailer Load List roster (v1.12.0) ----
   The bin roster the team recorded in their inventory sheet, seeded from
   STARTER_BINS and then owned by leaders in-app. Structure mirrors the church
   CRM: {rev, removed, list, log} in its own blob, fetched via GET ?part=bins
   with its own ETag (it's ~19 KB — far too big for the 5-second poll), rev
   bumped on every write so phones re-download only when it actually changed.
   Volunteers never write here: reporting a missing or extra item goes to
   binnotes instead, so the roster stays the leaders' record and the reports
   stay the field's observations. */
const BIN_LOG_TYPES = new Set(["add","edit","delete","items","apply"]);
export function normBin(x){
 x = x || {};
 const items = Array.isArray(x.items) ? x.items : [];
 return {
  id: idStr(x.id, 40) || uid(),
  /* Bumped on every leader edit. A leader's editor sends the version it
     opened; if it no longer matches, someone else saved first and we refuse
     rather than silently overwriting their work (see binEdit). */
  v: Math.max(0, Math.round(Number(x.v) || 0)),
  bin: str(x.bin, 12),               // the number on the lid ("109"), blank for loose gear
  sec: idStr(x.sec, 24) || "tech",
  title: str(x.title, 120),
  qty: str(x.qty, 12),
  /* Trimmed: a whitespace-only line would otherwise survive as an invisible
     bullet in the contents list (and as a blank line in the leader editor,
     which round-trips items through a textarea). */
  items: items.map(i => str(i, 300).trim()).filter(Boolean).slice(0, 80),
  loc: str(x.loc, 200),
  note: str(x.note, 300),
  empty: !!x.empty,
  by: str(x.by, 40), t: str(x.t, 12), d: str(x.d, 10)
 };
}
function normBinLog(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  bin: idStr(x.bin, 40),
  type: BIN_LOG_TYPES.has(x.type) ? x.type : "edit",
  by: str(x.by || "Leader", 40),
  note: str(x.note, 300),
  t: str(x.t, 12), d: str(x.d, 10)
 };
}
const BIN_LIST_MAX = 600;
export function normBins(v){
 v = v || {};
 return {
  rev: Math.max(0, Math.round(Number(v.rev) || 0)),
  removed: Array.isArray(v.removed) ? v.removed.map(x => idStr(x, 40)).filter(Boolean).slice(0, 400) : [],
  list: Array.isArray(v.list) ? v.list.map(normBin).slice(0, BIN_LIST_MAX) : [],
  log: Array.isArray(v.log) ? v.log.map(normBinLog).slice(-600) : [],
  /* Trailer/section labels ship with the starter data and are refreshed from
     it on read — they're structure, not content leaders edit in the app. */
  trailers: Array.isArray(v.trailers) ? v.trailers : [],
  sections: Array.isArray(v.sections) ? v.sections : []
 };
}
const emptyBins = () => ({ rev: 0, removed: [], list: [], log: [], trailers: [], sections: [] });
/* Merge any starter bin whose id is neither on the board nor tombstoned, and
   keep the trailer/section labels current. A leader's edit to a bin that
   already exists is never touched. */
function mergeStarterBins(b){
 const have = new Set(b.list.map(x => x.id));
 const gone = new Set(b.removed);
 let changed = false;
 for(const sb of (STARTER_BINS.bins || [])){
  if(!sb || !sb.id || have.has(sb.id) || gone.has(sb.id)) continue;
  b.list.push(normBin(sb));
  changed = true;
 }
 const labels = JSON.stringify([STARTER_BINS.trailers, STARTER_BINS.sections]);
 if(JSON.stringify([b.trailers, b.sections]) !== labels){
  b.trailers = STARTER_BINS.trailers || [];
  b.sections = STARTER_BINS.sections || [];
  changed = true;
 }
 if(changed) b.rev++;
 return changed;
}
const seededBins = () => { const b = emptyBins(); mergeStarterBins(b); return b; };
const casBins = (s, mutate) => compareAndSwap(s, "bins", normBins, mutate, seededBins);
function binLogPush(b, entry){ b.log.push(normBinLog(entry)); b.log = b.log.slice(-600); }
const binLogged = (b, id) => !!id && b.log.some(e => e.id === id);
/* Fields a leader may patch. `items` is handled separately (it's an array). */
const BIN_EDIT_FIELDS = ["bin","sec","title","qty","loc","note","empty"];

/* ---- load-out state (v1.12.0) ----
   Two things the roster deliberately does NOT hold, because they are the
   field's live state rather than the leaders' record of what exists:
     p — packed: this bin is on the truck. Cleared at the start of each
         load-out (binPackClear) and by the end-of-day reset.
     h — holder: who has this right now. Loose gear (the generator, the
         ladders, the Ark) is what actually goes missing BETWEEN counties, so
         custody deliberately SURVIVES reset and county switches — it is not
         day-scoped, and clearing it is an explicit "returned" tap.
   One blob, small enough to ride the main poll payload so a checkbox lights
   up on everyone's phone within a few seconds. */
const stamp = x => ({ by: str(x && x.by, 40), t: str(x && x.t, 12), d: str(x && x.d, 10) });
const BINSTATE_MAX = 800;
export function normBinState(v){
 v = v || {};
 const src = (v.marks && typeof v.marks === "object") ? v.marks : {};
 const marks = {};
 for(const k of Object.keys(src).slice(0, BINSTATE_MAX)){
  const id = idStr(k, 40);
  if(!id) continue;
  const m = src[k] || {};
  const out = {};
  if(m.p) out.p = stamp(m.p);
  if(m.h) out.h = { ...stamp(m.h), note: str(m.h.note, 120) };
  if(out.p || out.h) marks[id] = out;
 }
 return { marks };
}

/* ---- Trailer Load List packing FYIs (v1.12.0) ----
   The roster stays read-only for volunteers; this is the "throw in a thought
   as you pack" channel. A note is pinned to a bin id ("109") or is general
   ("GEN"), and carries the same acknowledge-&-hide state as issues so leaders
   can mark it handled without deleting the record.
   `kind` distinguishes the three things a packer actually reports:
     missing — it's on the list but not in the bin
     extra   — it's in the bin but not on the list
     note    — anything else worth saying
   `item` names the specific line it's about, so a leader can act on it (and,
   for extras, add it straight to the roster) without decoding prose. */
const BINNOTE_KINDS = new Set(["missing","extra","note"]);
export function normBinNote(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  bin: idStr(x.bin, 40) || "GEN",
  kind: BINNOTE_KINDS.has(x.kind) ? x.kind : "note",
  item: str(x.item, 300),
  text: str(x.text, 500),
  by: str(x.by || "Volunteer", 40),
  t: str(x.t, 12), d: str(x.d, 10),
  hidden: !!x.hidden,
  ackBy: str(x.ackBy, 40), ackT: str(x.ackT, 12)
 };
}
const BINNOTE_LIST_MAX = 400;
export function normBinNotes(v){
 v = v || {};
 /* A missing/extra report is meaningful with just the item named, so a note
    survives on EITHER a body or an item — only a truly blank one is dropped. */
 return { list: Array.isArray(v.list) ? v.list.map(normBinNote).filter(n => n.text || n.item).slice(-BINNOTE_LIST_MAX) : [] };
}

/* ---- Miracle Tracker (v1.12.0) ----
   One season-long blob ("miracles") holds every reported miracle — salvations,
   rededications, healings — with an OPTIONAL name for the person, the
   reporter, and the witnesses who have confirmed it. The validation standard
   is the biblical one: "by the testimony of two or three witnesses every
   matter shall be established" (Deuteronomy 19:15, 2 Corinthians 13:1) — so a
   report needs at least WITNESS_MIN distinct confirmations before it counts
   in the tracker. What makes a confirmation count is enforced here, not in
   the browser: the reporter can't witness their own report, the same person
   (name, case-insensitive) counts once, and the reporting phone's device id
   counts for nobody. */
export const WITNESS_MIN = 2;
const MIRACLE_TYPES = new Set(["salvation","rededication","healing","other"]);
function normWitness(x){
 x = x || {};
 return {
  wid: idStr(x.wid) || uid(), // client-generated so a retried confirmation can't duplicate
  name: str(x.name, 40),
  note: str(x.note, 200),
  dev: idStr(x.dev, 24),
  t: str(x.t, 12), d: str(x.d, 10)
 };
}
export function normMiracle(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  type: MIRACLE_TYPES.has(x.type) ? x.type : "other",
  name: str(x.name, 80),   // optional — who the Lord touched, if they're comfortable sharing
  note: str(x.note, 1000),
  county: idStr(x.county, 24),
  by: str(x.by || "Ambassador", 40),
  dev: idStr(x.dev, 24),
  t: str(x.t, 12), d: str(x.d, 10),
  witnesses: Array.isArray(x.witnesses) ? x.witnesses.map(normWitness).filter(w => w.name).slice(0, 20) : []
 };
}
const MIRACLE_LIST_MAX = 500;
export function normMiracles(v){
 v = v || {};
 return { list: Array.isArray(v.list) ? v.list.map(normMiracle).slice(0, MIRACLE_LIST_MAX) : [] };
}
/* How many confirmations actually count. Applied on READ (not just on write)
   so a record that predates a rule — or was written by an older client —
   can never validate on junk witnesses. */
export function miracleWitnessCount(m){
 m = m || {};
 const reporter = (m.by || "").trim().toLowerCase();
 const seen = new Set();
 for(const w of (m.witnesses || [])){
  const nm = (w.name || "").trim().toLowerCase();
  if(!nm) continue;
  if(nm === reporter) continue;                  // your report is your testimony, not a witness
  if(w.dev && m.dev && w.dev === m.dev) continue; // the reporting phone can't confirm itself
  seen.add(nm);
 }
 return seen.size;
}
export const miracleConfirmed = m => miracleWitnessCount(m) >= WITNESS_MIN;

/* ---- Pre-Crusade Mobilization: church CRM ----
   One blob ("churches") holds the roster + a global activity log. Every entry
   is normalized server-side (whitelisted fields, capped lengths) exactly like
   issues/praises. The log doubles as BOTH the per-church engagement history
   (filter by ch) and the app-wide change log. */
const CH_ALIGNS = new Set(["strong","partial","unverified","flagged"]);
const CH_KINDS = new Set(["church","ministry"]);
// Log types ambassadors may write without the leader PIN. Everything an
// ambassador does on a church is meant to be logged — that IS the feature.
// "convo" is the MANUAL "we actually talked with them" record — the only type
// that marks a church as engaged (tapping Call/Email never does).
const CH_OPEN_LOG = new Set(["call","text","email","convo","visit","script","share","note"]);
const CH_LOG_TYPES = new Set([...CH_OPEN_LOG, "connect","flag","unflag","edit","add","interest","delete"]);
const CH_EDIT_FIELDS = ["name","kind","town","county","state","address","phone","email","website",
 "contact","contactRole","leader","notes","intro","ask","align","interest"];

function normChConn(x){
 x = x || {};
 return { amb: str(x.amb, 40), note: str(x.note, 160), t: str(x.t, 12), d: str(x.d, 10) };
}
function normChurch(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  name: str(x.name, 120),
  kind: CH_KINDS.has(x.kind) ? x.kind : "church",
  town: str(x.town, 60),
  county: str(x.county, 40),
  state: (str(x.state, 20) || "NH").toUpperCase().slice(0, 20),
  address: str(x.address, 160),
  phone: str(x.phone, 40),
  email: str(x.email, 120),
  website: safeUrl(x.website),
  contact: str(x.contact, 80),
  contactRole: str(x.contactRole, 60),
  leader: str(x.leader, 80),
  interest: Math.max(0, Math.min(5, Math.round(Number(x.interest) || 0))),
  align: CH_ALIGNS.has(x.align) ? x.align : "unverified",
  flag: (x.flag && x.flag.reason)
   ? { reason: str(x.flag.reason, 80), note: str(x.flag.note, 300), by: str(x.flag.by, 40), t: str(x.flag.t, 12), d: str(x.flag.d, 10) }
   : null,
  notes: str(x.notes, 2000),
  intro: str(x.intro, 900),
  ask: str(x.ask, 400),
  connections: Array.isArray(x.connections) ? x.connections.map(normChConn).filter(c => c.amb).slice(0, 40) : [],
  addedBy: str(x.addedBy, 40),
  t: str(x.t, 12), d: str(x.d, 10)
 };
}
function normChLog(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  ch: idStr(x.ch),
  type: CH_LOG_TYPES.has(x.type) ? x.type : "note",
  by: str(x.by || "Ambassador", 40),
  note: str(x.note, 300),
  t: str(x.t, 12), d: str(x.d, 10)
 };
}
export function normChurches(c){
 c = c || {};
 const tpl = c.tpl || {};
 return {
  rev: Math.max(0, Math.round(Number(c.rev) || 0)),
  removed: Array.isArray(c.removed) ? c.removed.map(x => str(x, 40)).filter(Boolean).slice(0, 500) : [],
  list: Array.isArray(c.list) ? c.list.map(normChurch).slice(0, 800) : [],
  log: Array.isArray(c.log) ? c.log.map(normChLog).slice(-1200) : [],
  // Master outreach templates — one email & one text for EVERY church, so the
  // whole team sends the same message. Leader-editable (churchTemplate).
  tpl: { subject: str(tpl.subject, 200), email: str(tpl.email, 4000), sms: str(tpl.sms, 600) }
 };
}
const emptyChurches = () => ({ rev: 0, removed: [], list: [], log: [] });
// Writes seed the starter roster too, so a POST that lands before the first
// roster read (fresh deploy) can't no-op against an empty list.
const seededChurches = () => { const c = emptyChurches(); mergeStarterChurches(c); return c; };
const casChurches = (s, mutate) => compareAndSwap(s, "churches", normChurches, mutate, seededChurches);
function chLogPush(c, entry){ c.log.push(normChLog(entry)); c.log = c.log.slice(-1200); }
/* Belt + braces against the retry-duplication bug: a mutate that already ran
   (its log-entry id is present) must be a no-op. Every church action passes a
   client-generated id for its log entry. */
const chLogged = (c, id) => !!id && c.log.some(e => e.id === id);
/* One-time cleanup of logs that were duplicated before the fix: identical
   ch+type+by+note+date+time tuples collapse to the first occurrence. */
function chCompactLog(c){
 const seen = new Set(); const out = [];
 for(const e of c.log){
  const k = e.ch + "|" + e.type + "|" + e.by + "|" + e.note + "|" + e.d + "|" + e.t;
  if(seen.has(k)) continue;
  seen.add(k); out.push(e);
 }
 const changed = out.length !== c.log.length;
 c.log = out;
 return changed;
}
/* Merge any starter church whose id is neither on the board nor tombstoned. */
function mergeStarterChurches(c){
 const have = new Set(c.list.map(x => x.id));
 const gone = new Set(c.removed);
 let added = false;
 for(const sc of STARTER_CHURCHES){
  if(!sc || !sc.id || have.has(sc.id) || gone.has(sc.id)) continue;
  c.list.push(normChurch(sc));
  added = true;
 }
 if(added) c.rev++;
 return added;
}

export function normCheckin(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  name: str(x.name, 40),
  team: str(x.team, 40),
  attested: !!x.attested,
  t: str(x.t, 12)
 };
}

/* Leader-added checklist items. The built-in SETUP list is hardcoded in the
   client, but the season runs across eight very different venues (fairgrounds,
   ski areas, a speedway), so leaders need per-event extras without a redeploy.
   Stored with client-generated stable ids and merged at render — same pattern
   as the starter scripts and the I/O roster. */
const EXTRA_DAYS = new Set(["fri","sat"]);
const EXTRA_CATS = new Set(["tech","log","both"]);
function normExtraItem(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  day: EXTRA_DAYS.has(x.day) ? x.day : "sat",
  cat: EXTRA_CATS.has(x.cat) ? x.cat : "log",
  text: str(x.text, 180),
  due: Math.max(0, Math.min(1439, Math.round(Number(x.due) || 0))),
  by: str(x.by, 40)
 };
}
const normExtras = v => Array.isArray(v) ? v.map(normExtraItem).filter(x => x.text).slice(0, 100) : [];

export function normCore(c){
 c = c || {};
 return {
 checklist: c.checklist || {},
 extras: normExtras(c.extras),
 notes: normNotes(c.notes),
 announcements: Array.isArray(c.announcements) ? c.announcements.map(normAnn).slice(0, 200) : [],
 feedback: Array.isArray(c.feedback) ? c.feedback.map(normIssue).slice(0, 500) : [],
 praises: Array.isArray(c.praises) ? c.praises.map(normPraiseItem).slice(0, 500) : [],
 // shift = rain-date offset in days (0 normally, 1 when moved to Sunday)
 event: { name: str(c.event && c.event.name, 80), date: str(c.event && c.event.date, 40),
          shift: Math.max(0, Math.min(2, Math.round(Number(c.event && c.event.shift) || 0))) },
 // One-time migration: retire the old 0627 Day PIN in favor of 0711.
 dayPin: (typeof c.dayPin === "string" && c.dayPin !== "0627") ? c.dayPin : DEFAULT_DAY_PIN,
 funding: { pct: clampPct(c.funding && c.funding.pct), needed: ((c.funding && c.funding.needed) || "$60,000").toString().slice(0, 30) }
 };
}
function clampPct(n){ n = Number(n); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 64; }
/* Per-checklist-item notes: { [itemId]: "text" }. Keys and values are capped;
   empty values are dropped so the map only ever holds real notes. */
function normNotes(n){
 if(!n || typeof n !== "object") return {};
 const out = {};
 for(const k of Object.keys(n).slice(0, 1000)){
  const key = str(k, 60), val = str(n[k], 500).trim();
  if(key && val) out[key] = val;
 }
 return out;
}

export function normPrompter(p){
 p = p || {};
 const scripts = Array.isArray(p.scripts) ? p.scripts : [];
 return {
 // Tombstones: starter scripts a leader deleted stay deleted instead of
 // being re-merged on the next read.
 removed: Array.isArray(p.removed) ? p.removed.map(x => str(x, 40)).filter(Boolean).slice(0, 400) : [],
 scripts: scripts.map(sc => ({
 id: idStr(sc.id),
 event: (sc.event || "").toString().slice(0, 60),
 title: (sc.title || "").toString().slice(0, 80),
 due: (sc.due || "").toString().slice(0, 10),
 assignee: (sc.assignee || "").toString().slice(0, 30),
 body: (sc.body || "").toString().slice(0, 20000),
 done: sc.done && sc.done.initials
 ? { initials:(sc.done.initials||"").toString().slice(0,40), date:(sc.done.date||"").toString().slice(0,12) }
 : null
 })).slice(0, 200) };
}

/* Merge any starter script whose id is neither on the board nor tombstoned —
   and whose county the season hasn't already driven past (see countyRetired).
   Returns true when something was added (i.e. a write is warranted). */
function mergeStarterScripts(p){
 const have = new Set(p.scripts.map(x => x.id));
 const gone = new Set(p.removed);
 let added = false;
 for(const sc of STARTER_SCRIPTS){
  if(!sc || !sc.id || have.has(sc.id) || gone.has(sc.id) || scriptRetired(sc)) continue;
  p.scripts.push(normPrompter({ scripts: [sc] }).scripts[0]);
  added = true;
 }
 return added;
}

/* ---- radios ---- */
function defaultRadios(){ const a = []; for(let i = 1; i <= 10; i++) a.push({ n:i, out:null, in:null }); return a; }
function normStamp(x){ if(!x || !x.by) return null; return { by:(x.by || "").toString().slice(0, 40), t:(x.t || "").toString().slice(0, 12) }; }
function normRadios(r){
 const src = (r && Array.isArray(r.list)) ? r.list : [];
 const out = defaultRadios();
 for(const it of src){
 const n = Number(it && it.n);
 if(n >= 1 && n <= 10) out[n-1] = { n, out: normStamp(it.out), in: normStamp(it.in) };
 }
 return { list: out };
}
const normCheckins = v => Array.isArray(v) ? v.map(normCheckin).slice(-2000) : [];
/* Tech I/O roster. Previously stored verbatim from the client — the only blob
   where a caller controlled both structure and size. Fields are whitelisted and
   capped like everything else, and ids are id-safe because the client renders
   them into onclick="ioToggle('<id>','<id>')". */
const IO_MODES = new Set(["stereo","mono","none"]);
function normIORow(r){
 r = r || {};
 return {
  id: idStr(r.id) || uid(),
  role: str(r.role, 60), gear: str(r.gear, 60), loc: str(r.loc, 60),
  /* v1.16.0 — the routing columns the table views read. AVB is the key the
     FOH board and the 32SC monitor console agree on; the channel numbers are
     per-console and routinely disagree, so both are kept. The alt* fields hold
     the 32SC's reading wherever it differs from the FOH one, so neither
     console's version of the truth is thrown away. */
  avb: str(r.avb, 8), foh: str(r.foh, 16), sc: str(r.sc, 16),
  /* The three ways a signal gets in: the on-stage snake, the Ark XLR splitter
     (which feeds the 32R), or straight onto AVB from a computer. */
  snake: str(r.snake, 12), split: str(r.split, 12), r32: str(r.r32, 12), path: str(r.path, 8),
  port: str(r.port, 60), altPort: str(r.altPort, 60),
  note: str(r.note, 80), altNote: str(r.altNote, 80), altGear: str(r.altGear, 60),
  src: str(r.src, 60), stereo: !!r.stereo, p48: !!r.p48,
  done: !!r.done, by: str(r.by, 40), t: str(r.t, 12)
 };
}
function normIOShare(s){
 s = s || {};
 return { pack: str(s.pack, 30), name: str(s.name, 60), dest: str(s.dest, 60) };
}
function normIOPerf(p){
 p = p || {};
 const mode = IO_MODES.has(str(p.mode, 8)) ? str(p.mode, 8) : "none";
 return {
  id: idStr(p.id) || uid(),
  name: str(p.name, 60), inst: str(p.inst, 60), pack: str(p.pack, 30),
  color: /^#[0-9a-f]{3,8}$/i.test(str(p.color, 9)) ? str(p.color, 9) : "#c7c2b8",
  qmix: str(p.qmix, 20), tx: str(p.tx, 60), off: !!p.off,
  /* IEM mix slot: a stereo mix owns an aux pair and a whole transmitter, a
     mono mix owns one aux and one leg of one, so two people can share it. */
  aux: str(p.aux, 20), out: str(p.out, 20), txUnit: str(p.txUnit, 8),
  leg: /^[LR]$/i.test(str(p.leg, 1)) ? str(p.leg, 1).toUpperCase() : "",
  mode, dest: str(p.dest, 60), kind: str(p.kind, 12),
  share: (Array.isArray(p.share) ? p.share : []).map(normIOShare).slice(0, 8),
  rows: (Array.isArray(p.rows) ? p.rows : []).map(normIORow).slice(0, 60)
 };
}
function normIOBus(b){
 b = b || {};
 return {
  id: idStr(b.id) || uid(),
  bus: str(b.bus, 40), sig: str(b.sig, 60), dest: str(b.dest, 60),
  hw: str(b.hw, 60), purpose: str(b.purpose, 80), off: !!b.off
 };
}
export const normIO = v => ({
 list: (v && Array.isArray(v.list)) ? v.list.map(normIOPerf).slice(0, 80) : [],
 buses: (v && Array.isArray(v.buses)) ? v.buses.map(normIOBus).slice(0, 40) : []
});

/* ---- PIN brute-force protection ----
   Per-IP sliding window kept in a blob: 15 wrong PIN entries in 10 minutes
   blocks further PIN checks from that IP until the window slides past.
   Forgiving on purpose — event WiFi/CGNAT can put several phones behind one
   IP and morning-huddle typos are normal, so the threshold is generous,
   empty PINs are never counted, and a correct leader PIN clears the record. */
const PIN_MAX_FAILS = 15, PIN_WINDOW_MS = 10 * 60 * 1000;
function pinFailKey(req, context){
 let ip = (context && context.ip)
  || req.headers.get("x-nf-client-connection-ip")
  || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
  || "unknown";
 ip = ip.toString().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 48) || "unknown";
 return "pinfail-" + ip;
}
async function pinFails(s, key){
 let rec = null;
 try { rec = await s.get(key, { type:"json" }); } catch(_) {}
 const cutoff = Date.now() - PIN_WINDOW_MS;
 return (rec && Array.isArray(rec.t) ? rec.t : []).filter(t => t > cutoff);
}
async function pinNoteFail(s, key){
 const t = await pinFails(s, key);
 t.push(Date.now());
 await s.setJSON(key, { t: t.slice(-PIN_MAX_FAILS * 2) }).catch(() => {});
}
const pinBlockedResp = () => json({ error:"too many wrong PIN attempts — wait 10 minutes and try again", rateLimited:true }, 429);

/* ---- per-IP write budget ----
   Even behind the Day PIN, one runaway retry loop (or one bored volunteer)
   could push enough writes to evict older records from the capped lists. This
   is a coarse ceiling — far above anything a human does during an event, low
   enough to stop a script. Media uploads get their own tighter budget because
   each one costs megabytes. */
const WRITE_MAX = 400, WRITE_WINDOW_MS = 10 * 60 * 1000;
const MEDIA_MAX_PER_IP = 40, MEDIA_WINDOW_MS = 60 * 60 * 1000;
async function rateHit(s, key, windowMs, max){
 let rec = null;
 try { rec = await s.get(key, { type:"json" }); } catch(_) {}
 const cutoff = Date.now() - windowMs;
 const t = (rec && Array.isArray(rec.t) ? rec.t : []).filter(x => x > cutoff);
 if(t.length >= max) return false;
 t.push(Date.now());
 await s.setJSON(key, { t: t.slice(-max * 2) }).catch(() => {});
 return true;
}
const rateBlockedResp = what => json({ error:"too many " + what + " from this connection — wait a few minutes", rateLimited:true }, 429);

const LEADER_ACTIONS = new Set([
 /* NOTE: ioSetRow (a patch checkmark) is deliberately NOT here — the Tech I/O
    page is open to every tech behind the Day PIN, same as radios and the head
    count. Only STRUCTURAL roster edits (setIOList) need the leader PIN. */
 "toggleCheck","setCheck","setChecklistNote","addChecklistItem","removeChecklistItem","seasonList",
 "addAnnouncement","ackCard","setAck","setEvent","setIOList","setDayPin","captureSetState","setCounty",
 "setFunding","reset","promptSeed","promptAdd","promptEdit","promptDelete",
 "capturesList","captureMedia","captureDelete","capturePurge","revokeLeaderTokens",
 "churchEdit","churchDelete","churchFlagClear","churchTemplate","miracleDelete","binNoteAck","annDelete",
 /* The trailer roster is the leaders' record — volunteers report against it
    (binNoteAdd) but never write it. */
 "binEdit","binAdd","binDelete","binItemAdd","binPackClear"
]);

/* ---------------- per-county scoping (v1.11.0) ----------------
 Each county event is its own dataset. Day-scoped blobs carry a "~<county>"
 suffix, so switching the active county in the leader dashboard swaps the whole
 board — checklists, check-ins, counts, radios, issues, announcements, I/O
 progress — instead of the team having to reset and lose the last event.
 Season-long data (church CRM, teleprompter scripts, Quick Captures, season
 summaries, backups, tokens, rate limits) is NOT scoped, and neither is the
 Day PIN: those are shared across the whole season.
 An empty county (nothing selected yet) keeps the original unscoped keys, so
 existing deployments behave exactly as before until a leader picks a county. */
/* ---------------- season schedule ----------------
 The eight Saturday events. This drives BOTH the active county and the Day PIN
 so neither has to be set by hand:
   • The Day PIN is simply the event's Saturday as MMDD (Jul 25 → "0725").
   • An event stays current through its Sunday — the rain date — and the next
     one takes over on the Monday following.
 Keep in step with COUNTIES in js/counties.js (same keys); the dates live here
 because the server is the one that has to be right about them. */
const SCHEDULE = [
 { key:"sullivan",   date:"2026-06-13" },
 { key:"grafton",    date:"2026-06-27" },
 { key:"strafford",  date:"2026-07-11" },
 { key:"carroll",    date:"2026-07-25" },
 { key:"cheshire",   date:"2026-08-15" },
 { key:"belknap",    date:"2026-08-22" },
 { key:"coos",       date:"2026-09-05" },
 { key:"rockingham", date:"2026-10-10" }
];
const COUNTY_KEYS = new Set(SCHEDULE.map(e => e.key));
/* "Today" in New Hampshire, not UTC — otherwise the PIN would roll over at
   8pm local on the Sunday, mid-teardown. */
const EVENT_TZ = "America/New_York";
function todayLocalISO(now){
 try {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TZ, year:"numeric", month:"2-digit", day:"2-digit" })
   .format(now || new Date());
 } catch(_) {
  return (now || new Date()).toISOString().slice(0, 10);
 }
}
const addDaysISO = (iso, n) => {
 const d = new Date(iso + "T12:00:00Z");
 d.setUTCDate(d.getUTCDate() + n);
 return d.toISOString().slice(0, 10);
};
/* The event whose window contains `todayISO`: current through its Sunday, then
   the next one takes over on Monday. Before the season, the first event; after
   it, the last (the board simply stays put). */
export function currentEvent(todayISO){
 const today = todayISO || todayLocalISO();
 for(const e of SCHEDULE){
  if(addDaysISO(e.date, 1) >= today) return e;   // still on/through its Sunday
 }
 return SCHEDULE[SCHEDULE.length - 1];
}
/* Day PIN for an event = its Saturday as MMDD. */
export const pinForDate = iso => (iso || "").slice(5, 7) + (iso || "").slice(8, 10);
export const autoDayPin = todayISO => pinForDate(currentEvent(todayISO).date);

/* ---------------- retiring a past county's scripts (v1.17.0) ----------------
 The Recording Studio board is season-long, so left alone it only ever grows:
 by August a volunteer opening it scrolls past Sullivan, Grafton and Strafford
 — invitations to Saturdays that already happened — to reach the county they
 are actually filming for. An invite script IS an invitation, and reading a
 dead one to camera invites people to a date that has passed.
 So a county's scripts leave the board on exactly the schedule the Day PIN
 rolls over: current through the event's Sunday (the rain date), retired on the
 Monday following. Nobody has to delete anything.
 They are FILTERED, not deleted: the stored board keeps them, so correcting a
 date in SCHEDULE brings a county straight back, and Laura's record of who
 filmed what survives the season. Retired counties are simply never re-seeded. */
const deburr = s => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function countyRetired(key, todayISO){
 const e = SCHEDULE.find(x => x.key === key);
 if(!e) return false;                       // not a scheduled county — leave it alone
 return (todayISO || todayLocalISO()) > addDaysISO(e.date, 1);
}
/* Which county a script belongs to. Starter ids are "<key>-A"; a script written
   in the editor carries the county's `event` string ("Coös County — Sep 5 · …",
   deburred so the ö matches the "coos" key). A leader's custom-event script
   places as nothing and therefore never retires. */
export function scriptCounty(sc){
 const id = deburr(sc && sc.id), cut = id.lastIndexOf("-");
 if(cut > 0 && COUNTY_KEYS.has(id.slice(0, cut))) return id.slice(0, cut);
 const ev = deburr(sc && sc.event);
 for(const e of SCHEDULE) if(ev.indexOf(e.key + " county") === 0) return e.key;
 return "";
}
export const scriptRetired = (sc, todayISO) => countyRetired(scriptCounty(sc), todayISO);
const liveScripts = (list, todayISO) => (list || []).filter(sc => !scriptRetired(sc, todayISO));
const scopeSuffix = cty => (cty ? "~" + cty : "");
function mkKeys(cty){
 const x = scopeSuffix(cty);
 return {
  cty,
  core: "core" + x,
  checkins: "checkins" + x,
  io: "io" + x,
  radios: "radios" + x,
  agg: "count-agg" + x,
  decAgg: "dec-agg" + x,
  epoch: "tallyEpoch" + x,
  // shard prefixes (per-phone counters)
  countPre: "count" + x + "-",
  tallyPre: "tally" + x + "-",
  tal2Pre: "tal2" + x + "-",
  dec2Pre: "dec2" + x + "-"
 };
}
const ACTIVE_KEY = "active";
/* One-time adoption. Before per-county scoping every board lived in unscoped
   blobs ("core", "checkins", …). The moment scoping switches on, the live
   county's keys are "core~<county>" — which would be empty, so a board in use
   would look wiped. This copies the existing unscoped data into whichever
   county is current the first time we run, then records that it has happened.
   Safe to call on every request: it is a no-op once `migrated` is set, and it
   never overwrites a county that already has data. */
async function ensureScopeReady(s){
 let a = null;
 try { a = await s.get(ACTIVE_KEY, { type:"json" }); } catch(_) {}
 if(a && a.migrated) return;
 const to = mkKeys(currentEvent().key), from = mkKeys("");
 const pairs = [
  [from.core, to.core], [from.checkins, to.checkins], [from.io, to.io],
  [from.radios, to.radios], [from.agg, to.agg], [from.decAgg, to.decAgg], [from.epoch, to.epoch]
 ];
 await Promise.all(pairs.map(async ([src, dst]) => {
  const [have, already] = await Promise.all([ s.get(src, { type:"json" }), s.get(dst, { type:"json" }) ]);
  if(have != null && already == null) await s.setJSON(dst, have).catch(() => {});
 }));
 await s.setJSON(ACTIVE_KEY, { county: (a && a.county) || "", mode: (a && a.mode) || "auto", migrated: true }).catch(() => {});
}
/* Which county's board is live. Default is AUTO: it follows the schedule, so
   the board moves to the next county on the Monday after each event with
   nobody touching anything. A leader can pin a county manually (mode:"manual")
   — e.g. to go back and finish last week's checklist — and switch back to
   automatic whenever they like. */
async function readActive(s){
 let a = null;
 try { a = await s.get(ACTIVE_KEY, { type:"json" }); } catch(_) {}
 const stored = idStr((a && a.county) || "", 24);
 const manual = !!(a && a.mode === "manual");
 const auto = currentEvent().key;
 const county = manual ? (COUNTY_KEYS.has(stored) ? stored : "") : auto;
 return { county, manual, autoCounty: auto, migrated: !!(a && a.migrated) };
}
/* The Day PIN is deliberately global — one PIN for the season, not one per
   county — so it lives in its own blob. Migrated out of core on first read. */
const DAYPIN_KEY = "daypin";
/* The Day PIN is the event's Saturday as MMDD, derived automatically unless a
   leader has explicitly set one. Returns {pin, manual, auto}. */
async function readDayPinCfg(s){
 let d = null;
 try { d = await s.get(DAYPIN_KEY, { type:"json" }); } catch(_) {}
 const auto = autoDayPin();
 // A stored record without an explicit mode came from an older client that
 // only ever set a PIN by hand — honour it as manual.
 if(d && typeof d.pin === "string" && d.mode !== "auto") return { pin: d.pin, manual: true, auto };
 return { pin: auto, manual: false, auto };
}
async function readDayPin(s, K){ return (await readDayPinCfg(s)).pin; }

function devKey(id, K){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return (K ? K.countPre : "count-") + id;
}
function tallyKey(id, K){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return (K ? K.tallyPre : "tally-") + id;
}
function tal2Key(id, K){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return (K ? K.tal2Pre : "tal2-") + id;
}
function dec2Key(id, K){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return (K ? K.dec2Pre : "dec2-") + id;
}
async function readEpoch(s, K){
 let e = null;
 try { e = await s.get(K.epoch, { type:"json" }); } catch(_) {}
 return (e && typeof e.e === "string") ? e.e : "";
}

/* ---------------- compare-and-swap ----------------
 Read a blob with its etag, let `mutate` produce the next value, then write
 only-if-the-etag-still-matches (or only-if-new when the blob is absent). On a
 conflict (someone else wrote first) we re-read and re-apply. `mutate` MUST be a
 pure function of the freshly-read value — that is what makes concurrent writers
 safe. Returning undefined from `mutate` means "no change, don't write".
 Between retries we sleep a jittered, growing backoff so a burst of writers on
 the same blob de-synchronizes instead of thundering in lockstep. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const backoff = attempt => sleep(Math.floor(Math.random() * 25) + attempt * 4);

async function compareAndSwap(s, key, normalize, mutate, fallback){
 for(let attempt = 0; attempt < 30; attempt++){
  if(attempt) await backoff(attempt);
  let res = null;
  try { res = await s.getWithMetadata(key, { type:"json" }); } catch(_) { res = null; }
  const exists = !!(res && res.data != null);
  let base = exists ? res.data : (typeof fallback === "function" ? await fallback() : (fallback ?? null));
  if(normalize) base = normalize(base);
  const next = mutate(base);
  if(next === undefined) return base; // caller signalled no-op
  const opts = exists ? { onlyIfMatch: res.etag } : { onlyIfNew: true };
  let w;
  try { w = await s.setJSON(key, next, opts); } catch(_) { w = { modified:false }; }
  if(w && w.modified) return next;
  /* The write may have LANDED even though we couldn't confirm it (an error
     thrown after the commit, or a client that doesn't report `modified`).
     Blindly retrying then re-applies `mutate` on a base that already contains
     the change — for append-style mutates (log entries, announcements) that
     stamps the same record out once per retry (the "26 duplicate log entries
     from one tap" bug). Verify by re-reading before looping. */
  try {
   const chk = await s.getWithMetadata(key, { type:"json" });
   if(chk && JSON.stringify(chk.data) === JSON.stringify(next)) return next;
  } catch(_) {}
 }
 throw new Error("write conflict: " + key);
}
/* ---- pre-destructive-action snapshots (v1.10.0) ----
   reset and capturePurge copy the data they are about to destroy into a
   backup-<ms>-<tag> blob first (newest 20 kept; keys sort chronologically).
   There is no in-app restore: recover by copying a backup's contents back
   over the live blobs via the Netlify Blobs UI or CLI. Capture MEDIA blobs
   are not snapshotted (too large) — only the text records. Best-effort by
   design: a snapshot failure never blocks the action itself. */
async function snapshot(s, tag, data){
 try {
  await s.setJSON("backup-" + Date.now() + "-" + tag, { at: new Date().toISOString(), tag, data });
  const { blobs } = await s.list({ prefix: "backup-" });
  const keys = (blobs || []).map(b => b.key).sort();
  for(const k of keys.slice(0, Math.max(0, keys.length - 20))) await s.delete(k).catch(() => {});
 } catch(_) {}
}

const legacyState = s => async () => (await s.get("state", { type:"json" })) || {};
const casCore = (s, K, mutate) => compareAndSwap(s, K.core, normCore, mutate, legacyState(s));

async function readAll(s, K){
 const [core, checkins, io, prompter, radios] = await Promise.all([
 s.get(K.core, { type:"json" }),
 s.get(K.checkins, { type:"json" }),
 s.get(K.io, { type:"json" }),
 s.get("prompter", { type:"json" }),   // season-long, never county-scoped
 s.get(K.radios, { type:"json" })
 ]);
 return { core, checkins, io, prompter, radios };
}

async function migrateIfNeeded(s, K, parts){
 if(parts.core) return parts; // already on split layout
 const old = await s.get("state", { type:"json" });
 const core = normCore(old || {});
 const checkins = normCheckins((old && old.checkins) || []);
 const io = { list: (old && old.ioList) || [], buses: (old && old.ioBuses) || [] };
 const prompter = normPrompter(old && old.prompter);
 await Promise.all([
 s.setJSON(K.core, core),
 s.setJSON(K.checkins, checkins),
 s.setJSON(K.io, io),
 s.setJSON("prompter", prompter),
 (old && old.count) ? s.setJSON(devKey("legacy", K), old.count) : Promise.resolve()
 ]);
 // old "state" blob is left in place untouched as a safety net
 return { core, checkins, io, prompter, radios: parts.radios || null };
}

/* ---- head count aggregation ---- */
async function sumCounts(s, K){
 let total = 0;
 const { blobs } = await s.list({ prefix: K.countPre });
 await Promise.all((blobs || []).map(async b => {
 const n = await s.get(b.key, { type:"json" });
 if(typeof n === "number") total += n;
 }));
 return Math.max(0, total);
}
async function sumTally(s, K){
 let total = 0; const by = {};
 const [t1, t2] = await Promise.all([ s.list({ prefix: K.tallyPre }), s.list({ prefix: K.tal2Pre }) ]);
 const blobs = [ ...((t1 && t1.blobs) || []), ...((t2 && t2.blobs) || []) ];
 await Promise.all(blobs.map(async b => {
 const tally = compactTally(await s.get(b.key, { type:"json" }));
 total += tally.total;
 for(const k of Object.keys(tally.by)) by[k] = (by[k] || 0) + tally.by[k];
 }));
 for(const k of Object.keys(by)) by[k] = Math.max(0, by[k]);
 return { total: Math.max(0, total), by };
}

/* Convert the old growing tap log to one compact per-device summary.
   Each device owns its own key, so 2-3 counters never overwrite each other. */
export function compactTally(value){
 const out = { total:0, by:{} };
 if(Array.isArray(value)){
 for(const e of value){
 const d = Number(e && e.delta) || 0;
 const k = ((e && e.by) || "?").toString().slice(0, 40) || "?";
 out.total += d; out.by[k] = (out.by[k] || 0) + d;
 }
 }else if(value && typeof value === "object"){
 out.total = Number(value.total) || 0;
 const src = value.by && typeof value.by === "object" ? value.by : {};
 for(const k of Object.keys(src)) out.by[k] = Number(src[k]) || 0;
 }
 out.total = Math.max(0, out.total);
 for(const k of Object.keys(out.by)) out.by[k] = Math.max(0, out.by[k]);
 return out;
}

/* ---- decisions aggregate (mirrors count-agg, own namespace) ---- */
async function rebuildDecAgg(s, K){
 let total = 0; const by = {};
 const { blobs } = await s.list({ prefix: K.dec2Pre });
 await Promise.all((blobs || []).map(async b => {
  const t = compactTally(await s.get(b.key, { type:"json" }));
  total += t.total;
  for(const k of Object.keys(t.by)) by[k] = (by[k] || 0) + t.by[k];
 }));
 return { total: Math.max(0, total), by };
}
async function readDecAgg(s, K){
 let agg = await s.get(K.decAgg, { type:"json" });
 if(!agg || typeof agg.total !== "number" || !agg.by || typeof agg.by !== "object"){
  agg = await rebuildDecAgg(s, K);
  await s.setJSON(K.decAgg, agg).catch(() => {});
 }
 return agg;
}
async function bumpDecAgg(s, K, effTotal, effBy){
 for(let attempt = 0; attempt < 20; attempt++){
  if(attempt) await backoff(attempt);
  let res = null;
  try { res = await s.getWithMetadata(K.decAgg, { type:"json" }); } catch(_) { res = null; }
  if(!(res && res.data && typeof res.data.total === "number")){
   const fresh = await rebuildDecAgg(s, K);
   let w; try { w = await s.setJSON(K.decAgg, fresh, { onlyIfNew:true }); } catch(_) { w = { modified:false }; }
   if(w && w.modified) return;
   continue;
  }
  const agg = { total: Math.max(0, (Number(res.data.total) || 0) + (effTotal || 0)), by: { ...res.data.by } };
  if(effBy) for(const k of Object.keys(effBy)) agg.by[k] = Math.max(0, (Number(agg.by[k]) || 0) + effBy[k]);
  let w; try { w = await s.setJSON(K.decAgg, agg, { onlyIfMatch: res.etag }); } catch(_) { w = { modified:false }; }
  if(w && w.modified) return;
 }
 await s.delete(K.decAgg).catch(() => {});
}

/* Authoritative rebuild of the head count from every shard (legacy + tally). */
async function rebuildAgg(s, K){
 const [cnt, tally] = await Promise.all([sumCounts(s, K), sumTally(s, K)]);
 return { total: Math.max(0, cnt + tally.total), by: tally.by };
}
/* Fast read: use the cached aggregate; rebuild + seed it if it is missing. */
async function readAgg(s, K){
 let agg = await s.get(K.agg, { type:"json" });
 if(!agg || typeof agg.total !== "number" || !agg.by || typeof agg.by !== "object"){
  agg = await rebuildAgg(s, K);
  await s.setJSON(K.agg, agg).catch(() => {});
 }
 return agg;
}
/* Apply an already-persisted shard delta to the cached aggregate under CAS.
   If it drifts or we can't win the race, we delete it so the next read rebuilds
   from the shards (which are the source of truth) — never wrong for long. */
async function bumpAgg(s, K, effTotal, effBy){
 for(let attempt = 0; attempt < 20; attempt++){
  if(attempt) await backoff(attempt);
  let res = null;
  try { res = await s.getWithMetadata(K.agg, { type:"json" }); } catch(_) { res = null; }
  if(!(res && res.data && typeof res.data.total === "number")){
   // No cache yet — seed it from the shards (which already include this tap).
   const fresh = await rebuildAgg(s, K);
   let w; try { w = await s.setJSON(K.agg, fresh, { onlyIfNew:true }); } catch(_) { w = { modified:false }; }
   if(w && w.modified) return;
   continue; // someone else seeded it; loop to apply our delta on top
  }
  const agg = { total: Math.max(0, (Number(res.data.total) || 0) + (effTotal || 0)), by: { ...res.data.by } };
  if(effBy) for(const k of Object.keys(effBy)) agg.by[k] = Math.max(0, (Number(agg.by[k]) || 0) + effBy[k]);
  let w; try { w = await s.setJSON(K.agg, agg, { onlyIfMatch: res.etag }); } catch(_) { w = { modified:false }; }
  if(w && w.modified) return;
 }
 await s.delete(K.agg).catch(() => {}); // give up cleanly → next read rebuilds
}

async function assemble(s, K, active, lvl){
 let parts = await readAll(s, K);
 parts = await migrateIfNeeded(s, K, parts);
 const core = normCore(parts.core);
 const [agg, decAgg, tallyEpoch, capturesRaw, churchesRaw, miraclesRaw, binNotesRaw, binsRaw, binStateRaw, pinCfg] = await Promise.all([ readAgg(s, K), readDecAgg(s, K), readEpoch(s, K), s.get("captures", { type:"json" }), s.get("churches", { type:"json" }), s.get("miracles", { type:"json" }), s.get("binnotes", { type:"json" }), s.get("bins", { type:"json" }), s.get("binstate", { type:"json" }), readDayPinCfg(s) ]);
 const dayPin = pinCfg.pin;
 /* Leaders (and only leaders) get the actual PIN plus when it rolls over, so
    they can read it out at the huddle and tell people what changes Monday.
    Volunteer clients still never receive it. */
 let leaderInfo = {};
 if(lvl === "leader"){
  const ev = currentEvent(), i = SCHEDULE.indexOf(ev), nx = SCHEDULE[i + 1] || null;
  leaderInfo = {
   dayPin,
   dayPinManual: pinCfg.manual,
   dayPinAuto: pinCfg.auto,
   eventDate: ev.date,
   pinRollsOver: nx ? addDaysISO(ev.date, 2) : "",   // the Monday after this event
   nextCounty: nx ? nx.key : "",
   nextPin: nx ? pinForDate(nx.date) : ""
  };
 }
 const captures = normCaptures(capturesRaw);
 // Only the rev + count ride in the main payload; the roster itself is
 // fetched on demand (GET ?part=churches) so polling stays light.
 const churchesRev = Math.max(0, Math.round(Number(churchesRaw && churchesRaw.rev) || 0));
 const churchCount = (churchesRaw && Array.isArray(churchesRaw.list)) ? churchesRaw.list.length : 0;
 // Self-seeding script board: fill in any missing starter scripts (no-op
 // write when nothing is missing, so the usual GET stays read-only). Counties
 // the season has already driven past are neither seeded nor sent — the board
 // a volunteer opens is only the counties still ahead.
 const prompterAll = await compareAndSwap(s, "prompter", normPrompter,
  p => mergeStarterScripts(p) ? p : undefined, () => ({ scripts: [] }));
 const prompter = { ...prompterAll, scripts: liveScripts(prompterAll.scripts) };
 return {
 checklist: core.checklist,
 extras: core.extras,
 notes: core.notes,
 announcements: core.announcements,
 checkins: normCheckins(parts.checkins),
 feedback: core.feedback,
 praises: core.praises,
 count: Math.max(0, agg.total),
 tallyBy: agg.by || {},
 decisions: Math.max(0, decAgg.total),
 decBy: decAgg.by || {},
 tallyEpoch,
 radios: normRadios(parts.radios).list,
 event: core.event,
 /* Normalized on the way out too, so a roster written by an older deploy —
    before setIOList normalized on write — is neutralized on read. */
 ioList: normIO(parts.io).list,
 ioBuses: normIO(parts.io).buses,
 dayPinSet: !!dayPin, // the PIN itself is never sent to clients
 county: K.cty,          // which county's board this is
 countyAuto: !active.manual,
 ...leaderInfo,
 funding: core.funding,
 prompter: prompter,
 // Quick Capture records hold seekers' contact info, so the shared payload
 // only carries the count + storage usage; leaders pull the actual list
 // with the capturesList action.
 captureCount: captures.length,
 captureBytes: captureUsage(captures),
 captureBudget: CAPTURE_BUDGET(),
 // Season-long, shared with everyone behind the Day PIN — like praises, the
 // whole point is one centralized record the whole team can see and confirm.
 miracles: normMiracles(miraclesRaw).list,
 witnessMin: WITNESS_MIN,
 binNotes: normBinNotes(binNotesRaw).list,
 // Like the church roster: only the rev rides in the poll; the ~19 KB bin
 // list is fetched separately (GET ?part=bins) and only when rev changes.
 binsRev: Math.max(0, Math.round(Number(binsRaw && binsRaw.rev) || 0)),
 // Packed ticks + custody DO ride the poll: a checkbox has to light up on
 // everyone's phone while they're loading, and it's only a few KB.
 binState: normBinState(binStateRaw).marks,
 churchesRev,
 churchCount
 };
}

/* djb2-xor hash → weak ETag for cheap "did anything change?" polling. */
function hash(strv){
 let h = 5381;
 for(let i = 0; i < strv.length; i++) h = (((h << 5) + h) ^ strv.charCodeAt(i)) >>> 0;
 return h.toString(36);
}

const json = (obj, status=200) => new Response(JSON.stringify(obj), {
 status, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
});

/* ---- access control (v1.10.0) ----
   Until now the Day PIN was enforced only in the browser: the API itself was
   open, so anyone with the URL could read every check-in, issue, praise — and
   the whole church CRM with pastors' names, numbers and private notes — or
   write to any non-leader action. The gate is now enforced here.
   Levels: "leader" (leader PIN), "day" (current Day PIN), "none".
   When no Day PIN is configured the app is intentionally open, exactly as
   before, so nothing breaks for a site that hasn't set one. */
/* ---- leader session tokens ----
   The client used to persist the leader PIN itself and send it with every
   request, so any XSS could read the PIN out of sessionStorage and use it
   forever (it unlocks the seekers' contact list). It now stores a random
   token instead: expires on its own, and a leader can invalidate every
   outstanding one with revokeLeaderTokens. The PIN still works directly,
   so older clients keep functioning. */
const LTOK_TTL_MS = 14 * 60 * 60 * 1000; // one long event day
const ltokKey = t => "ltok-" + idStr(t, 64);
async function issueLeaderToken(s){
 const tok = (uid() + uid() + uid()).replace(/[^a-z0-9]/gi, "").slice(0, 40);
 await s.setJSON(ltokKey(tok), { exp: Date.now() + LTOK_TTL_MS }).catch(() => {});
 return tok;
}
async function validLeaderToken(s, tok){
 if(!tok || tok.length < 16) return false;
 let rec = null;
 try { rec = await s.get(ltokKey(tok), { type:"json" }); } catch(_) {}
 if(!rec || !(Number(rec.exp) > Date.now())) return false;
 return true;
}

async function authLevel(s, K, req, body){
 const leader = ((body && body.pin) || req.headers.get("x-leader-pin") || "").toString();
 if(leader && leader === LEADER_PIN()) return "leader";
 if(leader && await validLeaderToken(s, leader)) return "leader";
 let day = ((body && body.dayPin) || req.headers.get("x-day-pin") || "").toString();
 if(!day){ try { day = new URL(req.url).searchParams.get("dp") || ""; } catch(_) {} }
 const dayPin = await readDayPin(s, K);
 if(!dayPin) return "day";                // no Day PIN set → open, as before
 if(day && day === dayPin) return "day";
 return "none";
}

/* Test seam: the suite swaps in an in-memory stand-in for Netlify Blobs so the
   request handler can be exercised without a network or a Netlify account.
   Production always takes the getStore() path. */
let _storeFactory = null;
export function __setStoreFactory(fn){ _storeFactory = fn; }
/* Deploy previews and branch deploys get their OWN store.

   Netlify Blobs are site-wide, not deploy-scoped, so every preview build used
   to read and write the live event data: opening a preview link and tapping
   anything edited production. That is how a preview of this very feature
   overwrote the team's Tech I/O roster. CONTEXT is "production" only for the
   real site; everything else is namespaced and therefore harmless to test. */
function storeName(){
 const ctx = (typeof process !== "undefined" && process.env && process.env.CONTEXT) || "";
 if(!ctx || ctx === "production") return STORE;
 const branch = (process.env.BRANCH || process.env.HEAD || process.env.DEPLOY_ID || "preview")
  .toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
 return `${STORE}--${ctx}--${branch}`;
}
const openStore = () => _storeFactory ? _storeFactory() : getStore(storeName(), { consistency: "strong" });

export default async (req, context) => {
 const s = openStore();
 // Which county's board are we on? Everything day-scoped keys off this.
 await ensureScopeReady(s);
 const active = await readActive(s);
 const K = mkKeys(active.county);

 if(req.method === "GET"){
  const lvl = await authLevel(s, K, req, null);
  let wantPart = "";
  try { wantPart = new URL(req.url).searchParams.get("part") || ""; } catch(_) {}
  if(lvl === "none"){
   /* Locked. The church roster is refused outright; the main payload returns
      only what the client needs to draw the Day PIN gate — no event data, no
      names, no contact info. */
   if(wantPart === "churches" || wantPart === "bins") return json({ error:"day pin required", locked:true }, 403);
   const body = JSON.stringify({ locked:true, dayPinSet:true });
   const etag = 'W/"lock-' + hash(body) + '"';
   if(req.headers.get("if-none-match") === etag){
    return new Response(null, { status:304, headers:{ "ETag":etag, "Cache-Control":"no-store" } });
   }
   return new Response(body, { status:200, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store", "ETag":etag } });
  }
  /* Church roster is its own endpoint (+ETag) so phones download it only when
     it changed and only when someone is actually on the Mobilization tab.
     The read is also where missing starter churches self-seed (no-op write
     when nothing is missing). */
  const part = wantPart;
  if(part === "churches"){
   const ch = await compareAndSwap(s, "churches", normChurches, c => {
    const merged = mergeStarterChurches(c);
    const compacted = chCompactLog(c);
    if(compacted) c.rev++;
    return (merged || compacted) ? c : undefined;
   }, emptyChurches);
   const body = JSON.stringify(ch);
   const etag = 'W/"' + hash(body) + '"';
   if(req.headers.get("if-none-match") === etag){
    return new Response(null, { status:304, headers:{ "ETag":etag, "Cache-Control":"no-store" } });
   }
   return new Response(body, { status:200, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store", "ETag":etag } });
  }
  /* Trailer roster — its own endpoint + ETag for the same reason as the
     churches one: too big to ride the 5-second poll, and it changes rarely.
     The read is where missing starter bins self-seed. */
  if(part === "bins"){
   const bn = await compareAndSwap(s, "bins", normBins,
    b => mergeStarterBins(b) ? b : undefined, emptyBins);
   const body = JSON.stringify(bn);
   const etag = 'W/"' + hash(body) + '"';
   if(req.headers.get("if-none-match") === etag){
    return new Response(null, { status:304, headers:{ "ETag":etag, "Cache-Control":"no-store" } });
   }
   return new Response(body, { status:200, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store", "ETag":etag } });
  }
  const body = JSON.stringify(await assemble(s, K, active, lvl));
  const etag = 'W/"' + hash(body) + '"';
  // Unchanged since the client last saw it? Skip the payload AND the re-render.
  if(req.headers.get("if-none-match") === etag){
   return new Response(null, { status:304, headers:{ "ETag":etag, "Cache-Control":"no-store" } });
  }
  return new Response(body, { status:200, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store", "ETag":etag } });
 }

 if(req.method === "POST"){
 let body = {};
 try { body = await req.json(); } catch(_) {}
 const action = body.action;
 const payload = body.payload || {};
 const pin = (body.pin || "").toString();

 /* ---- PIN rate limit: any non-empty PIN about to be checked counts ---- */
 const checksPin = action === "verifyLeaderPin" || action === "verifyDayPin" || LEADER_ACTIONS.has(action);
 const failKey = pinFailKey(req, context);
 if(pin && checksPin && (await pinFails(s, failKey)).length >= PIN_MAX_FAILS){
 return pinBlockedResp();
 }

 /* ---- every write needs at least the Day PIN (the two verify actions are
    how you obtain it, so they stay open) ---- */
 let lvl = "none";
 if(action !== "verifyLeaderPin" && action !== "verifyDayPin"){
 lvl = await authLevel(s, K, req, body);
 if(lvl === "none"){
  if(body.dayPin) await pinNoteFail(s, failKey);
  return json({ error:"day pin required", locked:true }, 403);
 }
 /* Read-only leader actions and the tally aren't "writes" worth budgeting;
    everything that mutates a shared list is. Leaders are exempt — a leader
    doing bulk work should never be throttled. */
 if(lvl !== "leader" && action !== "capturesList" && action !== "captureMedia"){
  if(!await rateHit(s, "wrate-" + pinFailKey(req, context).slice(8), WRITE_WINDOW_MS, WRITE_MAX)){
   return rateBlockedResp("changes");
  }
 }
 }

 /* ---- PIN verification (no state change) ---- */
 if(action === "verifyLeaderPin"){
 if(pin === LEADER_PIN()){ s.delete(failKey).catch(() => {}); return json({ ok:true, token: await issueLeaderToken(s) }); }
 // A still-valid session token re-verifies without re-entering the PIN.
 if(await validLeaderToken(s, pin)) return json({ ok:true, token: pin });
 if(pin) await pinNoteFail(s, failKey);
 return json({ error:"wrong pin" }, 403);
 }
 if(action === "verifyDayPin"){
 if(pin && pin === LEADER_PIN()){ s.delete(failKey).catch(() => {}); return json({ ok:true, leader:true, token: await issueLeaderToken(s) }); }
 const dayPinNow = await readDayPin(s, K);
 if(dayPinNow && pin === dayPinNow) return json({ ok:true, leader:false });
 if(pin) await pinNoteFail(s, failKey);
 return json({ error:"wrong pin" }, 403);
 }

 /* ---- privileged actions require leader auth (PIN or a valid session
    token — authLevel resolved both above) ---- */
 if(LEADER_ACTIONS.has(action) && lvl !== "leader"){
 if(pin) await pinNoteFail(s, failKey);
 return json({ error:"leader pin required" }, 403);
 }
 /* Sign every leader out everywhere (lost phone, PIN shared too widely). */
 if(action === "revokeLeaderTokens"){
 const { blobs } = await s.list({ prefix: "ltok-" });
 await Promise.all((blobs || []).map(b => s.delete(b.key).catch(() => {})));
 return json({ ok:true, revoked: (blobs || []).length });
 }

 /* ---- legacy counter: each device writes ONLY its own shard ---- */
 if(action === "bump"){
 const key = devKey(payload.dev, K);
 const cur = (await s.get(key, { type:"json" })) || 0;
 const before = (typeof cur === "number" ? cur : 0);
 const after = before + (Number(payload.delta) || 0);
 await s.setJSON(key, after);
 await bumpAgg(s, K, after - before, null);
 return json({ ok:true });
 }

 /* ---- v1.3.0 tally: per-phone summary {total, by}. A phone only writes its
    own shard (and the client serializes its own taps), so simultaneous
    counters can never erase each other. We then fold the *effective* delta
    (after clamping at 0) into the cached aggregate so GET stays O(1). ---- */
 /* ---- v1.6.0 absolute tally: the phone pushes its WHOLE per-device tally
    ("my total is N, split by name"), and the server stores it as-is in the
    phone's own tal2- shard. Idempotent by construction — a retry of a request
    that already landed changes nothing, and a dropped request just means the
    next push carries the missing taps. The delta vs. the previous shard value
    is folded into the cached aggregate so GET stays O(1). ---- */
 /* ---- decisions counter (v1.10.0) ----
    Attendance was the only number the app tracked, so the ministry's actual
    outcome — people responding to the gospel — lived only in praise-wall
    anecdotes. Same absolute-per-phone shard design as the head count, in its
    own dec2-/dec-agg namespace, so it inherits the same idempotency. ---- */
 if(action === "decSet"){
 const epoch = await readEpoch(s, K);
 if(((payload.epoch || "") + "") !== epoch){
  const dagg = await readDecAgg(s, K);
  return json({ ok:false, epochMismatch:true, epoch, decisions: Math.max(0, dagg.total), decBy: dagg.by || {} });
 }
 const inc = compactTally({ total: payload.total, by: payload.by });
 const next = { total: Math.min(inc.total, 100000), by: {} };
 for(const k of Object.keys(inc.by).slice(0, 30)) next.by[str(k, 40) || "?"] = Math.min(inc.by[k], 100000);
 let prev = { total:0, by:{} };
 await compareAndSwap(s, dec2Key(payload.dev, K), compactTally, cur => {
  prev = cur;
  return (JSON.stringify(cur) === JSON.stringify(next)) ? undefined : next;
 }, () => ({ total:0, by:{} }));
 const effBy = {};
 for(const k of new Set([ ...Object.keys(prev.by), ...Object.keys(next.by) ])){
  const d = (next.by[k] || 0) - (prev.by[k] || 0);
  if(d) effBy[k] = d;
 }
 const effTotal = next.total - prev.total;
 if(effTotal || Object.keys(effBy).length) await bumpDecAgg(s, K, effTotal, effBy);
 const dagg = await readDecAgg(s, K);
 return json({ ok:true, decisions: Math.max(0, dagg.total), decBy: dagg.by || {} });
 }

 if(action === "tallySet"){
 const epoch = await readEpoch(s, K);
 if(((payload.epoch || "") + "") !== epoch){
  // The event was reset while this phone still held a pre-reset tally.
  // Tell it to clear instead of resurrecting old numbers.
  const agg = await readAgg(s, K);
  return json({ ok:false, epochMismatch:true, epoch, count: Math.max(0, agg.total), tallyBy: agg.by || {} });
 }
 const inc = compactTally({ total: payload.total, by: payload.by });
 const next = { total: Math.min(inc.total, 100000), by: {} };
 for(const k of Object.keys(inc.by).slice(0, 30)){
  const name = str(k, 40) || "?";
  next.by[name] = Math.min(inc.by[k], 100000);
 }
 let prev = { total:0, by:{} };
 await compareAndSwap(s, tal2Key(payload.dev, K), compactTally, cur => {
  prev = cur;
  return (JSON.stringify(cur) === JSON.stringify(next)) ? undefined : next;
 }, () => ({ total:0, by:{} }));
 const effBy = {};
 for(const k of new Set([ ...Object.keys(prev.by), ...Object.keys(next.by) ])){
  const d = (next.by[k] || 0) - (prev.by[k] || 0);
  if(d) effBy[k] = d;
 }
 const effTotal = next.total - prev.total;
 if(effTotal || Object.keys(effBy).length) await bumpAgg(s, K, effTotal, effBy);
 const agg = await readAgg(s, K);
 return json({ ok:true, count: Math.max(0, agg.total), tallyBy: agg.by || {} });
 }

 if(action === "tallyAdd"){
 const key = tallyKey(payload.dev, K);
 const tally = compactTally(await s.get(key, { type:"json" }));
 const by = (payload.by || "?").toString().slice(0, 40) || "?";
 const delta = Number(payload.delta) || 0;
 const beforeTotal = tally.total, beforeBy = tally.by[by] || 0;
 tally.total = Math.max(0, tally.total + delta);
 tally.by[by] = Math.max(0, (tally.by[by] || 0) + delta);
 await s.setJSON(key, tally);
 await bumpAgg(s, K, tally.total - beforeTotal, { [by]: tally.by[by] - beforeBy });
 return json({ ok:true });
 }

 /* ---- everything else touches exactly one blob, via compare-and-swap ---- */
 // Ensure the split blobs exist (first-run migration off the old single blob).
 await migrateIfNeeded(s, K, await readAll(s, K));

 switch(action){
 /* v1.10.0 — idempotent checkmark write for the client's persistent outbox.
    The payload states the FINAL value ({id, on}) instead of "flip whatever is
    there", so a retried request that already landed is a no-op — with the old
    toggleCheck, a retry after a landed-but-unconfirmed write would flip the
    mark back off. toggleCheck stays below for phones still on the old client. */
 case "setCheck":
 await casCore(s, K, core => {
 const id = str(payload.id, 60);
 if(!id) return undefined;
 const cur = core.checklist[id];
 if(payload.on){
 if(cur) return undefined; // already checked — keep the first author's stamp
 core.checklist[id] = { by: str(payload.by, 40), t: str(payload.t, 12), dm: (payload.dm ?? null) };
 }else{
 if(!cur) return undefined;
 delete core.checklist[id];
 }
 return core;
 });
 break;
 case "toggleCheck":
 await casCore(s, K, core => {
 const id = payload.id;
 if(id){
 if(core.checklist[id]) delete core.checklist[id];
 else core.checklist[id] = { by: str(payload.by, 40), t: str(payload.t, 12), dm: (payload.dm ?? null) };
 }
 return core;
 });
 break;
 case "addChecklistItem":
 await casCore(s, K, core => {
 const it = normExtraItem(payload);
 if(!it.text) return undefined;
 core.extras = normExtras(core.extras);
 if(core.extras.some(x => x.id === it.id)) return undefined; // idempotent retry
 if(core.extras.length >= 100) return undefined;
 core.extras.push(it);
 return core;
 });
 break;
 case "removeChecklistItem":
 await casCore(s, K, core => {
 const id = idStr(payload.id);
 core.extras = normExtras(core.extras);
 if(!core.extras.some(x => x.id === id)) return undefined;
 core.extras = core.extras.filter(x => x.id !== id);
 delete core.checklist["x-" + id];   // drop its checkmark too
 return core;
 });
 break;
 case "setChecklistNote":
 await casCore(s, K, core => {
 const id = str(payload.id, 60);
 if(!id) return undefined;
 core.notes = core.notes || {};
 const t = str(payload.text, 500).trim();
 if(t) core.notes[id] = t; else delete core.notes[id];
 return core;
 });
 break;
 /* v1.10.0 — every add is idempotent on the client-generated id, so the
    client outbox can safely retry a request that may have already landed
    without creating duplicates. */
 case "addCheckin":
 await compareAndSwap(s, K.checkins, normCheckins, list => {
 if(payload.id && list.some(c => c.id === payload.id)) return undefined; // retry of an applied write
 list.push(normCheckin(payload)); return list.slice(-2000);
 }, () => []);
 break;
 case "addAnnouncement":
 await casCore(s, K, core => {
 if(payload.id && core.announcements.some(a => a.id === payload.id)) return undefined;
 core.announcements.unshift(normAnn(payload)); core.announcements = core.announcements.slice(0, 200); return core;
 });
 break;
 case "addPraise":
 await casCore(s, K, core => {
 if(payload.id && core.praises.some(x => x.id === payload.id)) return undefined;
 const it = normPraiseItem(payload); it.hidden = false; it.ackBy = ""; it.ackT = ""; it.comments = [];
 core.praises.unshift(it); core.praises = core.praises.slice(0, 500); return core;
 });
 break;
 case "addFeedback":
 await casCore(s, K, core => {
 if(payload.id && core.feedback.some(x => x.id === payload.id)) return undefined;
 const it = normIssue(payload); it.hidden = false; it.ackBy = ""; it.ackT = ""; it.comments = [];
 core.feedback.unshift(it); core.feedback = core.feedback.slice(0, 500); return core;
 });
 break;
 case "addComment":
 await casCore(s, K, core => {
 const arr = payload.kind === "praise" ? core.praises : (payload.kind === "ann" ? core.announcements : core.feedback);
 const it = arr.find(x => x.id === payload.id);
 if(!it) return undefined; // nothing to update — skip the write
 it.comments = Array.isArray(it.comments) ? it.comments : [];
 const cid = str(payload.cid, 40);
 if(cid && it.comments.some(c => c.cid === cid)) return undefined; // retry of an applied write
 it.comments.push({ cid, name: str(payload.name || "Volunteer", 40), text: str(payload.text, 500), t: str(payload.t, 12) });
 it.comments = it.comments.slice(-100);
 return core;
 });
 break;
 /* v1.10.0 — explicit-state radio write. The payload carries the radio's
    FINAL out/in stamps, so a retried request (or two people tapping the same
    radio at once) sets the same state instead of flipping it back the way
    radioToggle did. radioToggle stays below for phones on the old client. */
 case "setRadio":
 await compareAndSwap(s, K.radios, normRadios, rad => {
 const n = Number(payload.n);
 if(!(n >= 1 && n <= 10)) return undefined;
 const next = { n, out: normStamp(payload.out), in: normStamp(payload.in) };
 if(JSON.stringify(rad.list[n-1]) === JSON.stringify(next)) return undefined; // already there
 rad.list[n-1] = next;
 return rad;
 }, () => ({ list: defaultRadios() }));
 break;
 case "radioToggle":
 await compareAndSwap(s, K.radios, normRadios, rad => {
 const n = Number(payload.n);
 if(!(n >= 1 && n <= 10)) return undefined;
 const r = rad.list[n-1];
 const stamp = { by:(payload.by || "?").toString().slice(0, 40), t:(payload.t || "").toString().slice(0, 12) };
 if(r.out && !r.in){ r.in = stamp; } // returning it
 else { r.out = stamp; r.in = null; } // checking it out
 return rad;
 }, () => ({ list: defaultRadios() }));
 break;
 case "setEvent":
 await casCore(s, K, core => { core.event = { name: str(payload.name, 80), date: str(payload.date, 40), shift: Math.max(0, Math.min(2, Math.round(Number(payload.shift) || 0))) }; return core; });
 break;
 case "setIOList":
 /* Wholesale roster replacement — now used ONLY for structural edits (edit
    list / reload defaults). Patch checkmark taps go through ioSetRow below
    so concurrent techs can't clobber each other's progress. */
 if(!Array.isArray(payload.list)) break;
 await compareAndSwap(s, K.io, normIO, io => {
  /* Normalize on the way in. This used to store the client's array verbatim,
     which quietly bypassed the field whitelist for the entire roster — the
     one blob a leader can rewrite wholesale. */
  io.list = normIO({ list: payload.list }).list;
  /* Buses ride along on the same write — a leader edits the roster and the
     PA output table in one pass. Absent means "unchanged", not "empty". */
  if(Array.isArray(payload.buses)) io.buses = normIO({ buses: payload.buses }).buses;
  return io;
 }, () => ({ list: [], buses: [] }));
 break;
 /* v1.10.0 — per-row patch checkmark, merged server-side. Idempotent: a
    retried request that already landed is a no-op, and two techs checking
    DIFFERENT rows at the same time both stick (the old full-list setIOList
    was last-write-wins across the whole roster). `seed` carries the client's
    full roster ONLY for the first-ever write, when the server list is empty.

    It deliberately does not upgrade a roster that is merely out of date. An
    earlier revision did: a stored roster with no AVB field was treated as
    stale and the first patch tap replaced it wholesale. ioSetRow is open to
    any tech behind the Day PIN, so that turned a single checkbox into a
    silent overwrite of the team's own I/O map — and it did exactly that once.
    Replacing the roster is a leader decision (setIOList), never a side effect
    of ticking an input off. */
 case "ioSetRow": {
 await compareAndSwap(s, K.io, normIO, io => {
 if(!io.list.length && Array.isArray(payload.seed) && payload.seed.length) io.list = normIO({ list: payload.seed }).list;
 let hit = null;
 for(const p of io.list) if(p && p.id === payload.pid) for(const r of (p.rows || [])) if(r && r.id === payload.rid) hit = r;
 if(!hit) return undefined;
 const done = !!payload.done;
 if(!!hit.done === done) return undefined; // already in the desired state (keep the first author's stamp)
 hit.done = done;
 hit.by = done ? str(payload.by, 40) : "";
 hit.t = done ? str(payload.t, 12) : "";
 return io;
 }, () => ({ list: [], buses: [] }));
 break;
 }
 case "setDayPin":
 /* Global, not county-scoped. payload.auto returns it to following the
    schedule (event Saturday as MMDD); otherwise the leader's PIN is pinned
    until they turn automatic back on. */
 if(payload.auto) await s.setJSON(DAYPIN_KEY, { mode:"auto", pin:"" });
 else await s.setJSON(DAYPIN_KEY, { mode:"manual", pin: (payload.pin || "").toString().trim().slice(0, 10) });
 break;
 case "setFunding":
 await casCore(s, K, core => { core.funding = { pct: clampPct(payload.pct), needed: (payload.needed || "").toString().slice(0, 30) || core.funding.needed }; return core; });
 break;
 /* v1.10.0 — idempotent acknowledge/hide, same treatment as setCheck. The
    payload states the FINAL hidden value instead of toggling, so a retried
    request or two leaders acking the same card at once can't flip it back to
    visible (the "acknowledge & hide didn't actually hide it" bug). ackCard
    stays below for phones still on the old client. */
 case "setAck":
 await casCore(s, K, core => {
 const arr = payload.kind === "praise" ? core.praises : (payload.kind === "ann" ? core.announcements : core.feedback);
 const it = arr.find(x => x.id === payload.id);
 if(!it) return undefined;
 const hide = !!payload.hidden;
 if(it.hidden === hide) return undefined; // already in the desired state — no-op
 it.hidden = hide;
 it.ackBy = hide ? str(payload.by, 40) : "";
 it.ackT = hide ? str(payload.t, 12) : "";
 return core;
 });
 break;
 case "ackCard":
 await casCore(s, K, core => {
 const arr = payload.kind === "praise" ? core.praises : core.feedback;
 const it = arr.find(x => x.id === payload.id);
 if(!it) return undefined;
 const hide = !it.hidden;
 it.hidden = hide;
 it.ackBy = hide ? str(payload.by, 40) : "";
 it.ackT = hide ? str(payload.t, 12) : "";
 return core;
 });
 break;
 case "reset": {
 /* PRAISES SURVIVE THE RESET, per leadership — the praise wall is a lasting
    testimony record, not a day-scoped list. Issues are CLEARED (leadership,
    Jul 2026 — they are day-scoped punch-list items, and the pre-reset
    snapshot below keeps them recoverable). Clears checklists, check-ins,
    counts (legacy + tally), announcements, radios and issues. Keeps event
    info, Day PIN, funding, I/O roster (progress cleared), the Recording
    Studio scripts and praises. Quick Captures also SURVIVE the reset — they
    are seekers' contact info headed for the CRM, never day-scoped throwaway
    data (leaders delete them individually once they're in Planning Center).
    The Mobilization church CRM ("churches" blob) also survives — it's a
    season-long relationship record. So does the Miracle Tracker ("miracles"
    blob) — it's the season's testimony record, and half-confirmed reports
    must not lose their witnesses to an end-of-day reset. Trailer packing
    FYIs ("binnotes") survive too: a note describes the physical bin, and
    it's the same bin at the next county. */
 {
 const [curCore, curCheckins, curIO, curRadios] = await Promise.all([
  s.get(K.core, { type:"json" }), s.get(K.checkins, { type:"json" }),
  s.get(K.io, { type:"json" }), s.get(K.radios, { type:"json" })
 ]);
 await snapshot(s, "reset", { core: curCore, checkins: curCheckins, io: curIO, radios: curRadios });
 /* Season roll-up: reset is the ONLY moment this event's numbers still
    exist, so close the event out into a tiny per-event summary before
    clearing. Eight counties of these are what let leadership answer
    "how did the season go?" in October. */
 {
 const core2 = normCore(curCore);
 const [agg2, dec2, caps2] = await Promise.all([ readAgg(s, K), readDecAgg(s, K), s.get("captures", { type:"json" }) ]);
 const checkins2 = normCheckins(curCheckins);
 const io2 = normIO(curIO);
 let ioDone = 0, ioTotal = 0;
 for(const p of io2.list){ if(p.off) continue; for(const r of (p.rows || [])){ ioTotal++; if(r.done) ioDone++; } }
 const entry = {
  at: new Date().toISOString(),
  county: K.cty,
  event: core2.event,
  attendance: Math.max(0, agg2.total),
  decisions: Math.max(0, dec2.total),
  decBy: dec2.by || {},
  volunteers: checkins2.length,
  teams: [...new Set(checkins2.map(c => c.team).filter(Boolean))].length,
  captures: normCaptures(caps2).length,
  issues: core2.feedback.length,
  praises: core2.praises.length,
  checklistDone: Object.keys(core2.checklist || {}).length,
  ioDone, ioTotal
 };
 await compareAndSwap(s, "season", v => ({ events: Array.isArray(v && v.events) ? v.events : [] }),
  seasonV => { seasonV.events.push(entry); seasonV.events = seasonV.events.slice(-40); return seasonV; },
  () => ({ events: [] })).catch(() => {});
 }
 }
 // The rain-date shift is day-specific — the next event starts unshifted.
 await casCore(s, K, core => ({ ...EMPTY_CORE, event: { ...core.event, shift: 0 }, dayPin: core.dayPin, funding: core.funding, praises: core.praises }));
 /* Reset deliberately does NOT touch the Tech I/O blob — not the roster and
    not the patch checkmarks. The I/O map is the tech team's own record of how
    the rig is wired, maintained outside the event-day cycle, and clearing any
    part of it here has cost them work. It is still captured in the snapshot
    above so a reset remains fully recoverable. */
 const [c1, c2, c3, c4] = await Promise.all([ s.list({ prefix: K.countPre }), s.list({ prefix: K.tallyPre }), s.list({ prefix: K.tal2Pre }), s.list({ prefix: K.dec2Pre }) ]);
 const doomed = [ ...((c1 && c1.blobs) || []), ...((c2 && c2.blobs) || []), ...((c3 && c3.blobs) || []), ...((c4 && c4.blobs) || []) ]
  .filter(b => b.key !== K.agg); // rewritten below, not deleted (racy otherwise)
 await Promise.all([
 s.setJSON(K.checkins, []),
 s.setJSON(K.radios, { list: defaultRadios() }),
 s.setJSON(K.agg, { total:0, by:{} }),
 s.setJSON(K.decAgg, { total:0, by:{} }),
 s.setJSON(K.epoch, { e: uid() }), // stale phones clear instead of re-pushing old tallies
 ...doomed.map(b => s.delete(b.key))
 ]);
 /* Packed ticks are load-out state for the event that just ended, so they
    clear. CUSTODY survives: who has the generator is exactly the thing you
    still need to know on the drive home and at the next county. */
 await compareAndSwap(s, "binstate", normBinState, st => {
 let touched = false;
 for(const id of Object.keys(st.marks)){
  if(st.marks[id].p){ delete st.marks[id].p; touched = true; }
  if(!st.marks[id].p && !st.marks[id].h) delete st.marks[id];
 }
 return touched ? st : undefined;
 }, () => ({ marks: {} })).catch(() => {});
 break;
 }
 /* ---- Recording Studio ---- */
 case "promptSeed":
 // A phone running yesterday's cached copy would seed the whole season,
 // past counties included, so the retirement filter applies here too.
 if(Array.isArray(payload.scripts))
 await compareAndSwap(s, "prompter", normPrompter, p => p.scripts.length ? undefined : normPrompter({ scripts: liveScripts(payload.scripts) }), () => ({ scripts: [] }));
 break;
 case "promptAdd":
 if(payload.script && payload.script.id)
 await compareAndSwap(s, "prompter", normPrompter, p => { p.scripts.push(normPrompter({ scripts:[payload.script] }).scripts[0]); return p; }, () => ({ scripts: [] }));
 break;
 case "promptEdit":
 await compareAndSwap(s, "prompter", normPrompter, p => {
 const i = p.scripts.findIndex(x => x.id === payload.id);
 if(i < 0) return undefined;
 p.scripts[i] = normPrompter({ scripts:[{ ...p.scripts[i], ...(payload.patch || {}), id: payload.id }] }).scripts[0];
 return p;
 }, () => ({ scripts: [] }));
 break;
 case "promptDelete":
 await compareAndSwap(s, "prompter", normPrompter, p => {
 const id = str(payload.id, 40);
 if(!id) return undefined;
 p.scripts = p.scripts.filter(x => x.id !== id);
 if(!p.removed.includes(id)) p.removed.push(id); // tombstone: don't re-seed it
 return p;
 }, () => ({ scripts: [] }));
 break;
 case "promptDone":
 await compareAndSwap(s, "prompter", normPrompter, p => {
 const it = p.scripts.find(x => x.id === payload.id);
 if(!it) return undefined;
 it.done = { initials:(payload.initials||"").toString().slice(0,40), date:(payload.date||"").toString().slice(0,12) };
 return p;
 }, () => ({ scripts: [] }));
 break;
 case "promptUndone":
 await compareAndSwap(s, "prompter", normPrompter, p => {
 const it = p.scripts.find(x => x.id === payload.id);
 if(!it) return undefined;
 it.done = null;
 return p;
 }, () => ({ scripts: [] }));
 break;
 /* ---- Ambassador Quick Capture ---- */
 case "captureAdd": {
 // Open to everyone behind the Day PIN (like check-ins) — capture must be
 // frictionless on the street. Media lands in its own blob first so a
 // record never points at media that failed to store.
 const rec = normCapture(payload);
 rec.bytes = 0;
 /* Records are irreplaceable (a seeker's contact info), so when the list is
    at its cap we REFUSE the new one instead of letting slice() evict the
    oldest. Losing the newest is recoverable — the ambassador still has the
    card in hand and gets told — while silently dropping the oldest is not. */
 {
 const existing = normCaptures(await s.get("captures", { type:"json" }));
 if(existing.length >= CAPTURE_LIST_MAX && !existing.some(c => c.id === rec.id)){
  return json({ error:"capture list is full — export to Planning Center and purge before capturing more", full:true }, 507);
 }
 }
 const media = payload.media || null;
 if(media && typeof media.dataUrl === "string" && media.dataUrl.startsWith("data:") && media.dataUrl.length <= CAPTURE_MEDIA_MAX){
 if(!await rateHit(s, "mrate-" + pinFailKey(req, context).slice(8), MEDIA_WINDOW_MS, MEDIA_MAX_PER_IP)){
  return rateBlockedResp("photo/voice uploads");
 }
 // Enforce the storage budget: when it's full, keep the typed record (never
 // lose the contact) but refuse the media and say so in the notes.
 const existing = normCaptures(await s.get("captures", { type:"json" }));
 if(captureUsage(existing) + media.dataUrl.length > CAPTURE_BUDGET()){
 rec.hasMedia = false; rec.mediaKind = "";
 rec.notes = str((rec.notes ? rec.notes + "\n" : "") + "[⚠️ A " + (media.kind === "photo" ? "card photo" : "voice note") + " was attached but NOT stored — Quick Capture storage is full. Export to Planning Center and purge, then ask " + (rec.by || "the ambassador") + " to resend.]", 4000);
 } else {
 rec.hasMedia = true;
 rec.mediaKind = media.kind === "photo" ? "photo" : "audio";
 rec.bytes = media.dataUrl.length;
 await s.set(capMediaKey(rec.id), media.dataUrl);
 }
 } else { rec.hasMedia = false; rec.mediaKind = ""; }
 await compareAndSwap(s, "captures", normCaptures, list => {
 if(list.some(c => c.id === rec.id)) return undefined; // idempotent retry
 if(list.length >= CAPTURE_LIST_MAX) return undefined; // full (re-checked under CAS)
 list.push(rec);
 return list;
 }, () => []);
 break;
 }
 /* Switch the whole board to another county (v1.11.0). Day-scoped blobs are
    namespaced per county, so this swaps checklists, check-ins, counts, radios,
    issues, announcements and I/O progress in one write — no reset, and the
    previous county's work stays exactly where it was.
    The FIRST switch adopts whatever is currently in the unscoped blobs as that
    county's data, so a board already in use isn't stranded. */
 case "setCounty": {
 /* payload.auto = follow the schedule again (the default behaviour). */
 if(payload.auto){
  await s.setJSON(ACTIVE_KEY, { county:"", mode:"auto", migrated:true });
  return json({ ok:true, county: currentEvent().key, manual:false });
 }
 const want = idStr(payload.county, 24);
 if(payload.county && !COUNTY_KEYS.has(want)) return json({ error:"unknown county" }, 400);
 const cur = await readActive(s);
 if(cur.manual && cur.county === want) return json({ ok:true, county: want, manual:true });
 await s.setJSON(ACTIVE_KEY, { county: want, mode:"manual", migrated: true });
 /* Rotate the target county's tally epoch so phones holding another county's
    tally clear it instead of pushing those taps onto this board. */
 const target = mkKeys(want);
 await s.setJSON(target.epoch, { e: uid() });
 return json({ ok:true, county: want });
 }
 case "seasonList":
 return json(await compareAndSwap(s, "season", v => ({ events: Array.isArray(v && v.events) ? v.events : [] }), () => undefined, () => ({ events: [] })));
 case "capturesList":
 return json({ captures: normCaptures(await s.get("captures", { type:"json" })) });
 case "captureMedia": {
 const dataUrl = await s.get(capMediaKey(payload.id));
 return json({ id: str(payload.id, 40), dataUrl: (typeof dataUrl === "string" && dataUrl.startsWith("data:")) ? dataUrl : "" });
 }
 case "captureSetState":
 await compareAndSwap(s, "captures", normCaptures, list => {
 const id = idStr(payload.id);
 const st = CAPTURE_STATES.has(payload.st) ? payload.st : "new";
 const it = list.find(c => c.id === id);
 if(!it || it.st === st) return undefined;
 it.st = st;
 return list;
 }, () => []);
 break;
 case "captureDelete":
 await compareAndSwap(s, "captures", normCaptures, list => {
 const id = str(payload.id, 40);
 if(!list.some(c => c.id === id)) return undefined;
 return list.filter(c => c.id !== id);
 }, () => []);
 await s.delete(capMediaKey(payload.id)).catch(() => {});
 break;
 /* ---- Trailer Load List roster (leader-only) ----
    Every write bumps rev (so phones re-download) and lands in the log with a
    name against it, so "who changed 109's contents and when" is answerable. */
 case "binEdit": {
 const patch = payload.patch || {};
 /* Optimistic concurrency: the editor sends the version it opened. If another
    leader saved in the meantime the versions differ and we refuse — a
    full-list save would otherwise carry this leader's stale copy of the
    contents and silently wipe the other one's work. */
 if(payload.baseV != null){
  const snap = normBins(await s.get("bins", { type:"json" }));
  const cur = snap.list.find(x => x.id === idStr(payload.bin, 40));
  /* A RETRY of a write that already landed is not a conflict — it bumped the
     version itself, and the CAS below no-ops on the log id. Only a genuinely
     newer version from someone else is refused. */
  if(cur && !binLogged(snap, payload.id) && cur.v !== Math.max(0, Math.round(Number(payload.baseV) || 0))){
   return json({ error:"someone else changed this bin first", conflict:true, bin: cur }, 409);
  }
 }
 await casBins(s, b => {
 if(binLogged(b, payload.id)) return undefined; // retry of an applied write
 const i = b.list.findIndex(x => x.id === idStr(payload.bin, 40));
 if(i < 0) return undefined;
 const cur = b.list[i], merged = { ...cur };
 for(const k of BIN_EDIT_FIELDS) if(k in patch) merged[k] = patch[k];
 if(Array.isArray(payload.items)) merged.items = payload.items;
 /* Editing contents into a bin un-marks it empty; emptying it re-marks it,
    so the two can never disagree the way a stale checkbox would. */
 if(Array.isArray(payload.items) || "title" in patch){
  merged.empty = !(merged.items || []).length && !merged.title;
 }
 b.list[i] = normBin({ ...merged, id: cur.id, v: cur.v + 1, by: str(payload.by, 40), t: str(payload.t, 12), d: str(payload.d, 10) });
 binLogPush(b, { id: payload.id, bin: cur.id, type: Array.isArray(payload.items) ? "items" : "edit",
   by: payload.by, note: (cur.bin ? "Bin " + cur.bin : cur.title) + " updated", t: payload.t, d: payload.d });
 b.rev++; return b;
 });
 break;
 }
 /* Append ONE item. Used by "apply this extra to the roster" — a full-array
    replace would carry the leader's stale copy and could drop another
    leader's concurrent addition; this can't. */
 case "binItemAdd": {
 const item = str(payload.item, 300);
 if(!item) break;
 await casBins(s, b => {
 if(binLogged(b, payload.id)) return undefined;
 const it = b.list.find(x => x.id === idStr(payload.bin, 40));
 if(!it) return undefined;
 if(it.items.length >= 80) return undefined;
 it.items.push(item);
 it.empty = false;
 it.v++;   // an open editor elsewhere must not save over this
 binLogPush(b, { id: payload.id, bin: it.id, type: "apply", by: payload.by,
   note: "Added “" + item + "”" + (it.bin ? " to bin " + it.bin : ""), t: payload.t, d: payload.d });
 b.rev++; return b;
 });
 break;
 }
 case "binAdd": {
 const rec = normBin(payload.bin || {});
 if(!rec.title && !rec.bin) break;
 await casBins(s, b => {
 if(b.list.some(x => x.id === rec.id)) return undefined; // idempotent retry
 if(b.list.length >= BIN_LIST_MAX) return undefined;
 b.list.push(rec);
 binLogPush(b, { bin: rec.id, type: "add", by: rec.by || payload.by,
   note: "Added " + (rec.bin ? "bin " + rec.bin : rec.title), t: rec.t, d: rec.d });
 b.rev++; return b;
 });
 break;
 }
 case "binDelete": {
 await casBins(s, b => {
 const it = b.list.find(x => x.id === idStr(payload.bin, 40));
 if(!it) return undefined;
 b.list = b.list.filter(x => x.id !== it.id);
 if(!b.removed.includes(it.id)) b.removed.push(it.id); // tombstone: don't re-seed
 binLogPush(b, { bin: it.id, type: "delete", by: payload.by,
   note: "Removed " + (it.bin ? "bin " + it.bin : it.title), t: payload.t, d: payload.d });
 b.rev++; return b;
 });
 break;
 }
 /* ---- load-out: packed ticks & custody ----
    Open to everyone behind the Day PIN — the crew loading the truck is who
    knows what's on it. Both are FINAL-STATE writes (like setCheck), so a
    retried request or two people ticking the same bin land on the same
    answer instead of toggling it back off. */
 case "binPackSet":
 await compareAndSwap(s, "binstate", normBinState, st => {
 const id = idStr(payload.bin, 40);
 if(!id) return undefined;
 const cur = st.marks[id] || {};
 if(!!cur.p === !!payload.on) return undefined;   // already there — keep the first ticker's stamp
 if(payload.on) cur.p = { by: str(payload.by, 40), t: str(payload.t, 12), d: str(payload.d, 10) };
 else delete cur.p;
 if(cur.p || cur.h) st.marks[id] = cur; else delete st.marks[id];
 return st;
 }, () => ({ marks: {} }));
 break;
 case "binHoldSet":
 await compareAndSwap(s, "binstate", normBinState, st => {
 const id = idStr(payload.bin, 40);
 if(!id) return undefined;
 const cur = st.marks[id] || {};
 const who = str(payload.by, 40);
 if(payload.on && !who) return undefined;
 if(payload.on){
  if(cur.h && cur.h.by === who && cur.h.note === str(payload.note, 120)) return undefined;
  cur.h = { by: who, t: str(payload.t, 12), d: str(payload.d, 10), note: str(payload.note, 120) };
 }else{
  if(!cur.h) return undefined;
  delete cur.h;
 }
 if(cur.p || cur.h) st.marks[id] = cur; else delete st.marks[id];
 return st;
 }, () => ({ marks: {} }));
 break;
 /* Leader: start a fresh load-out. Clears every packed tick but deliberately
    KEEPS custody — who has the generator doesn't change because we started
    loading for the next county. */
 case "binPackClear":
 await compareAndSwap(s, "binstate", normBinState, st => {
 let touched = false;
 for(const id of Object.keys(st.marks)){
  if(st.marks[id].p){ delete st.marks[id].p; touched = true; }
  if(!st.marks[id].p && !st.marks[id].h) delete st.marks[id];
 }
 return touched ? st : undefined;
 }, () => ({ marks: {} }));
 break;
 /* ---- Trailer Load List packing FYIs ----
    Adding a note is open to everyone behind the Day PIN — the whole point is
    that a packer can flag "extra patch cable went into 002-007" without
    stopping a leader mid-load. Acknowledge-&-hide is leader-PIN only
    (final-state write, same shape as setAck). */
 case "binNoteAdd":
 await compareAndSwap(s, "binnotes", normBinNotes, bn => {
 if(payload.id && bn.list.some(x => x.id === payload.id)) return undefined; // idempotent retry
 const rec = normBinNote(payload);
 rec.hidden = false; rec.ackBy = ""; rec.ackT = "";
 if(!rec.text && !rec.item) return undefined;
 bn.list.push(rec); bn.list = bn.list.slice(-BINNOTE_LIST_MAX);
 return bn;
 }, () => ({ list: [] }));
 break;
 case "binNoteAck":
 await compareAndSwap(s, "binnotes", normBinNotes, bn => {
 const it = bn.list.find(x => x.id === idStr(payload.id));
 if(!it) return undefined;
 const hide = !!payload.hidden;
 if(it.hidden === hide) return undefined; // already in the desired state — no-op
 it.hidden = hide;
 it.ackBy = hide ? str(payload.by, 40) : "";
 it.ackT = hide ? str(payload.t, 12) : "";
 return bn;
 }, () => ({ list: [] }));
 break;
 /* ---- Miracle Tracker ----
    Reporting and witnessing are open to everyone behind the Day PIN — the
    centralized record only works if anybody can put a miracle in and any
    leader or teammate can confirm it. What COUNTS is decided server-side
    (see miracleWitnessCount): a report validates only once WITNESS_MIN
    distinct witnesses — not the reporter, not the reporting phone — have
    confirmed it. Deleting a record is leader-PIN only. */
 case "miracleAdd":
 await compareAndSwap(s, "miracles", normMiracles, mr => {
 if(payload.id && mr.list.some(x => x.id === payload.id)) return undefined; // idempotent retry
 const rec = normMiracle({ ...payload, county: idStr(payload.county, 24) || K.cty, witnesses: [] });
 if(!rec.note) return undefined; // a report with no testimony is nothing to witness
 if(mr.list.length >= MIRACLE_LIST_MAX) return undefined;
 mr.list.unshift(rec);
 return mr;
 }, () => ({ list: [] }));
 break;
 case "miracleWitness": {
 const w = normWitness(payload);
 if(!w.name) break;
 await compareAndSwap(s, "miracles", normMiracles, mr => {
 const it = mr.list.find(x => x.id === idStr(payload.id));
 if(!it) return undefined;
 if(it.witnesses.some(x => x.wid === w.wid)) return undefined; // retry of an applied write
 const nm = w.name.trim().toLowerCase();
 if(nm === (it.by || "").trim().toLowerCase()) return undefined; // reporter can't witness their own report
 if(w.dev && it.dev && w.dev === it.dev) return undefined;       // …nor can the reporter's phone under another name
 if(it.witnesses.some(x => (x.name || "").trim().toLowerCase() === nm)) return undefined; // one confirmation per person
 if(w.dev && it.witnesses.some(x => x.dev && x.dev === w.dev)) return undefined;          // one confirmation per phone
 it.witnesses.push(w); it.witnesses = it.witnesses.slice(0, 20);
 return mr;
 }, () => ({ list: [] }));
 break;
 }
 /* Hiding is the reversible option and the one to reach for; this is for a
    genuine mis-post that should not survive in the record at all. */
 case "annDelete":
 await casCore(s, K, core => {
 const id = idStr(payload.id);
 if(!core.announcements.some(a => a.id === id)) return undefined;
 core.announcements = core.announcements.filter(a => a.id !== id);
 return core;
 });
 break;
 case "miracleDelete":
 await compareAndSwap(s, "miracles", normMiracles, mr => {
 const id = idStr(payload.id);
 if(!mr.list.some(x => x.id === id)) return undefined;
 mr.list = mr.list.filter(x => x.id !== id);
 return mr;
 }, () => ({ list: [] }));
 break;
 /* ---- Pre-Crusade Mobilization (church CRM) ----
    Open to everyone behind the Day PIN: adding a church, logging outreach,
    claiming a connection, scoring interest, flagging misalignment — the whole
    point is frictionless collaboration from ambassadors' phones. Editing and
    deleting the master list is leader-PIN-gated (see LEADER_ACTIONS). Every
    write bumps rev and lands in the activity log. */
 case "churchAdd": {
 const rec = normChurch(payload.church || {});
 if(!rec.name) break;
 await casChurches(s, c => {
 if(c.list.some(x => x.id === rec.id)) return undefined; // idempotent retry
 if(c.list.some(x => x.name.toLowerCase() === rec.name.toLowerCase() && x.town.toLowerCase() === rec.town.toLowerCase())) return undefined; // duplicate guard
 c.list.push(rec); c.list = c.list.slice(0, 800);
 chLogPush(c, { ch: rec.id, type:"add", by: rec.addedBy || "Ambassador", note: rec.name, t: rec.t, d: rec.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchLog": {
 if(!CH_OPEN_LOG.has(payload.type)) break; // ambassadors: outreach + notes only
 const rec = normChLog(payload);
 /* Collapse rapid-fire repeats: opening the dialer/mail app, backing out and
    tapping again should NOT stack duplicate history entries. Same church +
    type + person + note within ~10 minutes (or a retried request with the
    same id) is a no-op. */
 const tMins = tstr => {
 const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(tstr || "");
 if(!m) return null;
 let h = Number(m[1]) % 12;
 if(/pm/i.test(m[3])) h += 12;
 return h * 60 + Number(m[2]);
 };
 await casChurches(s, c => {
 if(!c.list.some(x => x.id === rec.ch)) return undefined;
 if(c.log.some(e => e.id === rec.id)) return undefined; // idempotent retry
 const dup = c.log.slice(-30).some(e => {
 if(e.ch !== rec.ch || e.type !== rec.type || e.by !== rec.by || e.d !== rec.d || e.note !== rec.note) return false;
 const a = tMins(e.t), b = tMins(rec.t);
 return (a == null || b == null) ? e.t === rec.t : Math.abs(b - a) <= 10;
 });
 if(dup) return undefined;
 chLogPush(c, rec);
 c.rev++; return c;
 });
 break;
 }
 case "churchConnect": {
 const conn = normChConn(payload);
 if(!conn.amb) break;
 await casChurches(s, c => {
 const it = c.list.find(x => x.id === payload.ch);
 if(!it) return undefined;
 if(it.connections.some(x => x.amb.toLowerCase() === conn.amb.toLowerCase())) return undefined;
 it.connections.push(conn); it.connections = it.connections.slice(0, 40);
 chLogPush(c, { ch: it.id, type:"connect", by: conn.amb, note: conn.note, t: conn.t, d: conn.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchInterest": {
 const n = Math.max(0, Math.min(5, Math.round(Number(payload.interest) || 0)));
 await casChurches(s, c => {
 const it = c.list.find(x => x.id === payload.ch);
 if(!it || it.interest === n) return undefined;
 it.interest = n;
 chLogPush(c, { ch: it.id, type:"interest", by: payload.by, note: "Interest set to " + n + "/5", t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchFlag": {
 if(!payload.reason) break;
 await casChurches(s, c => {
 if(chLogged(c, payload.id)) return undefined; // retry of an applied write
 const it = c.list.find(x => x.id === payload.ch);
 if(!it) return undefined;
 it.flag = normChurch({ flag:{ reason: payload.reason, note: payload.note, by: payload.by, t: payload.t, d: payload.d } }).flag;
 it.align = "flagged";
 chLogPush(c, { id: payload.id, ch: it.id, type:"flag", by: payload.by, note: str(payload.reason, 80) + (payload.note ? " — " + str(payload.note, 200) : ""), t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchFlagClear": {
 await casChurches(s, c => {
 if(chLogged(c, payload.id)) return undefined;
 const it = c.list.find(x => x.id === payload.ch);
 if(!it || !it.flag) return undefined;
 it.flag = null;
 it.align = CH_ALIGNS.has(payload.align) && payload.align !== "flagged" ? payload.align : "unverified";
 chLogPush(c, { id: payload.id, ch: it.id, type:"unflag", by: payload.by, note: "Flag cleared", t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchEdit": {
 const patch = payload.patch || {};
 await casChurches(s, c => {
 if(chLogged(c, payload.id)) return undefined;
 const i = c.list.findIndex(x => x.id === payload.ch);
 if(i < 0) return undefined;
 const cur = c.list[i], merged = { ...cur };
 for(const k of CH_EDIT_FIELDS) if(k in patch) merged[k] = patch[k];
 c.list[i] = normChurch({ ...merged, id: cur.id, connections: cur.connections, flag: cur.flag, addedBy: cur.addedBy });
 chLogPush(c, { id: payload.id, ch: cur.id, type:"edit", by: payload.by, note: "Details updated", t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchTemplate": {
 /* Leader-only: replace the master outreach templates. Empty fields fall
    back to the client's built-in defaults, so "reset" = save empties. */
 await casChurches(s, c => {
 if(chLogged(c, payload.id)) return undefined;
 c.tpl = { subject: str(payload.subject, 200), email: str(payload.email, 4000), sms: str(payload.sms, 600) };
 chLogPush(c, { id: payload.id, ch: "", type:"edit", by: payload.by, note: "Updated the master email & text templates", t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "churchDelete": {
 await casChurches(s, c => {
 const it = c.list.find(x => x.id === payload.ch);
 if(!it) return undefined;
 c.list = c.list.filter(x => x.id !== it.id);
 if(!c.removed.includes(it.id)) c.removed.push(it.id); // tombstone: don't re-seed
 chLogPush(c, { ch: it.id, type:"delete", by: payload.by, note: it.name, t: payload.t, d: payload.d });
 c.rev++; return c;
 });
 break;
 }
 case "capturePurge": {
 /* Refuse while anything is still unfiled — the button's whole premise is
    "these are all in Planning Center now". */
 {
 const list = normCaptures(await s.get("captures", { type:"json" }));
 const pending = list.filter(c => c.st !== "entered" && c.st !== "done").length;
 if(pending && !payload.force){
  return json({ error:"still unfiled", pending, needsForce:true }, 409);
 }
 }
 /* Wholesale cleanup once everything is in Planning Center Online: clears
    the capture list AND every capmedia- blob (listing by prefix also sweeps
    up any orphaned media whose record was already gone). Text records are
    snapshotted first (media is not — too large). */
 await snapshot(s, "purge", { captures: await s.get("captures", { type:"json" }) });
 const { blobs } = await s.list({ prefix: "capmedia-" });
 await Promise.all((blobs || []).map(b => s.delete(b.key).catch(() => {})));
 await s.setJSON("captures", []);
 break;
 }
 default: return json({ error:"unknown action" }, 400);
 }
 /* The browser already applied the change optimistically. Do not rebuild and
    resend the whole app after every write; the sync loop reconciles. */
 return json({ ok:true });
 }

 return json({ error:"method not allowed" }, 405);
};

export const config = { path: "/.netlify/functions/data" };
