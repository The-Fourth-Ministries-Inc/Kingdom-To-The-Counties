import { getStore } from "@netlify/blobs";

const STORE = "k2c-ambassador";
const DEFAULT_DAY_PIN = "0711";
// Leader PIN is verified SERVER-SIDE. Rotate it by setting a LEADER_PIN
// environment variable in Netlify (Site settings → Environment variables),
// then redeploying — no code change needed.
const LEADER_PIN = () => process.env.LEADER_PIN || "2026";

/* ---------------- storage layout ----------------
   The shared record used to be ONE blob ("state"), so any two concurrent
   writes could clobber each other. v18 splits it by domain:
     core      — checklist, announcements, feedback, praises, event, dayPin, funding
     checkins  — check-in list
     io        — Tech I/O roster + patch progress
     prompter  — Recording Studio scripts
     count-<device> — one counter shard PER PHONE; GET sums them, so two
                      people counting at once can never erase each other.
   Old single-blob data migrates automatically on first read. */

const EMPTY_CORE = { checklist:{}, announcements:[], feedback:[], praises:[], event:{name:"",date:""}, dayPin:DEFAULT_DAY_PIN, funding:{pct:64, needed:"$60,000"} };

function ioListClearProgress(list){
  if(!Array.isArray(list) || !list.length) return list;
  return list.map(p => ({ ...p, rows: (p.rows || []).map(r => ({ ...r, done:false, by:"", t:"" })) }));
}

export function normCore(c){
  c = c || {};
  return {
    checklist:     c.checklist     || {},
    announcements: c.announcements || [],
    feedback:      c.feedback      || [],
    praises:       c.praises       || [],
    event:         c.event         || { name:"", date:"" },
    // One-time migration: retire the old 0627 Day PIN in favor of 0711.
    dayPin:        (typeof c.dayPin === "string" && c.dayPin !== "0627") ? c.dayPin : DEFAULT_DAY_PIN,
    funding:       { pct: clampPct(c.funding && c.funding.pct), needed: ((c.funding && c.funding.needed) || "$60,000").toString().slice(0, 30) }
  };
}
function clampPct(n){ n = Number(n); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 64; }

export function normPrompter(p){
  p = p || {};
  const scripts = Array.isArray(p.scripts) ? p.scripts : [];
  return { scripts: scripts.map(sc => ({
    id:       (sc.id || "").toString().slice(0, 40),
    event:    (sc.event || "").toString().slice(0, 60),
    title:    (sc.title || "").toString().slice(0, 80),
    due:      (sc.due || "").toString().slice(0, 10),
    assignee: (sc.assignee || "").toString().slice(0, 30),
    body:     (sc.body || "").toString().slice(0, 20000),
    done:     sc.done && sc.done.initials
                ? { initials:(sc.done.initials||"").toString().slice(0,4), date:(sc.done.date||"").toString().slice(0,12) }
                : null
  })).slice(0, 200) };
}

const LEADER_ACTIONS = new Set([
  "toggleCheck","addAnnouncement","ackCard","setEvent","setIOList","setDayPin",
  "setFunding","reset","promptSeed","promptAdd","promptEdit","promptDelete"
]);

function devKey(id){
  id = (id || "anon").toString().replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "anon";
  return "count-" + id;
}

async function readAll(s){
  const [core, checkins, io, prompter] = await Promise.all([
    s.get("core",     { type:"json" }),
    s.get("checkins", { type:"json" }),
    s.get("io",       { type:"json" }),
    s.get("prompter", { type:"json" })
  ]);
  return { core, checkins, io, prompter };
}

async function migrateIfNeeded(s, parts){
  if(parts.core) return parts;                                   // already on v18 layout
  const old = await s.get("state", { type:"json" });
  const core = normCore(old || {});
  const checkins = (old && old.checkins) || [];
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
  return { core, checkins, io, prompter };
}

async function sumCounts(s){
  let total = 0;
  const { blobs } = await s.list({ prefix: "count-" });
  await Promise.all((blobs || []).map(async b => {
    const n = await s.get(b.key, { type:"json" });
    if(typeof n === "number") total += n;
  }));
  return Math.max(0, total);
}

async function assemble(s){
  let parts = await readAll(s);
  parts = await migrateIfNeeded(s, parts);
  const core = normCore(parts.core);
  return {
    checklist:     core.checklist,
    announcements: core.announcements,
    checkins:      Array.isArray(parts.checkins) ? parts.checkins : [],
    feedback:      core.feedback,
    praises:       core.praises,
    count:         await sumCounts(s),
    event:         core.event,
    ioList:        (parts.io && Array.isArray(parts.io.list)) ? parts.io.list : [],
    dayPinSet:     !!core.dayPin,           // the PIN itself is never sent to clients
    funding:       core.funding,
    prompter:      normPrompter(parts.prompter)
  };
}

const json = (obj, status=200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
});

export default async (req) => {
  const s = getStore(STORE, { consistency: "strong" });

  if(req.method === "GET") return json(await assemble(s));

  if(req.method === "POST"){
    let body = {};
    try { body = await req.json(); } catch(_) {}
    const action  = body.action;
    const payload = body.payload || {};
    const pin     = (body.pin || "").toString();

    /* ---- PIN verification (no state change) ---- */
    if(action === "verifyLeaderPin"){
      return pin === LEADER_PIN() ? json({ ok:true }) : json({ error:"wrong pin" }, 403);
    }
    if(action === "verifyDayPin"){
      if(pin && pin === LEADER_PIN()) return json({ ok:true, leader:true });
      const core = normCore((await s.get("core", { type:"json" })) || (await s.get("state", { type:"json" })) || {});
      if(core.dayPin && pin === core.dayPin) return json({ ok:true, leader:false });
      return json({ error:"wrong pin" }, 403);
    }

    /* ---- privileged actions require the leader PIN, verified here ---- */
    if(LEADER_ACTIONS.has(action) && pin !== LEADER_PIN()){
      return json({ error:"leader pin required" }, 403);
    }

    /* ---- counter: each device writes ONLY its own shard ---- */
    if(action === "bump"){
      const key = devKey(payload.dev);
      const cur = (await s.get(key, { type:"json" })) || 0;
      await s.setJSON(key, (typeof cur === "number" ? cur : 0) + (Number(payload.delta) || 0));
      return json(await assemble(s));
    }

    /* ---- everything else touches exactly one blob ---- */
    let parts = await readAll(s);
    parts = await migrateIfNeeded(s, parts);
    const core = normCore(parts.core);
    const checkins = Array.isArray(parts.checkins) ? parts.checkins : [];
    const io = (parts.io && Array.isArray(parts.io.list)) ? parts.io : { list: [] };
    const prompter = normPrompter(parts.prompter);

    switch(action){
      case "toggleCheck": {
        const id = payload.id;
        if(id){
          if(core.checklist[id]) delete core.checklist[id];
          else core.checklist[id] = { by: payload.by || "", t: payload.t || "", dm: (payload.dm ?? null) };
        }
        await s.setJSON("core", core); break;
      }
      case "addCheckin":      checkins.push(payload); await s.setJSON("checkins", checkins); break;
      case "addAnnouncement": core.announcements.unshift(payload); await s.setJSON("core", core); break;
      case "addPraise":       core.praises.unshift(payload); await s.setJSON("core", core); break;
      case "addFeedback":     core.feedback.unshift(payload); await s.setJSON("core", core); break;
      case "setEvent":        core.event = { name: payload.name || "", date: payload.date || "" }; await s.setJSON("core", core); break;
      case "setIOList":       if(Array.isArray(payload.list)){ io.list = payload.list; await s.setJSON("io", io); } break;
      case "setDayPin":       core.dayPin = (payload.pin || "").toString().trim().slice(0, 10); await s.setJSON("core", core); break;
      case "setFunding":      core.funding = { pct: clampPct(payload.pct), needed: (payload.needed || "").toString().slice(0, 30) || core.funding.needed }; await s.setJSON("core", core); break;
      case "ackCard": {
        const arr = payload.kind === "praise" ? core.praises : core.feedback;
        const it = arr.find(x => x.id === payload.id);
        if(it){
          const hide = !it.hidden;
          it.hidden = hide;
          it.ackBy  = hide ? (payload.by || "") : "";
          it.ackT   = hide ? (payload.t  || "") : "";
        }
        await s.setJSON("core", core); break;
      }
      case "reset": {
        const fresh = { ...EMPTY_CORE, event: core.event, dayPin: core.dayPin, funding: core.funding };
        io.list = ioListClearProgress(io.list);
        const { blobs } = await s.list({ prefix: "count-" });
        await Promise.all([
          s.setJSON("core", fresh),
          s.setJSON("checkins", []),
          s.setJSON("io", io),
          ...(blobs || []).map(b => s.delete(b.key))
        ]);
        break;
      }
      /* ---- Recording Studio ---- */
      case "promptSeed":
        if(!prompter.scripts.length && Array.isArray(payload.scripts)){
          await s.setJSON("prompter", normPrompter({ scripts: payload.scripts }));
        }
        break;
      case "promptAdd":
        if(payload.script && payload.script.id){
          prompter.scripts.push(normPrompter({ scripts:[payload.script] }).scripts[0]);
          await s.setJSON("prompter", prompter);
        }
        break;
      case "promptEdit": {
        const i = prompter.scripts.findIndex(x => x.id === payload.id);
        if(i >= 0){
          const merged = { ...prompter.scripts[i], ...(payload.patch || {}), id: payload.id };
          prompter.scripts[i] = normPrompter({ scripts:[merged] }).scripts[0];
          await s.setJSON("prompter", prompter);
        }
        break;
      }
      case "promptDelete":
        prompter.scripts = prompter.scripts.filter(x => x.id !== payload.id);
        await s.setJSON("prompter", prompter);
        break;
      case "promptDone": {
        const it = prompter.scripts.find(x => x.id === payload.id);
        if(it){
          it.done = { initials:(payload.initials||"").toString().toUpperCase().slice(0,4), date:(payload.date||"").toString().slice(0,12) };
          await s.setJSON("prompter", prompter);
        }
        break;
      }
      case "promptUndone": {
        const it = prompter.scripts.find(x => x.id === payload.id);
        if(it){ it.done = null; await s.setJSON("prompter", prompter); }
        break;
      }
      default: return json({ error:"unknown action" }, 400);
    }
    return json(await assemble(s));
  }

  return json({ error:"method not allowed" }, 405);
};

export const config = { path: "/.netlify/functions/data" };
