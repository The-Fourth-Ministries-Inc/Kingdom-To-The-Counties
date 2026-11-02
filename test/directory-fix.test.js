/* Directory fix reports (v1.28.0). No network and no email.
   One store factory is shared, so the cases in this file run one at a time. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function mockStore(){
  const data = new Map();
  let seq = 0;
  return {
    _data: data,
    async get(key){ const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async setJSON(key, value, opts){
      const cur = data.get(key);
      if(opts && opts.onlyIfNew && cur) return { modified: false };
      data.set(key, { value: JSON.stringify(value), etag: "e" + (++seq) });
      return { modified: true };
    },
    async delete(key){ data.delete(key); }
  };
}

const data = await import("../netlify/functions/data.mjs");
const fix = await import("../netlify/functions/directory-fix.mjs");
const { default: handler, easternDay, __resetFixMail } = fix;

const URL = "https://ambassadorcompanion.netlify.app/api/directory/v1/fix";
const SECRET = "super-secret-value";
const IP = "203.0.113.50";

function useStore(){
  const store = mockStore();
  store._data.set("churches", { value: JSON.stringify({ rev: 1, list: [
    { id: "fbc-concord", name: "First Baptist Church", town: "Concord", state: "NH" },
    { id: "grace", name: "Grace\r\nBcc: evil@example.com", town: "Nashua", state: "NH" }
  ] }), etag: "e0" });
  data.__setStoreFactory(() => store);
  __resetFixMail();
  return store;
}
function reports(store){
  return [...store._data.entries()]
    .filter(([k]) => k.startsWith("dfix-") && !k.startsWith("dfix-rate-") && !k.startsWith("dfix-day-"))
    .map(([, r]) => JSON.parse(r.value));
}
const valid = (o = {}) => Object.assign({
  name: "Jane Doe", email: "jane@example.com", phone: "(603) 555-0100",
  message: "The service time is wrong.", churchId: "fbc-concord",
  churchName: "Totally Different", page: "find-a-church-nh",
  pageUrl: "https://thefourthministries.com/find-a-church-nh"
}, o);

function call(method, { body, headers, ip, context, env, path } = {}){
  const h = Object.assign({}, headers || {});
  return handler(new Request(path || URL, {
    method,
    headers: h,
    body: body == null ? undefined : body
  }), Object.assign({ ip: ip || IP }, context || {}), env || {});
}
function postJson(obj, opt = {}){
  return call("POST", Object.assign({
    body: JSON.stringify(obj),
    headers: { "Content-Type": "application/json", Origin: "https://www.thefourthministries.com" }
  }, opt));
}

describe("directory fix reports", { concurrency: false }, () => {

test("CORS preflight allows the directory, refuses other origins, and sets Vary", async () => {
  useStore();
  const ok = await call("OPTIONS", { headers: { Origin: "https://thefourthministries.com" } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://thefourthministries.com");
  assert.match(ok.headers.get("access-control-allow-methods") || "", /POST/);
  assert.match(ok.headers.get("vary") || "", /Origin/);
  const www = await call("OPTIONS", { headers: { Origin: "https://www.thefourthministries.com" } });
  assert.equal(www.headers.get("access-control-allow-origin"), "https://www.thefourthministries.com");
  const bad = await call("OPTIONS", { headers: { Origin: "https://evil.example" } });
  assert.equal(bad.status, 204);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
  assert.match(bad.headers.get("vary") || "", /Origin/);
  const local = await call("OPTIONS", { headers: { Origin: "http://localhost:8888" } });
  assert.equal(local.headers.get("access-control-allow-origin"), null);
  const preview = await call("OPTIONS", {
    headers: { Origin: "http://localhost:9999" },
    context: { deploy: { context: "deploy-preview" } }
  });
  assert.equal(preview.headers.get("access-control-allow-origin"), "http://localhost:9999");
});

test("a valid JSON post is stored and answers ok", async () => {
  const store = useStore();
  const res = await postJson(valid({ t: Date.now() - 10000 }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://www.thefourthministries.com");
  const body = await res.json();
  assert.equal(body.ok, true);
  const saved = reports(store);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, body.id);
  assert.equal(saved[0].name, "Jane Doe");
  assert.equal(saved[0].email, "jane@example.com");
  assert.equal(saved[0].phone, "(603) 555-0100");
  assert.equal(saved[0].message, "The service time is wrong.");
  assert.equal(saved[0].status, "new");
  assert.equal(saved[0].church.name, "First Baptist Church");
  assert.equal(saved[0].church.town, "Concord");
  assert.equal(saved[0].church.state, "NH");
  assert.equal(saved[0].unknownId, false);
  assert.equal(saved[0].pageUrl, "https://thefourthministries.com/find-a-church-nh");
});

test("a valid form post redirects to the thank-you page", async () => {
  const store = useStore();
  const res = await call("POST", {
    body: new URLSearchParams(valid()).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  assert.equal(res.status, 303);
  const loc = res.headers.get("location") || "";
  assert.match(loc, /^\/api\/directory\/v1\/fix\/thanks\?back=/);
  assert.doesNotMatch(loc, /\r|\n/);
  assert.equal(reports(store).length, 1);
  const thanks = await call("GET", { path: "https://ambassadorcompanion.netlify.app" + loc });
  const html = await thanks.text();
  assert.equal(thanks.status, 200);
  assert.match(html, /Thank you, we got it/);
  assert.match(html, /https:\/\/thefourthministries\.com\/find-a-church-nh/);
  assert.doesNotMatch(html, /<script/i);
});

test("a form post with a foreign page address still lands on our thank-you page", async () => {
  useStore();
  const res = await call("POST", {
    body: new URLSearchParams(valid({ pageUrl: "https://evil.example/phish" })).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  assert.equal(res.headers.get("location"), "/api/directory/v1/fix/thanks");
});

test("a filled honeypot or a too-fast submit is a silent 200 with nothing stored", async () => {
  const store = useStore();
  for(let i = 0; i < 6; i++){
    const honey = await postJson(valid({ website: "http://spam.test", t: Date.now() - 10000, message: "trap " + i }));
    assert.equal(honey.status, 200);
    assert.deepEqual(await honey.json(), { ok: true });
  }
  const fast = await postJson(valid({ t: Date.now() }));
  assert.equal(fast.status, 200);
  assert.deepEqual(await fast.json(), { ok: true });
  const ahead = await postJson(valid({ t: Date.now() + 2000 }));
  assert.equal(ahead.status, 200);
  const aheadBody = await ahead.json();
  assert.equal(aheadBody.ok, true);
  assert.ok(aheadBody.id, "a clock a couple of seconds ahead is still a real report");
  const real = await postJson(valid({ t: Date.now() - 10000, message: "real after traps" }));
  assert.equal(real.status, 200, "honeypot hits do not use up the visitor limit");
  assert.equal(reports(store).length, 2);
});

test("each validation error is a 422 with a sentence a visitor can read", async () => {
  useStore();
  const cases = [
    [{ name: "" }, /name/i],
    [{ name: "A".repeat(101) }, /100/],
    [{ email: "not-an-email" }, /email/i],
    [{ email: "" }, /email/i],
    [{ phone: "" }, /phone/i],
    [{ phone: "call me" }, /phone/i],
    [{ message: "" }, /incorrect/i],
    [{ message: "x".repeat(2001) }, /2,000/],
    [{ churchId: "No Spaces" }, /church/i]
  ];
  for(const [over, re] of cases){
    const res = await postJson(valid(Object.assign({ t: Date.now() - 5000 }, over)));
    assert.equal(res.status, 422, JSON.stringify(over));
    const body = await res.json();
    assert.match(body.error, re);
    assert.doesNotMatch(body.error, /422|invalid|required|undefined/);
  }
  const junk = await call("POST", { body: "{not json", headers: { "Content-Type": "application/json" } });
  assert.equal(junk.status, 422);
  assert.match((await junk.json()).error, /try again/i);
});

test("a body over 16 KB is refused", async () => {
  useStore();
  const res = await postJson(valid({ message: "x".repeat(17000), t: Date.now() - 5000 }));
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /too large/i);
});

test("the sixth report from one address in ten minutes is limited; another address is not", async () => {
  const store = useStore();
  let last;
  for(let i = 0; i < 5; i++){
    last = await postJson(valid({ t: Date.now() - 5000, message: "Report " + i }));
    assert.equal(last.status, 200);
  }
  const blocked = await postJson(valid({ t: Date.now() - 5000, message: "one more" }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  assert.match((await blocked.json()).error, /Too many reports/);
  const other = await postJson(valid({ t: Date.now() - 5000 }), { ip: "198.51.100.8" });
  assert.equal(other.status, 200);
  assert.equal(reports(store).filter(r => r.message === "one more").length, 0);
});

test("twenty reports a day from one address, and two hundred for the site, are the caps", async () => {
  const store = useStore();
  const day = easternDay();
  const ip = "198.51.100.20";
  const hash = createHash("sha256").update(ip + day).digest("hex");
  store._data.set("dfix-rate-" + hash, { value: JSON.stringify({ t: [], n: 20 }), etag: "e" });
  const over = await postJson(valid({ t: Date.now() - 8000, message: "day over" }), { ip });
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) >= 60);
  const other = await postJson(valid({ t: Date.now() - 8000, message: "other day" }), { ip: "198.51.100.21" });
  assert.equal(other.status, 200);
  store._data.set("dfix-day-" + day, { value: JSON.stringify({ n: 200 }), etag: "cap" });
  const site = await postJson(valid({ t: Date.now() - 8000, message: "site over" }), { ip: "198.51.100.99" });
  assert.equal(site.status, 429);
  assert.equal(reports(store).some(r => r.message === "day over" || r.message === "site over"), false);
});

test("an unknown church id is kept and the client's church name is not the roster name", async () => {
  const store = useStore();
  const unknown = await postJson(valid({ churchId: "not-a-real-church", churchName: "Visitor Chapel", t: Date.now() - 5000 }));
  assert.equal(unknown.status, 200);
  const u = reports(store).find(r => r.churchId === "not-a-real-church");
  assert.equal(u.unknownId, true);
  assert.equal(u.church, null);
  assert.equal(JSON.stringify(u).includes("Visitor Chapel"), false);
  const known = await postJson(valid({ churchName: "Totally Different", t: Date.now() - 5000 }), { ip: "198.51.100.21" });
  assert.equal(known.status, 200);
  const k = reports(store).find(r => r.churchId === "fbc-concord");
  assert.equal(k.church.name, "First Baptist Church");
  assert.equal(JSON.stringify(k).includes("Totally Different"), false);
});

test("missing mail settings still save the report and do not log the secret", async () => {
  const store = useStore();
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); };
  const prev = globalThis.fetch;
  let called = 0;
  globalThis.fetch = () => { called++; return Promise.reject(new Error("fetch should not run")); };
  try {
    const res = await postJson(valid({ t: Date.now() - 5000 }), {
      env: { MS_CLIENT_SECRET: SECRET }
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  } finally {
    console.log = orig;
    globalThis.fetch = prev;
  }
  assert.equal(called, 0);
  const saved = reports(store);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].emailed, false);
  const text = logs.join("\n");
  assert.match(text, /email skipped/);
  assert.equal(text.includes(SECRET), false);
});

test("a Graph 202 marks the report emailed, with To, Reply-To and a single-line subject", async () => {
  const store = useStore();
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    calls.push({ url: String(url), init });
    if(String(url).includes("oauth2")){
      return Promise.resolve(new Response(JSON.stringify({ access_token: "tok-test", expires_in: 3600 }), { status: 200 }));
    }
    return Promise.resolve(new Response("", { status: 202 }));
  };
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(" ")); };
  const env = {
    MS_TENANT_ID: "tenant-id",
    MS_CLIENT_ID: "client-id",
    MS_CLIENT_SECRET: SECRET,
    FIX_MAIL_FROM: "noreply@thefourthministries.com",
    FIX_MAIL_TO: "info@thefourthministries.com"
  };
  try {
    const res = await postJson(valid({ churchId: "grace", t: Date.now() - 5000 }), { env });
    assert.equal(res.status, 200);
    const body = await res.json();
    const saved = reports(store).find(r => r.id === body.id);
    assert.equal(saved.emailed, true);
  } finally {
    console.log = orig;
    globalThis.fetch = prev;
  }
  assert.equal(logs.join("\n").includes(SECRET), false);
  const token = calls.find(c => c.url.includes("/oauth2/v2.0/token"));
  const sent = calls.find(c => c.url.includes("/sendMail"));
  assert.ok(token);
  assert.match(token.url, /^https:\/\/login\.microsoftonline\.com\/tenant-id\/oauth2\/v2\.0\/token$/);
  assert.match(String(token.init.body), /grant_type=client_credentials/);
  assert.match(String(token.init.body), /scope=https%3A%2F%2Fgraph\.microsoft\.com%2F\.default/);
  const payload = JSON.parse(sent.init.body);
  assert.equal(payload.saveToSentItems, false);
  assert.equal(payload.message.body.contentType, "Text");
  assert.equal(payload.message.toRecipients[0].emailAddress.address, "info@thefourthministries.com");
  assert.equal(payload.message.replyTo[0].emailAddress.address, "jane@example.com");
  assert.equal(payload.message.subject.includes("\n"), false);
  assert.equal(payload.message.subject.includes("\r"), false);
  assert.match(payload.message.subject, /^Church directory fix: Grace Bcc: evil@example.com$/);
  assert.match(sent.init.headers.Authorization, /^Bearer tok-test$/);
  assert.match(payload.message.body.content, /Jane Doe/);
  assert.match(payload.message.body.content, /The service time is wrong/);
  assert.doesNotMatch(payload.message.body.content, /<html/i);
});

test("a Graph 500 still answers 200 and leaves the report unsent", async () => {
  const store = useStore();
  const prev = globalThis.fetch;
  globalThis.fetch = (url) => {
    if(String(url).includes("oauth2")){
      return Promise.resolve(new Response(JSON.stringify({ access_token: "tok-test", expires_in: 3600 }), { status: 200 }));
    }
    return Promise.resolve(new Response("nope", { status: 500 }));
  };
  const env = {
    MS_TENANT_ID: "tenant-id", MS_CLIENT_ID: "client-id", MS_CLIENT_SECRET: SECRET,
    FIX_MAIL_FROM: "noreply@thefourthministries.com", FIX_MAIL_TO: "info@thefourthministries.com"
  };
  try {
    const res = await postJson(valid({ t: Date.now() - 5000 }), { env, ip: "198.51.100.40" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  } finally {
    globalThis.fetch = prev;
  }
  assert.equal(reports(store)[0].emailed, false);
});

test("the no-JS form has the fields and the honeypot, escapes a hostile page, and sets CSP", async () => {
  useStore();
  const ok = await call("GET", { path: URL + "?id=fbc-concord&p=find-a-church-nh" });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-security-policy") || "", /form-action 'self'/);
  assert.match(ok.headers.get("content-security-policy") || "", /default-src 'none'/);
  assert.match(ok.headers.get("x-robots-tag") || "", /noindex/);
  assert.match(ok.headers.get("cache-control") || "", /no-store/);
  const html = await ok.text();
  assert.match(html, /<h1>Report a fix<\/h1>/);
  assert.match(html, /For: First Baptist Church/);
  assert.match(html, /name="website"/);
  assert.match(html, /name="name"/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="message"/);
  assert.match(html, /method="post"/);
  assert.match(html, /action="\/api\/directory\/v1\/fix"/);
  assert.match(html, /name="churchId" value="fbc-concord"/);
  assert.match(html, /https:\/\/thefourthministries\.com\/find-a-church-nh/);
  assert.match(html, /width=device-width/);
  assert.doesNotMatch(html, /<script/i);
  const hostile = "\"><script>alert(1)</script>";
  const bad = await call("GET", { path: URL + "?id=" + encodeURIComponent(hostile) + "&p=" + encodeURIComponent(hostile) });
  const raw = await bad.text();
  assert.doesNotMatch(raw, /<script/i);
  assert.equal(raw.includes(hostile), false);
  assert.equal(raw.includes("alert(1)"), false);
  assert.match(raw, /church directory/);
});

test("a church name with markup is escaped on the form", async () => {
  const store = useStore();
  const rawChurches = JSON.parse(store._data.get("churches").value);
  rawChurches.list.push({ id: "marked", name: "First <script> Baptist", town: "Keene", state: "NH" });
  store._data.set("churches", { value: JSON.stringify(rawChurches), etag: "e9" });
  const res = await call("GET", { path: URL + "?id=marked" });
  const html = await res.text();
  assert.match(html, /For: First &lt;script&gt; Baptist/);
  assert.doesNotMatch(html, /<script/i);
});

test("an empty roster is not filled in from the starter list", async () => {
  const store = useStore();
  store._data.delete("churches");
  const res = await postJson(valid({ churchId: "abundant-harvest", churchName: "Abundant Harvest Family Church", t: Date.now() - 5000 }), { ip: "198.51.100.70" });
  assert.equal(res.status, 200);
  const saved = reports(store)[0];
  assert.equal(saved.churchId, "abundant-harvest");
  assert.equal(saved.unknownId, true);
  assert.equal(saved.church, null);
  const page = await call("GET", { path: URL + "?id=abundant-harvest" });
  const html = await page.text();
  assert.equal(html.includes("Abundant Harvest"), false);
  assert.match(html, /church directory/);
});

test("raw IP addresses never appear in a stored value", async () => {
  const store = useStore();
  const ip = "203.0.113.77";
  const res = await postJson(valid({ t: Date.now() - 5000 }), {
    ip,
    headers: {
      "Content-Type": "application/json",
      "x-nf-client-connection-ip": ip,
      "User-Agent": "directory-test"
    }
  });
  assert.equal(res.status, 200);
  const dumped = JSON.stringify([...store._data.entries()]);
  assert.equal(dumped.includes(ip), false);
  assert.match(dumped, /dfix-rate-/);
  assert.match(dumped, /Jane Doe/);
});

});
