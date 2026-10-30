/* Directory fix reports (v1.28.0).

   POST /api/directory/v1/fix          pop-up (JSON) or no-JS form
   GET  /api/directory/v1/fix          no-JS form (?id=&p=)
   GET  /api/directory/v1/fix/thanks   thank-you page

   The public directory lives on thefourthministries.com. This function only
   receives corrections. Reports are saved in Netlify Blobs first, then mailed
   through Microsoft Graph if the mail settings exist. A missing setting or a
   mail failure still keeps the report and still answers success.

   Mail settings (Netlify environment, never committed):
     MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, FIX_MAIL_FROM, FIX_MAIL_TO
*/
import { createHash, randomBytes } from "node:crypto";
import { openStore, storeName, normChurches } from "./data.mjs";

const MAX_BODY = 16 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 5;
const PER_DAY = 20;
const SITE_DAY = 200;
const FAST_MS = 3000;
const PRODUCTION_STORE = "k2c-ambassador";
const DIRECTORY = "https://thefourthministries.com/find-a-church-nh";
const ORIGINS = {
 "https://thefourthministries.com": 1,
 "https://www.thefourthministries.com": 1
};
const MAIL_KEYS = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "FIX_MAIL_FROM", "FIX_MAIL_TO"];
const CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]+$/;
const SLUG_RE = /^[a-z0-9-]+$/;

const CSS = ":root{--ink:#2B2A28;--cream:#F5F2E9;--card:#FBFAF6;--line:#E6E1D4;--muted:#6E6A60;--wine:#6B2E34;--serif:Georgia,\"Times New Roman\",serif;--sans:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif}"
 + "*{box-sizing:border-box}html,body{margin:0;padding:0}"
 + "body{font-family:var(--sans);background:var(--cream);color:var(--ink);line-height:1.45}"
 + "main{max-width:34rem;margin:0 auto;padding:28px 16px 48px}"
 + "h1{font-family:var(--serif);font-weight:500;font-size:2rem;line-height:1.15;margin:0 0 8px}"
 + ".for,.note{color:var(--muted)}.for{margin:0 0 18px}.note{font-size:.95rem}"
 + "label{display:block;font-weight:600;margin:14px 0 6px}"
 + "input,textarea{width:100%;font:inherit;font-size:16px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-height:44px}"
 + "textarea{min-height:140px;resize:vertical}"
 + "button{font:inherit;font-size:16px;font-weight:700;color:var(--cream);background:var(--wine);border:0;border-radius:999px;min-height:44px;padding:12px 22px;margin-top:18px;width:100%}"
 + "a{color:var(--wine)}.back{display:inline-flex;align-items:center;min-height:44px;font-weight:700}"
 + ".hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}";

let tokenCache = { key: "", token: "", exp: 0 };

export function __resetFixMail(){
 tokenCache = { key: "", token: "", exp: 0 };
}

export function easternDay(date){
 try {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
   timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date || new Date()).map(x => [x.type, x.value]));
  return p.year + "-" + p.month + "-" + p.day;
 } catch(_) {
  return (date || new Date()).toISOString().slice(0, 10);
 }
}

function esc(s){
 return String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function line(s){
 return String(s == null ? "" : s).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/ +/g, " ").trim();
}
function clip(s, n){
 return String(s == null ? "" : s).trim().slice(0, n);
}
function sha256(v){
 return createHash("sha256").update(String(v)).digest("hex");
}
function envGet(env, key){
 if(env) return env[key] == null ? "" : String(env[key]);
 try {
  if(typeof Netlify !== "undefined" && Netlify.env && typeof Netlify.env.get === "function"){
   const v = Netlify.env.get(key);
   if(v != null && String(v) !== "") return String(v);
  }
 } catch(_) {}
 return process.env[key] == null ? "" : String(process.env[key]);
}
function originAllowed(req, context, origin){
 if(ORIGINS[origin]) return true;
 if(!/^http:\/\/localhost(:\d+)?$/.test(origin)) return false;
 return storeName(req, context) !== PRODUCTION_STORE;
}
function corsFor(req, context){
 const origin = req.headers.get("origin") || "";
 const headers = { "Vary": "Origin" };
 if(!origin || !originAllowed(req, context, origin)) return headers;
 headers["Access-Control-Allow-Origin"] = origin;
 headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
 headers["Access-Control-Allow-Headers"] = "Content-Type";
 headers["Access-Control-Max-Age"] = "86400";
 return headers;
}
function clientIp(req, context){
 const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "";
 return String(ip).trim() || "unknown";
}
function allowedPageUrl(v){
 const raw = clip(v, 300);
 if(!raw) return "";
 try {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  if(u.protocol !== "https:") return "";
  if(host !== "thefourthministries.com" && host !== "www.thefourthministries.com") return "";
  if(u.username || u.password) return "";
  return u.toString();
 } catch(_) { return ""; }
}
function page(title, body){
 return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
  + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
  + "<meta name=\"robots\" content=\"noindex\">\n<title>" + esc(title) + "</title>\n<style>\n"
  + CSS + "\n</style>\n</head>\n<body>\n<main>\n" + body + "\n</main>\n</body>\n</html>\n";
}
function input(name, label, type, ac, max){
 return "<label for=\"" + name + "\">" + esc(label) + "</label>"
  + "<input id=\"" + name + "\" name=\"" + name + "\" type=\"" + type
  + "\" autocomplete=\"" + ac + "\" required maxlength=\"" + max + "\">";
}
function formPage(church, churchId, pageUrl, pageSlug){
 const forLine = church
  ? "<p class=\"for\">For: " + esc(church.name) + "</p>"
  : "<p class=\"for\">Tell us what should be corrected in the church directory.</p>";
 let hidden = "";
 if(churchId) hidden += "<input type=\"hidden\" name=\"churchId\" value=\"" + esc(churchId) + "\">";
 if(pageSlug) hidden += "<input type=\"hidden\" name=\"page\" value=\"" + esc(pageSlug) + "\">";
 if(pageUrl) hidden += "<input type=\"hidden\" name=\"pageUrl\" value=\"" + esc(pageUrl) + "\">";
 return page("Report a fix",
  "<h1>Report a fix</h1>" + forLine
  + "<form method=\"post\" action=\"/api/directory/v1/fix\">" + hidden
  + "<div class=\"hp\" aria-hidden=\"true\"><label for=\"website\">Website</label>"
  + "<input id=\"website\" name=\"website\" type=\"text\" tabindex=\"-1\" autocomplete=\"off\" value=\"\"></div>"
  + input("name", "Your name", "text", "name", 100)
  + input("email", "Email", "email", "email", 200)
  + input("phone", "Phone", "tel", "tel", 40)
  + "<label for=\"message\">What's incorrect</label>"
  + "<textarea id=\"message\" name=\"message\" required maxlength=\"2000\"></textarea>"
  + "<button type=\"submit\">Send the correction</button></form>"
  + "<p class=\"note\">Your name, email and phone come to The Fourth Ministries so we can follow up. They are not added to the public directory.</p>");
}
function thanksPage(back){
 const extra = back
  ? "<p><a class=\"back\" href=\"" + esc(back) + "\">Back to the page you were on</a></p>"
  : "";
 return page("Thank you",
  "<h1>Thank you, we got it</h1>"
  + "<p>We'll look into what you sent and correct the directory.</p>"
  + extra
  + "<p><a class=\"back\" href=\"" + DIRECTORY + "\">Back to the church directory</a></p>");
}
function htmlHeaders(req, context, extra){
 return Object.assign({
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff"
 }, corsFor(req, context), extra || {});
}
function jsonResponse(req, context, body, status, extra){
 const headers = Object.assign({
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
 }, corsFor(req, context), extra || {});
 return new Response(JSON.stringify(body), { status: status || 200, headers });
}
function errorResponse(req, context, wantsJson, status, error, extra){
 if(wantsJson) return jsonResponse(req, context, { error: error }, status, extra);
 const headers = htmlHeaders(req, context, extra);
 return new Response(page("We couldn't send that",
  "<h1>We couldn't send that</h1><p>" + esc(error) + "</p>"
  + "<p><a class=\"back\" href=\"/api/directory/v1/fix\">Back to the form</a></p>"),
  { status: status, headers: headers });
}

/* The roster loader used by the church API falls back to a starter list when
   the blob is empty. A fix report must not treat that starter list as the
   public directory, so an empty store is "not in the roster". */
async function rosterChurch(s, id){
 let raw = null;
 try { raw = await s.get("churches", { type: "json" }); } catch(_) { return null; }
 if(!raw || typeof raw !== "object" || !Array.isArray(raw.list)) return null;
 const hit = normChurches(raw).list.find(x => x && x.id === id);
 if(!hit || !hit.name) return null;
 return { name: hit.name, town: hit.town || "", state: hit.state || "" };
}

function tooFast(t){
 if(t == null || t === "") return false;
 const n = Number(t);
 if(!Number.isFinite(n) || n <= 0) return false;
 const delta = Date.now() - n;
 /* A phone clock a few seconds ahead used to look "too fast" and the report
    was thrown away. Only a submit inside the window, or a timestamp far in
    the future, is dropped. */
 if(delta < 0) return delta < -5 * 60 * 1000;
 return delta < FAST_MS;
}
function validate(data){
 const name = clip(data.name, 200).trim();
 const email = line(data.email);
 const phone = line(data.phone);
 const message = clip(data.message, 4000).trim();
 const churchId = line(data.churchId).toLowerCase();
 if(!name) return { error: "Please enter your name." };
 if(name.length > 100) return { error: "Name needs to be 100 characters or less." };
 if(!email || email.length > 200 || !EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
 if(!phone) return { error: "Please enter a phone number." };
 if(phone.length > 40 || !PHONE_RE.test(phone) || !/\d/.test(phone)) return { error: "Please enter a phone number we can call." };
 if(!message) return { error: "Please tell us what's incorrect." };
 if(message.length > 2000) return { error: "That note needs to be 2,000 characters or less." };
 if(churchId && (churchId.length > 120 || !SLUG_RE.test(churchId))) return { error: "That church reference doesn't look right." };
 const pageSlug = line(data.page).toLowerCase();
 return {
  name: name,
  email: email,
  phone: phone,
  message: message,
  churchId: churchId,
  page: pageSlug && SLUG_RE.test(pageSlug) && pageSlug.length <= 300 ? pageSlug : "",
  pageUrl: allowedPageUrl(data.pageUrl)
 };
}

function secondsUntilEasternMidnight(now){
 try {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
   timeZone: "America/New_York", hourCycle: "h23",
   hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(now || Date.now())).map(x => [x.type, x.value]));
  let h = Number(p.hour);
  if(h === 24) h = 0;
  const secs = (h * 3600) + (Number(p.minute) * 60) + Number(p.second);
  if(!Number.isFinite(secs)) return 3600;
  return Math.max(60, 86400 - secs);
 } catch(_) { return 3600; }
}

/* Counts this report against the visitor window and the site day. Returns
   seconds to wait, or 0 when the report may be stored. The hash is
   sha256(ip + Eastern date); the raw address is never written. */
async function rateTake(s, hash, day){
 const now = Date.now();
 const rateKey = "dfix-rate-" + hash;
 const siteKey = "dfix-day-" + day;
 let rec = null, site = null;
 try { rec = await s.get(rateKey, { type: "json" }); } catch(_) {}
 try { site = await s.get(siteKey, { type: "json" }); } catch(_) {}
 const t = (rec && Array.isArray(rec.t) ? rec.t : []).filter(x => x > now - WINDOW_MS);
 const n = rec && Number.isFinite(Number(rec.n)) ? Number(rec.n) : 0;
 const siteN = site && Number.isFinite(Number(site.n)) ? Number(site.n) : 0;
 if(t.length >= PER_WINDOW) return Math.max(1, Math.ceil((t[0] + WINDOW_MS - now) / 1000));
 if(n >= PER_DAY || siteN >= SITE_DAY) return secondsUntilEasternMidnight(now);
 t.push(now);
 await s.setJSON(rateKey, { t: t, n: n + 1 }).catch(() => {});
 await s.setJSON(siteKey, { n: siteN + 1 }).catch(() => {});
 return 0;
}

async function readPayload(req){
 const len = Number(req.headers.get("content-length") || 0);
 const ct = (req.headers.get("content-type") || "").toLowerCase();
 if(Number.isFinite(len) && len > MAX_BODY) return { status: 413, error: "That note is too large to send.", wantsJson: ct.includes("application/json") };
 const text = await req.text();
 if(text.length > MAX_BODY) return { status: 413, error: "That note is too large to send.", wantsJson: ct.includes("application/json") };
 const wantsJson = ct.includes("application/json") || (!ct.includes("application/x-www-form-urlencoded") && !ct.includes("multipart/") && /^\s*[{[]/.test(text));
 if(ct.includes("multipart/")) return { status: 422, error: "Please send the form as JSON or a regular form.", wantsJson: false };
 if(wantsJson){
  let data = null;
  try { data = JSON.parse(text || "null"); } catch(_) {
   return { status: 422, error: "We couldn't read that. Please try again.", wantsJson: true };
  }
  if(!data || typeof data !== "object" || Array.isArray(data)) return { status: 422, error: "We couldn't read that. Please try again.", wantsJson: true };
  return { data: data, wantsJson: true };
 }
 const params = new URLSearchParams(text);
 const data = {};
 for(const [k, v] of params) data[k] = v;
 return { data: data, wantsJson: false };
}

function mailBody(report){
 const church = report.church;
 const rows = [
  "Church: " + (church && church.name ? line(church.name) : "(not in the roster)"),
  "Town: " + (church && church.town ? line(church.town) : ""),
  "State: " + (church && church.state ? line(church.state) : ""),
  "Church id: " + (report.churchId || "(none)"),
  "Unknown id: " + (report.unknownId ? "yes" : "no"),
  "",
  "From: " + line(report.name),
  "Email: " + line(report.email),
  "Phone: " + line(report.phone),
  "",
  "What's wrong:",
  String(report.message || ""),
  "",
  "Page: " + (report.pageUrl || report.page || "(not sent)"),
  "Received: " + easternStamp(report.at),
  "Record: " + report.id
 ];
 return rows.join("\n");
}
function easternStamp(iso){
 try {
  return new Intl.DateTimeFormat("en-US", {
   timeZone: "America/New_York", dateStyle: "full", timeStyle: "short"
  }).format(new Date(iso)) + " ET";
 } catch(_) { return String(iso || ""); }
}

async function graphToken(env, fetchImpl){
 const tenant = line(envGet(env, "MS_TENANT_ID"));
 const clientId = line(envGet(env, "MS_CLIENT_ID"));
 const secret = envGet(env, "MS_CLIENT_SECRET");
 const cacheKey = sha256(tenant + "|" + clientId);
 const now = Date.now();
 if(tokenCache.token && tokenCache.key === cacheKey && tokenCache.exp > now + 60000) return tokenCache.token;
 const body = new URLSearchParams();
 body.set("client_id", clientId);
 body.set("client_secret", String(secret || ""));
 body.set("scope", "https://graph.microsoft.com/.default");
 body.set("grant_type", "client_credentials");
 const res = await fetchImpl("https://login.microsoftonline.com/" + encodeURIComponent(tenant) + "/oauth2/v2.0/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body
 });
 if(!res.ok){
  try { await res.text(); } catch(_) {}
  throw new Error("token http " + res.status);
 }
 const data = await res.json();
 const token = data && data.access_token ? String(data.access_token) : "";
 if(!token) throw new Error("token http " + res.status);
 const ttl = Number(data.expires_in) || 3600;
 tokenCache = { key: cacheKey, token: token, exp: now + ttl * 1000 };
 return token;
}

/* One mail function. Tests pass a stub fetch and never reach Microsoft.
   Returns true only when Graph answers 202. */
export async function sendFixMail(report, env, fetchImpl){
 const send = fetchImpl || globalThis.fetch;
 const missing = MAIL_KEYS.filter(k => !String(envGet(env, k) || "").trim());
 if(missing.length){
  console.log("directory-fix: email skipped, missing " + missing.join(", "));
  return false;
 }
 const from = line(envGet(env, "FIX_MAIL_FROM"));
 const to = line(envGet(env, "FIX_MAIL_TO"));
 if(!EMAIL_RE.test(from) || !EMAIL_RE.test(to)){
  console.log("directory-fix: email skipped, missing FIX_MAIL_FROM, FIX_MAIL_TO");
  return false;
 }
 const token = await graphToken(env, send);
 const churchName = report.church && report.church.name ? line(report.church.name) : "general";
 const subject = line("Church directory fix: " + churchName).slice(0, 200);
 const res = await send("https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(from) + "/sendMail", {
  method: "POST",
  headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
  body: JSON.stringify({
   message: {
    subject: subject,
    body: { contentType: "Text", content: mailBody(report) },
    toRecipients: [{ emailAddress: { address: to } }],
    replyTo: [{ emailAddress: { address: line(report.email) } }]
   },
   saveToSentItems: false
  })
 });
 if(res.status !== 202){
  try { await res.text(); } catch(_) {}
  throw new Error("sendMail http " + res.status);
 }
 return true;
}

function thanksLocation(pageUrl){
 const back = allowedPageUrl(pageUrl);
 if(!back) return "/api/directory/v1/fix/thanks";
 return "/api/directory/v1/fix/thanks?back=" + encodeURIComponent(back);
}

async function handlePost(req, context, env){
 const read = await readPayload(req);
 if(read.status) return errorResponse(req, context, read.wantsJson, read.status, read.error);
 const data = read.data || {};
 if(String(data.website || "").trim() || tooFast(data.t)) return jsonResponse(req, context, { ok: true });
 const fields = validate(data);
 if(fields.error) return errorResponse(req, context, read.wantsJson, 422, fields.error);
 const s = openStore(req, context);
 const day = easternDay();
 const wait = await rateTake(s, sha256(clientIp(req, context) + day), day);
 if(wait) return errorResponse(req, context, read.wantsJson, 429,
  "Too many reports from here. Please try again in a few minutes.",
  { "Retry-After": String(wait) });
 const church = fields.churchId ? await rosterChurch(s, fields.churchId) : null;
 const id = "dfix-" + day + "-" + randomBytes(4).toString("hex");
 const report = {
  id: id,
  at: new Date().toISOString(),
  churchId: fields.churchId,
  church: church,
  unknownId: !!(fields.churchId && !church),
  name: fields.name,
  email: fields.email,
  phone: fields.phone,
  message: fields.message,
  page: fields.page,
  pageUrl: fields.pageUrl,
  ua: clip(req.headers.get("user-agent"), 200),
  status: "new",
  emailed: false
 };
 try {
  await s.setJSON(id, report);
 } catch(_) {
  console.log("directory-fix: save failed");
  return errorResponse(req, context, read.wantsJson, 500, "We couldn't save that just now. Please try again.");
 }
 console.log("directory-fix: stored " + id);
 try {
  if(await sendFixMail(report, env)){
   report.emailed = true;
   try { await s.setJSON(id, report); }
   catch(_) { console.log("directory-fix: saved report but could not mark it emailed"); }
  }
 } catch(e) {
  console.log("directory-fix: email failed (" + (e && e.message ? e.message : "error") + ")");
 }
 if(read.wantsJson) return jsonResponse(req, context, { ok: true, id: id });
 const headers = htmlHeaders(req, context, { "Location": thanksLocation(fields.pageUrl) });
 return new Response(page("Thank you",
  "<h1>Thank you, we got it</h1><p><a class=\"back\" href=\"" + esc(thanksLocation(fields.pageUrl)) + "\">Continue</a></p>"),
  { status: 303, headers: headers });
}

async function handleGet(req, context){
 const url = new URL(req.url);
 const path = url.pathname.replace(/\/+$/, "") || "/";
 if(path.endsWith("/thanks")){
  return new Response(thanksPage(allowedPageUrl(url.searchParams.get("back") || "")), {
   status: 200, headers: htmlHeaders(req, context)
  });
 }
 const s = openStore(req, context);
 const idRaw = line(url.searchParams.get("id") || "").toLowerCase();
 const churchId = idRaw && SLUG_RE.test(idRaw) && idRaw.length <= 120 ? idRaw : "";
 const slug = line(url.searchParams.get("p") || "").toLowerCase();
 const pageSlug = slug && SLUG_RE.test(slug) && slug.length <= 120 ? slug : "";
 const pageUrl = pageSlug ? allowedPageUrl("https://thefourthministries.com/" + pageSlug) : "";
 const church = churchId ? await rosterChurch(s, churchId) : null;
 return new Response(formPage(church, churchId, pageUrl, pageSlug), {
  status: 200, headers: htmlHeaders(req, context)
 });
}

export default async (req, context, env) => {
 try {
  if(req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req, context) });
  if(req.method === "GET") return await handleGet(req, context);
  if(req.method === "POST") return await handlePost(req, context, env);
  return jsonResponse(req, context, { error: "That method isn't supported." }, 405, { "Allow": "GET, POST, OPTIONS" });
 } catch(e) {
  console.log("directory-fix failed:", e && e.message);
  return jsonResponse(req, context || {}, { error: "Something went wrong. Please try again." }, 500);
 }
};

export const config = { path: ["/api/directory/v1/fix", "/api/directory/v1/fix/thanks"] };
