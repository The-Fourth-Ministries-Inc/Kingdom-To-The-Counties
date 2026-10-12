/* Church research bot API (v1.25.0).

   POST /api/churches/v1/import   add churches / fill blank fields
   GET  /api/churches/v1/keys     every church's dedup key (?state=NH)
   GET  /api/churches/v1/lookup   ?name=&town=&state=&county=&phone=&website=

   Auth: "Authorization: Bearer <key>". Each bot has its own key in a Netlify
   environment variable named CHURCH_API_KEY_<BOT> (e.g. CHURCH_API_KEY_SCOUT);
   <BOT> becomes the name on everything it writes. Keys shorter than 24
   characters are ignored. Remove the variable to revoke a bot.

   Optional switches:
     CHURCH_API_WRITES        "on" (default) · "dryrun" (only dry runs allowed) · "off" (503)
     CHURCH_API_DAILY_CREATES new churches per bot per day (default 150)

   The rules for what a bot may change live with the roster in data.mjs
   (apiRecord / chApplyImport): create unverified rows with sources, fill
   blanks only, never overwrite, delete, or touch partnership fields. */
import { createHash, timingSafeEqual } from "node:crypto";
import { openStore, importChurches, churchKeys, churchLookup } from "./data.mjs";

const MAX_BODY = 1024 * 1024;
const MAX_RECORDS = 100;
const RATE_PER_MIN = 30;
const IDEM_DAYS = 7;

const json = (body, status = 200, extra) => new Response(JSON.stringify(body), {
 status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extra || {}) }
});
const sha = v => createHash("sha256").update(String(v)).digest();
const shaHex = v => createHash("sha256").update(String(v)).digest("hex");

/* Which bot is calling, or null. Compares hashes so every comparison is the
   same length and constant-time. */
export function botFor(req, env = process.env){
 const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
 if(!m) return null;
 const got = sha(m[1]);
 let who = null;
 for(const [k, v] of Object.entries(env || {})){
  const bm = /^CHURCH_API_KEY_([A-Z0-9_]{1,30})$/.exec(k);
  if(!bm || typeof v !== "string" || v.length < 24) continue;
  if(timingSafeEqual(got, sha(v))) who = bm[1].toLowerCase();
 }
 return who;
}
const botLabel = b => b.split("_").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

async function rateOk(s, bot){
 const key = "capi-rate-" + bot, now = Date.now();
 let rec = null;
 try { rec = await s.get(key, { type: "json" }); } catch(_) {}
 const t = (rec && Array.isArray(rec.t) ? rec.t : []).filter(x => x > now - 60000);
 if(t.length >= RATE_PER_MIN) return Math.max(1, Math.ceil((t[0] + 60000 - now) / 1000));
 t.push(now);
 await s.setJSON(key, { t }).catch(() => {});
 return 0;
}
function eventDay(){
 try {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
   .formatToParts(new Date()).map(x => [x.type, x.value]));
  return p.year + "-" + p.month + "-" + p.day;
 } catch(_) { return new Date().toISOString().slice(0, 10); }
}

async function handleImport(req, s, bot, env){
 const writes = String(env.CHURCH_API_WRITES || "on").toLowerCase();
 if(writes === "off") return json({ error: "church imports are switched off (CHURCH_API_WRITES=off)" }, 503);
 const len = Number(req.headers.get("content-length") || 0);
 if(len > MAX_BODY) return json({ error: "body over 1 MB" }, 413);
 const text = await req.text();
 if(text.length > MAX_BODY) return json({ error: "body over 1 MB" }, 413);
 let body;
 try { body = JSON.parse(text); } catch(_) { return json({ error: "body is not JSON" }, 422); }
 if(!body || typeof body !== "object" || !Array.isArray(body.records)) return json({ error: "expected { records: [...] }" }, 422);
 if(!body.records.length) return json({ error: "records is empty" }, 422);
 if(body.records.length > MAX_RECORDS) return json({ error: "at most " + MAX_RECORDS + " records per request" }, 413);
 if(body.mode != null && body.mode !== "create_only" && body.mode !== "upsert") return json({ error: "mode must be create_only or upsert" }, 422);
 const dryRun = body.dryRun === true;
 if(!dryRun && writes === "dryrun") return json({ error: "only dry runs are allowed right now (CHURCH_API_WRITES=dryrun)" }, 403);

 /* Idempotency-Key: the same key + same body replays the first answer; the
    same key with a different body is refused. */
 const idem = (req.headers.get("idempotency-key") || "").slice(0, 200);
 const bodyHash = shaHex(text);
 const idemKey = idem ? "capi-idem-" + shaHex(bot + "|" + idem) : "";
 if(idemKey && !dryRun){
  const prev = await s.get(idemKey, { type: "json" }).catch(() => null);
  if(prev && prev.exp > Date.now()){
   if(prev.hash !== bodyHash) return json({ error: "Idempotency-Key was already used with a different body" }, 409);
   return json({ ...prev.response, replayed: true }, prev.status);
  }
 }

 const dayKey = "capi-day-" + bot + "-" + eventDay();
 const day = (await s.get(dayKey, { type: "json" }).catch(() => null)) || { created: 0 };
 const cap = Math.max(0, Math.round(Number(env.CHURCH_API_DAILY_CREATES ?? 150)));
 const r = await importChurches(s, {
  bot, botLabel: botLabel(bot), records: body.records, dryRun, mode: body.mode,
  runId: body.runId, maxCreates: Math.max(0, cap - (Number(day.created) || 0))
 });
 if(!dryRun && r.created){
  await s.setJSON(dayKey, { created: (Number(day.created) || 0) + r.created }).catch(() => {});
 }
 const summary = {};
 for(const x of r.results) summary[x.status] = (summary[x.status] || 0) + 1;
 const response = { ok: true, dryRun: r.dryRun, bot, mode: body.mode || "create_only", rev: r.rev, summary, results: r.results,
  createsLeftToday: Math.max(0, cap - (Number(day.created) || 0) - (dryRun ? 0 : r.created)) };
 if(idemKey && !dryRun){
  await s.setJSON(idemKey, { exp: Date.now() + IDEM_DAYS * 86400000, hash: bodyHash, status: 200, response }).catch(() => {});
 }
 return json(response);
}

export default async (req, context, env = process.env) => {
 const url = new URL(req.url);
 const route = url.pathname.replace(/^\/api\/churches\/v1\/?/, "").replace(/\/+$/, "");
 const bot = botFor(req, env);
 if(!bot) return json({ error: "missing or unknown API key" }, 401, { "WWW-Authenticate": "Bearer" });
 const s = openStore(req, context);
 const wait = await rateOk(s, bot);
 if(wait) return json({ error: "rate limited — " + RATE_PER_MIN + " requests a minute" }, 429, { "Retry-After": String(wait) });
 try {
  if(route === "import"){
   if(req.method !== "POST") return json({ error: "POST only" }, 405, { "Allow": "POST" });
   return await handleImport(req, s, bot, env);
  }
  if(route === "keys"){
   if(req.method !== "GET") return json({ error: "GET only" }, 405, { "Allow": "GET" });
   return json({ ok: true, ...(await churchKeys(s, url.searchParams.get("state") || "")) });
  }
  if(route === "lookup"){
   if(req.method !== "GET") return json({ error: "GET only" }, 405, { "Allow": "GET" });
   const q = Object.fromEntries(["name","town","state","county","phone","website"].map(k => [k, url.searchParams.get(k) || ""]));
   if(!q.name || !q.town) return json({ error: "name and town are required" }, 422);
   return json({ ok: true, ...(await churchLookup(s, q)) });
  }
  return json({ error: "not found" }, 404);
 } catch(e){
  console.log("churches-api failed:", e && e.message);
  return json({ error: "server error" }, 500);
 }
};

export const config = { path: "/api/churches/v1/*" };
