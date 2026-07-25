import { getStore } from "@netlify/blobs";
// Starter teleprompter scripts. Missing ones are merged into the live board
// automatically on read, so every user sees every county without a leader
// having to seed anything. Generated from data/scripts.json — regenerate with
// `node scripts/sync-starter-scripts.mjs` after editing that file.
import STARTER_SCRIPTS from "./starter-scripts.mjs";
// Pre-Crusade Mobilization: starter church roster (merged on read, tombstoned
// on delete — same pattern as the starter scripts).
import STARTER_CHURCHES from "./starter-churches.mjs";

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
 prompter  — Recording Studio scripts
 radios    — 10-radio checkout board (initials + times)
 captures  — Ambassador Quick Capture contact records (text fields only)
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
const idStr = (v, n = 40) => (v == null ? "" : v.toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, n);
/* Links are rendered as href="…" — only http(s) may through, so a stored
   javascript:/data: URL can't execute when someone taps a church website. */
function safeUrl(v, n = 200){
 const s = str(v, n).trim();
 if(!s) return "";
 if(/^https?:\/\//i.test(s)) return s;
 if(/^[a-z][a-z0-9+.-]*:/i.test(s)) return ""; // some other scheme (javascript:, data:, …) — drop it
 return "https://" + s.replace(/^\/+/, "");
}

function ioListClearProgress(list){
 if(!Array.isArray(list) || !list.length) return list;
 return list.map(p => ({ ...p, rows: (p.rows || []).map(r => ({ ...r, done:false, by:"", t:"" })) }));
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
function normIssue(x){
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
function normCapture(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  lane: CAPTURE_LANES.has(x.lane) ? x.lane : "text",
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
const normCaptures = v => Array.isArray(v) ? v.map(normCapture).slice(-CAPTURE_LIST_MAX) : [];
const capMediaKey = id => "capmedia-" + (id || "").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 40);

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

function normCheckin(x){
 x = x || {};
 return {
  id: idStr(x.id) || uid(),
  name: str(x.name, 40),
  team: str(x.team, 40),
  attested: !!x.attested,
  t: str(x.t, 12)
 };
}

export function normCore(c){
 c = c || {};
 return {
 checklist: c.checklist || {},
 notes: normNotes(c.notes),
 announcements: Array.isArray(c.announcements) ? c.announcements.map(normAnn).slice(0, 200) : [],
 feedback: Array.isArray(c.feedback) ? c.feedback.map(normIssue).slice(0, 500) : [],
 praises: Array.isArray(c.praises) ? c.praises.map(normPraiseItem).slice(0, 500) : [],
 event: c.event || { name:"", date:"" },
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

/* Merge any starter script whose id is neither on the board nor tombstoned.
   Returns true when something was added (i.e. a write is warranted). */
function mergeStarterScripts(p){
 const have = new Set(p.scripts.map(x => x.id));
 const gone = new Set(p.removed);
 let added = false;
 for(const sc of STARTER_SCRIPTS){
  if(!sc || !sc.id || have.has(sc.id) || gone.has(sc.id)) continue;
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
function normIORow(r){
 r = r || {};
 return {
  id: idStr(r.id) || uid(),
  role: str(r.role, 60), gear: str(r.gear, 60), loc: str(r.loc, 60),
  done: !!r.done, by: str(r.by, 40), t: str(r.t, 12)
 };
}
function normIOPerf(p){
 p = p || {};
 return {
  id: idStr(p.id) || uid(),
  name: str(p.name, 60), inst: str(p.inst, 60), pack: str(p.pack, 30),
  color: /^#[0-9a-f]{3,8}$/i.test(str(p.color, 9)) ? str(p.color, 9) : "#c7c2b8",
  qmix: str(p.qmix, 20), tx: str(p.tx, 60), off: !!p.off,
  rows: (Array.isArray(p.rows) ? p.rows : []).map(normIORow).slice(0, 60)
 };
}
const normIO = v => ({ list: (v && Array.isArray(v.list)) ? v.list.map(normIOPerf).slice(0, 80) : [] });

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
 "toggleCheck","setCheck","setChecklistNote","addAnnouncement","ackCard","setAck","setEvent","setIOList","setDayPin",
 "setFunding","reset","promptSeed","promptAdd","promptEdit","promptDelete",
 "capturesList","captureMedia","captureDelete","capturePurge","revokeLeaderTokens",
 "churchEdit","churchDelete","churchFlagClear","churchTemplate"
]);

function devKey(id){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return "count-" + id;
}
function tallyKey(id){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return "tally-" + id;
}
function tal2Key(id){
 id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
 return "tal2-" + id;
}
async function readEpoch(s){
 let e = null;
 try { e = await s.get("tallyEpoch", { type:"json" }); } catch(_) {}
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
const casCore = (s, mutate) => compareAndSwap(s, "core", normCore, mutate, legacyState(s));

async function readAll(s){
 const [core, checkins, io, prompter, radios] = await Promise.all([
 s.get("core", { type:"json" }),
 s.get("checkins", { type:"json" }),
 s.get("io", { type:"json" }),
 s.get("prompter", { type:"json" }),
 s.get("radios", { type:"json" })
 ]);
 return { core, checkins, io, prompter, radios };
}

async function migrateIfNeeded(s, parts){
 if(parts.core) return parts; // already on split layout
 const old = await s.get("state", { type:"json" });
 const core = normCore(old || {});
 const checkins = normCheckins((old && old.checkins) || []);
 const io = { list: (old && old.ioList) || [] };
 const prompter = normPrompter(old && old.prompter);
 await Promise.all([
 s.setJSON("core", core),
 s.setJSON("checkins", checkins),
 s.setJSON("io", io),
 s.setJSON("prompter", prompter),
 (old && old.count) ? s.setJSON(devKey("legacy"), old.count) : Promise.resolve()
 ]);
 // old "state" blob is left in place untouched as a safety net
 return { core, checkins, io, prompter, radios: parts.radios || null };
}

/* ---- head count aggregation ---- */
async function sumCounts(s){
 let total = 0;
 const { blobs } = await s.list({ prefix: "count-" });
 await Promise.all((blobs || []).map(async b => {
 const n = await s.get(b.key, { type:"json" });
 if(typeof n === "number") total += n;
 }));
 return Math.max(0, total);
}
async function sumTally(s){
 let total = 0; const by = {};
 const [t1, t2] = await Promise.all([ s.list({ prefix: "tally-" }), s.list({ prefix: "tal2-" }) ]);
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
function compactTally(value){
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

/* Authoritative rebuild of the head count from every shard (legacy + tally). */
async function rebuildAgg(s){
 const [cnt, tally] = await Promise.all([sumCounts(s), sumTally(s)]);
 return { total: Math.max(0, cnt + tally.total), by: tally.by };
}
/* Fast read: use the cached aggregate; rebuild + seed it if it is missing. */
async function readAgg(s){
 let agg = await s.get("count-agg", { type:"json" });
 if(!agg || typeof agg.total !== "number" || !agg.by || typeof agg.by !== "object"){
  agg = await rebuildAgg(s);
  await s.setJSON("count-agg", agg).catch(() => {});
 }
 return agg;
}
/* Apply an already-persisted shard delta to the cached aggregate under CAS.
   If it drifts or we can't win the race, we delete it so the next read rebuilds
   from the shards (which are the source of truth) — never wrong for long. */
async function bumpAgg(s, effTotal, effBy){
 for(let attempt = 0; attempt < 20; attempt++){
  if(attempt) await backoff(attempt);
  let res = null;
  try { res = await s.getWithMetadata("count-agg", { type:"json" }); } catch(_) { res = null; }
  if(!(res && res.data && typeof res.data.total === "number")){
   // No cache yet — seed it from the shards (which already include this tap).
   const fresh = await rebuildAgg(s);
   let w; try { w = await s.setJSON("count-agg", fresh, { onlyIfNew:true }); } catch(_) { w = { modified:false }; }
   if(w && w.modified) return;
   continue; // someone else seeded it; loop to apply our delta on top
  }
  const agg = { total: Math.max(0, (Number(res.data.total) || 0) + (effTotal || 0)), by: { ...res.data.by } };
  if(effBy) for(const k of Object.keys(effBy)) agg.by[k] = Math.max(0, (Number(agg.by[k]) || 0) + effBy[k]);
  let w; try { w = await s.setJSON("count-agg", agg, { onlyIfMatch: res.etag }); } catch(_) { w = { modified:false }; }
  if(w && w.modified) return;
 }
 await s.delete("count-agg").catch(() => {}); // give up cleanly → next read rebuilds
}

async function assemble(s){
 let parts = await readAll(s);
 parts = await migrateIfNeeded(s, parts);
 const core = normCore(parts.core);
 const [agg, tallyEpoch, capturesRaw, churchesRaw] = await Promise.all([ readAgg(s), readEpoch(s), s.get("captures", { type:"json" }), s.get("churches", { type:"json" }) ]);
 const captures = normCaptures(capturesRaw);
 // Only the rev + count ride in the main payload; the roster itself is
 // fetched on demand (GET ?part=churches) so polling stays light.
 const churchesRev = Math.max(0, Math.round(Number(churchesRaw && churchesRaw.rev) || 0));
 const churchCount = (churchesRaw && Array.isArray(churchesRaw.list)) ? churchesRaw.list.length : 0;
 // Self-seeding script board: fill in any missing starter scripts (no-op
 // write when nothing is missing, so the usual GET stays read-only).
 const prompter = await compareAndSwap(s, "prompter", normPrompter,
  p => mergeStarterScripts(p) ? p : undefined, () => ({ scripts: [] }));
 return {
 checklist: core.checklist,
 notes: core.notes,
 announcements: core.announcements,
 checkins: normCheckins(parts.checkins),
 feedback: core.feedback,
 praises: core.praises,
 count: Math.max(0, agg.total),
 tallyBy: agg.by || {},
 tallyEpoch,
 radios: normRadios(parts.radios).list,
 event: core.event,
 ioList: (parts.io && Array.isArray(parts.io.list)) ? parts.io.list : [],
 dayPinSet: !!core.dayPin, // the PIN itself is never sent to clients
 funding: core.funding,
 prompter: prompter,
 // Quick Capture records hold seekers' contact info, so the shared payload
 // only carries the count + storage usage; leaders pull the actual list
 // with the capturesList action.
 captureCount: captures.length,
 captureBytes: captureUsage(captures),
 captureBudget: CAPTURE_BUDGET(),
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

async function authLevel(s, req, body){
 const leader = ((body && body.pin) || req.headers.get("x-leader-pin") || "").toString();
 if(leader && leader === LEADER_PIN()) return "leader";
 if(leader && await validLeaderToken(s, leader)) return "leader";
 let day = ((body && body.dayPin) || req.headers.get("x-day-pin") || "").toString();
 if(!day){ try { day = new URL(req.url).searchParams.get("dp") || ""; } catch(_) {} }
 const core = normCore((await s.get("core", { type:"json" })) || (await s.get("state", { type:"json" })) || {});
 if(!core.dayPin) return "day";           // no Day PIN set → open, as before
 if(day && day === core.dayPin) return "day";
 return "none";
}

export default async (req, context) => {
 const s = getStore(STORE, { consistency: "strong" });

 if(req.method === "GET"){
  const lvl = await authLevel(s, req, null);
  let wantPart = "";
  try { wantPart = new URL(req.url).searchParams.get("part") || ""; } catch(_) {}
  if(lvl === "none"){
   /* Locked. The church roster is refused outright; the main payload returns
      only what the client needs to draw the Day PIN gate — no event data, no
      names, no contact info. */
   if(wantPart === "churches") return json({ error:"day pin required", locked:true }, 403);
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
  const body = JSON.stringify(await assemble(s));
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
 lvl = await authLevel(s, req, body);
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
 const core = normCore((await s.get("core", { type:"json" })) || (await s.get("state", { type:"json" })) || {});
 if(core.dayPin && pin === core.dayPin) return json({ ok:true, leader:false });
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
 const key = devKey(payload.dev);
 const cur = (await s.get(key, { type:"json" })) || 0;
 const before = (typeof cur === "number" ? cur : 0);
 const after = before + (Number(payload.delta) || 0);
 await s.setJSON(key, after);
 await bumpAgg(s, after - before, null);
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
 if(action === "tallySet"){
 const epoch = await readEpoch(s);
 if(((payload.epoch || "") + "") !== epoch){
  // The event was reset while this phone still held a pre-reset tally.
  // Tell it to clear instead of resurrecting old numbers.
  const agg = await readAgg(s);
  return json({ ok:false, epochMismatch:true, epoch, count: Math.max(0, agg.total), tallyBy: agg.by || {} });
 }
 const inc = compactTally({ total: payload.total, by: payload.by });
 const next = { total: Math.min(inc.total, 100000), by: {} };
 for(const k of Object.keys(inc.by).slice(0, 30)){
  const name = str(k, 40) || "?";
  next.by[name] = Math.min(inc.by[k], 100000);
 }
 let prev = { total:0, by:{} };
 await compareAndSwap(s, tal2Key(payload.dev), compactTally, cur => {
  prev = cur;
  return (JSON.stringify(cur) === JSON.stringify(next)) ? undefined : next;
 }, () => ({ total:0, by:{} }));
 const effBy = {};
 for(const k of new Set([ ...Object.keys(prev.by), ...Object.keys(next.by) ])){
  const d = (next.by[k] || 0) - (prev.by[k] || 0);
  if(d) effBy[k] = d;
 }
 const effTotal = next.total - prev.total;
 if(effTotal || Object.keys(effBy).length) await bumpAgg(s, effTotal, effBy);
 const agg = await readAgg(s);
 return json({ ok:true, count: Math.max(0, agg.total), tallyBy: agg.by || {} });
 }

 if(action === "tallyAdd"){
 const key = tallyKey(payload.dev);
 const tally = compactTally(await s.get(key, { type:"json" }));
 const by = (payload.by || "?").toString().slice(0, 40) || "?";
 const delta = Number(payload.delta) || 0;
 const beforeTotal = tally.total, beforeBy = tally.by[by] || 0;
 tally.total = Math.max(0, tally.total + delta);
 tally.by[by] = Math.max(0, (tally.by[by] || 0) + delta);
 await s.setJSON(key, tally);
 await bumpAgg(s, tally.total - beforeTotal, { [by]: tally.by[by] - beforeBy });
 return json({ ok:true });
 }

 /* ---- everything else touches exactly one blob, via compare-and-swap ---- */
 // Ensure the split blobs exist (first-run migration off the old single blob).
 await migrateIfNeeded(s, await readAll(s));

 switch(action){
 /* v1.10.0 — idempotent checkmark write for the client's persistent outbox.
    The payload states the FINAL value ({id, on}) instead of "flip whatever is
    there", so a retried request that already landed is a no-op — with the old
    toggleCheck, a retry after a landed-but-unconfirmed write would flip the
    mark back off. toggleCheck stays below for phones still on the old client. */
 case "setCheck":
 await casCore(s, core => {
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
 await casCore(s, core => {
 const id = payload.id;
 if(id){
 if(core.checklist[id]) delete core.checklist[id];
 else core.checklist[id] = { by: str(payload.by, 40), t: str(payload.t, 12), dm: (payload.dm ?? null) };
 }
 return core;
 });
 break;
 case "setChecklistNote":
 await casCore(s, core => {
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
 await compareAndSwap(s, "checkins", normCheckins, list => {
 if(payload.id && list.some(c => c.id === payload.id)) return undefined; // retry of an applied write
 list.push(normCheckin(payload)); return list.slice(-2000);
 }, () => []);
 break;
 case "addAnnouncement":
 await casCore(s, core => {
 if(payload.id && core.announcements.some(a => a.id === payload.id)) return undefined;
 core.announcements.unshift(normAnn(payload)); core.announcements = core.announcements.slice(0, 200); return core;
 });
 break;
 case "addPraise":
 await casCore(s, core => {
 if(payload.id && core.praises.some(x => x.id === payload.id)) return undefined;
 const it = normPraiseItem(payload); it.hidden = false; it.ackBy = ""; it.ackT = ""; it.comments = [];
 core.praises.unshift(it); core.praises = core.praises.slice(0, 500); return core;
 });
 break;
 case "addFeedback":
 await casCore(s, core => {
 if(payload.id && core.feedback.some(x => x.id === payload.id)) return undefined;
 const it = normIssue(payload); it.hidden = false; it.ackBy = ""; it.ackT = ""; it.comments = [];
 core.feedback.unshift(it); core.feedback = core.feedback.slice(0, 500); return core;
 });
 break;
 case "addComment":
 await casCore(s, core => {
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
 await compareAndSwap(s, "radios", normRadios, rad => {
 const n = Number(payload.n);
 if(!(n >= 1 && n <= 10)) return undefined;
 const next = { n, out: normStamp(payload.out), in: normStamp(payload.in) };
 if(JSON.stringify(rad.list[n-1]) === JSON.stringify(next)) return undefined; // already there
 rad.list[n-1] = next;
 return rad;
 }, () => ({ list: defaultRadios() }));
 break;
 case "radioToggle":
 await compareAndSwap(s, "radios", normRadios, rad => {
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
 await casCore(s, core => { core.event = { name: payload.name || "", date: payload.date || "" }; return core; });
 break;
 case "setIOList":
 /* Wholesale roster replacement — now used ONLY for structural edits (edit
    list / reload defaults). Patch checkmark taps go through ioSetRow below
    so concurrent techs can't clobber each other's progress. */
 if(!Array.isArray(payload.list)) break;
 await compareAndSwap(s, "io", normIO, io => { io.list = payload.list; return io; }, () => ({ list: [] }));
 break;
 /* v1.10.0 — per-row patch checkmark, merged server-side. Idempotent: a
    retried request that already landed is a no-op, and two techs checking
    DIFFERENT rows at the same time both stick (the old full-list setIOList
    was last-write-wins across the whole roster). `seed` carries the client's
    full roster only for the first-ever write, when the server list is empty. */
 case "ioSetRow": {
 await compareAndSwap(s, "io", normIO, io => {
 if(!io.list.length && Array.isArray(payload.seed) && payload.seed.length) io.list = payload.seed;
 let hit = null;
 for(const p of io.list) if(p && p.id === payload.pid) for(const r of (p.rows || [])) if(r && r.id === payload.rid) hit = r;
 if(!hit) return undefined;
 const done = !!payload.done;
 if(!!hit.done === done) return undefined; // already in the desired state (keep the first author's stamp)
 hit.done = done;
 hit.by = done ? str(payload.by, 40) : "";
 hit.t = done ? str(payload.t, 12) : "";
 return io;
 }, () => ({ list: [] }));
 break;
 }
 case "setDayPin":
 await casCore(s, core => { core.dayPin = (payload.pin || "").toString().trim().slice(0, 10); return core; });
 break;
 case "setFunding":
 await casCore(s, core => { core.funding = { pct: clampPct(payload.pct), needed: (payload.needed || "").toString().slice(0, 30) || core.funding.needed }; return core; });
 break;
 /* v1.10.0 — idempotent acknowledge/hide, same treatment as setCheck. The
    payload states the FINAL hidden value instead of toggling, so a retried
    request or two leaders acking the same card at once can't flip it back to
    visible (the "acknowledge & hide didn't actually hide it" bug). ackCard
    stays below for phones still on the old client. */
 case "setAck":
 await casCore(s, core => {
 const arr = payload.kind === "praise" ? core.praises : core.feedback;
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
 await casCore(s, core => {
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
    season-long relationship record. */
 {
 const [curCore, curCheckins, curIO, curRadios] = await Promise.all([
  s.get("core", { type:"json" }), s.get("checkins", { type:"json" }),
  s.get("io", { type:"json" }), s.get("radios", { type:"json" })
 ]);
 await snapshot(s, "reset", { core: curCore, checkins: curCheckins, io: curIO, radios: curRadios });
 }
 await casCore(s, core => ({ ...EMPTY_CORE, event: core.event, dayPin: core.dayPin, funding: core.funding, praises: core.praises }));
 await compareAndSwap(s, "io", normIO, io => { io.list = ioListClearProgress(io.list); return io; }, () => ({ list: [] }));
 const [c1, c2, c3] = await Promise.all([ s.list({ prefix: "count-" }), s.list({ prefix: "tally-" }), s.list({ prefix: "tal2-" }) ]);
 const doomed = [ ...((c1 && c1.blobs) || []), ...((c2 && c2.blobs) || []), ...((c3 && c3.blobs) || []) ]
  .filter(b => b.key !== "count-agg"); // rewritten below, not deleted (racy otherwise)
 await Promise.all([
 s.setJSON("checkins", []),
 s.setJSON("radios", { list: defaultRadios() }),
 s.setJSON("count-agg", { total:0, by:{} }),
 s.setJSON("tallyEpoch", { e: uid() }), // stale phones clear instead of re-pushing old tallies
 ...doomed.map(b => s.delete(b.key))
 ]);
 break;
 }
 /* ---- Recording Studio ---- */
 case "promptSeed":
 if(Array.isArray(payload.scripts))
 await compareAndSwap(s, "prompter", normPrompter, p => p.scripts.length ? undefined : normPrompter({ scripts: payload.scripts }), () => ({ scripts: [] }));
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
 case "capturesList":
 return json({ captures: normCaptures(await s.get("captures", { type:"json" })) });
 case "captureMedia": {
 const dataUrl = await s.get(capMediaKey(payload.id));
 return json({ id: str(payload.id, 40), dataUrl: (typeof dataUrl === "string" && dataUrl.startsWith("data:")) ? dataUrl : "" });
 }
 case "captureDelete":
 await compareAndSwap(s, "captures", normCaptures, list => {
 const id = str(payload.id, 40);
 if(!list.some(c => c.id === id)) return undefined;
 return list.filter(c => c.id !== id);
 }, () => []);
 await s.delete(capMediaKey(payload.id)).catch(() => {});
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
