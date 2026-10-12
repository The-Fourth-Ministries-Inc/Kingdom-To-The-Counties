/* Church research bot API (v1.25.0): per-bot keys, dry run, dedup, fill
   blanks only, never touch partnership, limits, idempotency, audit. */
import { test } from "node:test";
import assert from "node:assert/strict";

function mockStore(){
  const data = new Map();
  let seq = 0;
  return {
    _data: data,
    async get(key){ const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(key){ const r = data.get(key); return r ? { data: JSON.parse(r.value), etag: r.etag } : null; },
    async setJSON(key, value, opts){
      const cur = data.get(key);
      if(opts && opts.onlyIfNew && cur) return { modified:false };
      if(opts && opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified:false };
      data.set(key, { value: JSON.stringify(value), etag: "e" + (++seq) });
      return { modified:true };
    },
    async delete(key){ data.delete(key); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}
const store = mockStore();
store._data.set("churches", { value: JSON.stringify({ rev: 3, migr: ["2026-10-12-zeal-movement-partner"], removed: ["gone-keene"], list: [
  { id: "fbc-concord", name: "First Baptist Church", town: "Concord", county: "Merrimack", phone: "", website: "", partnerLevel: "partner", owner: "Zach" },
  { id: "grace", name: "Grace Fellowship", town: "Nashua", county: "Hillsborough", phone: "(603) 555-0199", website: "https://gracenashua.org" }
], log: [] }), etag: "e0" });

const data = await import("../netlify/functions/data.mjs");
data.__setStoreFactory(() => store);
const { default: api, botFor } = await import("../netlify/functions/churches-api.mjs");
const { dedupKey } = await import("../netlify/functions/church-dedup.mjs");

const KEY = "k".repeat(32);
const env = { CHURCH_API_KEY_SCOUT: KEY, CHURCH_API_KEY_SHORT: "tooshort", CHURCH_API_DAILY_CREATES: "3" };
const req = (path, { method = "GET", body, key = KEY, headers = {} } = {}) => api(new Request("https://k2c.example/api/churches/v1/" + path, {
  method, headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}), ...headers },
  body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
}), {}, env);
const rec = (o = {}) => ({ name: "New Hope Church", town: "Keene", county: "Cheshire", state: "NH",
  sourceUrls: ["https://newhopekeene.org/about"], researchedAt: "2026-10-11", ...o });
const roster = async () => data.normChurches(await store.get("churches"));

test("dedup keys normalize the usual spelling differences", () => {
  assert.equal(dedupKey("Zeal Movement Church", "Manchester"), "nh|manchester|zeal-movement");
  assert.equal(dedupKey("The Zeal Movement", "Manchester, NH"), "nh|manchester|zeal-movement");
  assert.equal(dedupKey("St. Mark's Episcopal Church", "Ashland"), dedupKey("Saint Marks Episcopal", "Town of Ashland"));
  assert.equal(dedupKey("Église Notre-Dame", "Mt. Vernon"), dedupKey("Eglise Notre Dame", "Mount Vernon"));
  assert.notEqual(dedupKey("Grace Church", "Concord"), dedupKey("Grace Church", "Nashua"));
});

test("no key, an unknown key, or a key under 24 characters is a 401", async () => {
  assert.equal((await req("keys", { key: "" })).status, 401);
  assert.equal((await req("keys", { key: "nope".repeat(8) })).status, 401);
  assert.equal((await req("keys", { key: "tooshort" })).status, 401);
  assert.equal(botFor(new Request("https://x", { headers: { Authorization: "Bearer " + KEY } }), env), "scout");
});

test("a dry run reports what would happen and writes nothing", async () => {
  const before = JSON.stringify(await store.get("churches"));
  const r = await req("import", { method: "POST", body: { dryRun: true, records: [rec()] } });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.dryRun, true);
  assert.equal(b.results[0].status, "created");
  assert.equal(JSON.stringify(await store.get("churches")), before);
});

test("create_only adds new churches unverified, with sources, and reports existing ones", async () => {
  const r = await req("import", { method: "POST", body: { runId: "run-1", records: [
    rec({ ref: "a" }),
    { name: "first baptist", town: "Concord NH", county: "Merrimack", sourceUrls: ["https://x.org"], researchedAt: "2026-10-11", phone: "603-555-0000", ref: "b" },
    rec({ name: "New Hope", ref: "c" })
  ] } });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.results.map(x => x.status), ["created", "exists", "duplicate_in_batch"]);
  assert.equal(b.results[1].id, "fbc-concord");
  const c = await roster();
  const nh = c.list.find(x => x.id === b.results[0].id);
  assert.equal(nh.verified, false);
  assert.equal(nh.origin, "bot:scout");
  assert.equal(nh.addedBy, "🤖 Scout");
  assert.deepEqual(nh.src, ["https://newhopekeene.org/about"]);
  assert.equal(c.list.find(x => x.id === "fbc-concord").phone, "", "create_only never touches an existing row");
  assert.ok(c.log.some(e => e.ch === nh.id && e.by === "🤖 Scout" && e.type === "add"));
  assert.ok([...store._data.keys()].some(k => /^bak-ch-\d+-import$/.test(k)), "snapshot before a real import");
  const audit = await store.get([...store._data.keys()].find(k => k.startsWith("churches-audit-")));
  assert.ok(audit.entries.some(e => e.actor === "bot:scout" && e.act === "create" && e.runId === "run-1" && e.ref === "a"));
});

test("upsert fills blanks only and reports conflicts instead of overwriting", async () => {
  const r = await req("import", { method: "POST", body: { mode: "upsert", records: [
    { name: "First Baptist Church", town: "Concord", county: "Merrimack", phone: "603-555-0000", denomination: "Baptist",
      sourceUrls: ["https://fbc.org"], researchedAt: "2026-10-11" },
    { name: "Grace Fellowship", town: "Nashua", county: "Hillsborough", phone: "603-555-1111", sourceUrls: ["https://g.org"], researchedAt: "2026-10-11" }
  ] } });
  const b = await r.json();
  assert.equal(b.results[0].status, "updated");
  assert.deepEqual(b.results[0].fields.sort(), ["denomination", "phone"]);
  assert.equal(b.results[1].status, "conflict");
  assert.deepEqual(b.results[1].conflicts, ["phone"]);
  const c = await roster();
  const fbc = c.list.find(x => x.id === "fbc-concord");
  assert.equal(fbc.phone, "603-555-0000");
  assert.equal(fbc.partnerLevel, "partner", "partnership untouched");
  assert.equal(fbc.owner, "Zach");
  assert.equal(c.list.find(x => x.id === "grace").phone, "(603) 555-0199", "never overwritten");
});

test("bots can't set partnership or other leader fields, and bad records are invalid", async () => {
  const b = await (await req("import", { method: "POST", body: { records: [
    rec({ name: "Sneaky", partnerLevel: "covenant" }),
    rec({ name: "No Source", sourceUrls: [] }),
    rec({ name: "No Date", researchedAt: "last week" }),
    rec({ name: "Where", county: "Narnia" }),
    rec({ name: "Extra", favouriteHymn: "x" }),
    { town: "Keene" }
  ] } })).json();
  assert.ok(b.results.every(x => x.status === "invalid"), JSON.stringify(b.results));
  assert.match(b.results[0].reason, /partnerLevel/);
});

test("same phone or website in the same town is held as a possible duplicate", async () => {
  const b = await (await req("import", { method: "POST", body: { records: [
    rec({ name: "Grace Nashua", town: "Nashua", county: "Hillsborough", website: "http://www.gracenashua.org/visit" })
  ] } })).json();
  assert.equal(b.results[0].status, "possible_duplicate");
  assert.equal(b.results[0].id, "grace");
});

test("a church a leader removed is never re-added", async () => {
  const b = await (await req("import", { method: "POST", body: { records: [rec({ name: "Gone Church", town: "Keene" })] } })).json();
  assert.equal(b.results[0].status, "removed");
});

test("the daily create limit is enforced per bot", async () => {
  const many = ["Alpha", "Beta", "Gamma", "Delta"].map(n => rec({ name: n + " Chapel" }));
  const b = await (await req("import", { method: "POST", body: { records: many } })).json();
  assert.deepEqual(b.results.map(x => x.status), ["created", "created", "limit", "limit"], "1 created earlier + 2 = the cap of 3");
  assert.equal(b.createsLeftToday, 0);
});

test("Idempotency-Key replays the first answer and refuses a different body", async () => {
  const body = { mode: "upsert", records: [rec({ name: "Alpha Chapel", phone: "603-555-2222" })] };
  const first = await (await req("import", { method: "POST", body, headers: { "Idempotency-Key": "batch-77" } })).json();
  assert.equal(first.results[0].status, "updated");
  const again = await (await req("import", { method: "POST", body, headers: { "Idempotency-Key": "batch-77" } })).json();
  assert.equal(again.replayed, true);
  assert.equal(again.results[0].status, "updated");
  const other = await req("import", { method: "POST", body: { records: [rec({ name: "Other" })] }, headers: { "Idempotency-Key": "batch-77" } });
  assert.equal(other.status, 409);
});

test("size, shape, method and kill-switch limits", async () => {
  assert.equal((await req("import", { method: "POST", body: { records: Array.from({ length: 101 }, () => rec()) } })).status, 413);
  assert.equal((await req("import", { method: "POST", body: "{not json" })).status, 422);
  assert.equal((await req("import", { method: "POST", body: { records: [] } })).status, 422);
  assert.equal((await req("import", { method: "POST", body: { mode: "replace", records: [rec()] } })).status, 422);
  assert.equal((await req("import")).status, 405);
  const off = await api(new Request("https://k2c.example/api/churches/v1/import", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: JSON.stringify({ records: [rec()] }) }), {}, { ...env, CHURCH_API_WRITES: "off" });
  assert.equal(off.status, 503);
  const dry = await api(new Request("https://k2c.example/api/churches/v1/import", { method: "POST", headers: { Authorization: "Bearer " + KEY }, body: JSON.stringify({ records: [rec()] }) }), {}, { ...env, CHURCH_API_WRITES: "dryrun" });
  assert.equal(dry.status, 403);
});

test("keys and lookup let a bot check before it imports", async () => {
  const k = await (await req("keys?state=NH")).json();
  assert.ok(k.churches.some(x => x.id === "fbc-concord" && x.key === "nh|concord|first-baptist"));
  const l = await (await req("lookup?name=" + encodeURIComponent("First Baptist") + "&town=Concord")).json();
  assert.equal(l.match.id, "fbc-concord");
  assert.ok(l.match.missing.includes("email"));
  assert.equal((await req("lookup?name=x")).status, 422);
});

test("the rate limit answers 429 with Retry-After", async () => {
  let last;
  for(let i = 0; i < 31; i++) last = await req("keys");
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) >= 1);
});
