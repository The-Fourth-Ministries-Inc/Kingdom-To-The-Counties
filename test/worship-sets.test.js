/* Worship sets on the Now tab (v1.23.0): Planning Center sync and leader
   edits. Planning Center is faked with the shape of a real "K2C Day" plan —
   songs between TTT / Gospel Presentation items, leads in the Description,
   one of them on three lines. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function mockStore(){
  const data = new Map(); let seq = 0;
  return {
    _data: data,
    async get(k){ const r = data.get(k); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(k){ const r = data.get(k); return r ? { data: JSON.parse(r.value), etag: r.etag } : null; },
    async setJSON(k, v, o){ const c = data.get(k);
      if(o && o.onlyIfNew && c) return { modified:false };
      if(o && o.onlyIfMatch && (!c || c.etag !== o.onlyIfMatch)) return { modified:false };
      data.set(k, { value: JSON.stringify(v), etag: "e" + (++seq) }); return { modified:true }; },
    async set(k, v){ data.set(k, { value: JSON.stringify(v), etag: "e" + (++seq) }); return { modified:true }; },
    async delete(k){ data.delete(k); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const store = mockStore();
process.env.LEADER_PIN = "999999";
const mod = await import("../netlify/functions/data.mjs");
const { default: handler, __setStoreFactory, __setPcoFetch, pcoSetsFromItems, pcoScheduledSync, SET_NAMES, currentEvent } = mod;
__setStoreFactory(() => store);

/* ---- fake Planning Center ---- */
const song = (seq, title, key, description) => ({ attributes: { sequence: seq, item_type: "song", title, key_name: key, description } });
const item = (seq, title, type = "item") => ({ attributes: { sequence: seq, item_type: type, title, description: null } });
function planItems(){
  return [
    item(1, "2:00 PM - MAIN PROGRAM START", "header"),
    item(2, "Welcome Opening Prayer"),
    song(3, "The Joy", "C", "Angel"),
    song(4, "Song Of Freedom", "Bb", "Zach"),
    song(5, "I Thank God", "A", "Mike"),
    item(6, "TTT 1"),
    song(7, "Revival's In The Air", "A", "Annie"),
    song(8, "Throne Room Song", "A", "Karielle - V1\nAngel - lead melody line (male vocal line)\nDuet from there"),
    song(9, "Revelation Song", "E", "Mike"),
    item(10, "Gospel Presentation 1"),
    item(11, "Alter Call 1"),
    song(12, "Come Boldly To The Throne", "C", "Karielle"),
    song(13, "Nothing Else", "A", "Angel"),
    item(14, "TTL 2"),
    song(15, "Jesus Be The Name", "D", "Annie"),
    song(16, "What A Beautiful Name", "D", "Karielle"),
    item(17, "Gospel Presentation 2"),
    song(18, "I Speak Jesus", "E", "Karielle")
  ].reverse(); // the API order isn't trusted; sequence is
}
let calls = [], planDate = null, itemsFor = planItems;
function fakePco(url, opts){
  calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
  const ok = body => Promise.resolve({ ok: true, status: 200, json: async () => body });
  if(/\/service_types\?/.test(url)) return ok({ data: [{ id: "11", attributes: { name: "Sunday" } }, { id: "42", attributes: { name: "K2C Day" } }] });
  if(/\/service_types\/42\/plans\?/.test(url)) return ok({ data: [
    { id: "900", attributes: { title: "Derryfield Park", sort_date: "2026-09-26T18:00:00Z" } },
    { id: "901", attributes: { title: "Star Speedway", sort_date: (planDate || currentEvent().date) + "T18:00:00Z" } }
  ]});
  if(/\/plans\/901\/items/.test(url)) return ok({ data: itemsFor() });
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
}
__setPcoFetch(fakePco);

const call = (action, payload = {}, auth = { pin: "999999" }) => handler(new Request("https://x/api", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, ...auth })
}), {});
const get = async () => (await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {})).json();

test("songs group into sets by the non-song items between them", () => {
  const { sets, warnings } = pcoSetsFromItems(planItems());
  assert.deepEqual(warnings, []);
  assert.deepEqual(sets["Worship Set 1"].map(s => s.title), ["The Joy", "Song Of Freedom", "I Thank God"]);
  assert.deepEqual(sets["Worship Set 1"][0], { title: "The Joy", key: "C", lead: "Angel" });
  assert.equal(sets["Worship Set 2"][1].lead, "Karielle - V1\nAngel - lead melody line (male vocal line)\nDuet from there");
  assert.deepEqual(sets["Worship Set 3"].map(s => s.title), ["Come Boldly To The Throne", "Nothing Else"]);
  assert.deepEqual(sets["Outro + Blessing"].map(s => s.title), ["I Speak Jesus"]);
});

test("a plan with fewer or more song groups says so instead of guessing", () => {
  const short = pcoSetsFromItems(planItems().filter(i => i.attributes.sequence < 14));
  assert.equal(short.sets["Worship Set 4"].length, 0);
  assert.match(short.warnings[0], /3 song groups for 5 sets/);
  const long = pcoSetsFromItems([...planItems(), item(19, "Benediction"), song(20, "Encore", "G", "All")]);
  assert.match(long.warnings[0], /Extra songs .* Encore/);
});

test("set names match the app's built-in list", () => {
  const js = readFileSync(join(root, "js/app-core.js"), "utf8");
  const m = js.match(/var SETLISTS_DEFAULT=(\{[\s\S]*?\n\});/);
  const ctx = {}; vm.createContext(ctx); vm.runInContext("x=" + m[1], ctx);
  assert.deepEqual(Object.keys(ctx.x), SET_NAMES);
});

test("sync says 'not connected' until the Netlify env vars exist", async () => {
  delete process.env.PCO_APP_ID; delete process.env.PCO_SECRET;
  const r = await call("pcoSync", { by: "MN" });
  assert.equal(r.status, 501);
  assert.equal(calls.length, 0, "no request leaves without a token");
});

test("a leader syncs the event's plan into the Now tab", async () => {
  process.env.PCO_APP_ID = "app"; process.env.PCO_SECRET = "secret";
  const r = await call("pcoSync", { by: "MN" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.plan, "Star Speedway");
  assert.equal(body.songs, 11);
  assert.match(calls[0].auth, /^Basic /);
  const s = await get();
  assert.equal(s.sets.source, "pco");
  assert.equal(s.sets.pco.title, "Star Speedway");
  assert.equal(s.sets.sets["Worship Set 2"][2].key, "E", "Revelation Song in E, as in Planning Center");
});

test("only leaders sync or edit; everyone behind the Day PIN can read", async () => {
  assert.equal((await call("pcoSync", {}, { dayPin: "nope" })).status, 403);
  assert.equal((await call("setSets", { sets: {} }, {})).status, 403);
  const s = await (await handler(new Request("https://x/api"), {})).json();
  assert.equal(s.sets, undefined, "a locked phone gets no event data");
});

test("a hand edit sticks, and the hourly sync leaves it alone", async () => {
  const edited = { "Worship Set 1": [{ title: "The Joy", key: "C", lead: "Karielle" }] };
  assert.equal((await call("setSets", { sets: edited, by: "MN" })).status, 200);
  let s = await get();
  assert.equal(s.sets.source, "manual");
  assert.equal(s.sets.sets["Worship Set 1"][0].lead, "Karielle");
  assert.equal(s.sets.pco.title, "Star Speedway", "keeps where it last synced from");

  const r = await pcoScheduledSync();
  assert.equal(r.skipped, true);
  s = await get();
  assert.equal(s.sets.sets["Worship Set 1"][0].lead, "Karielle", "hourly run did not overwrite the edit");

  // A leader's own Sync goes back to Planning Center on purpose.
  await call("pcoSync", { by: "MN" });
  s = await get();
  assert.equal(s.sets.source, "pco");
  assert.equal(s.sets.sets["Worship Set 1"][0].lead, "Angel");
});

test("the hourly sync refreshes an event that came from Planning Center", async () => {
  itemsFor = () => planItems().map(i => (i.attributes.title === "The Joy" ? song(3, "The Joy", "D", "Zach") : i));
  const r = await pcoScheduledSync();
  assert.equal(r.ok, true);
  const s = await get();
  assert.deepEqual(s.sets.sets["Worship Set 1"][0], { title: "The Joy", key: "D", lead: "Zach" });
  itemsFor = planItems;
});

test("no plan on the event date: matched by location, else a clear 404", async () => {
  planDate = "2026-12-31";                       // no plan falls on the event Saturday
  await call("setCounty", { county: "rockingham" });
  let r = await call("pcoSync", { by: "MN" });
  assert.equal(r.status, 200, "Star Speedway plan matches Rockingham's location");
  assert.equal((await r.json()).plan, "Star Speedway");
  await call("setCounty", { county: "sullivan" }); // Monadnock Park — no plan by date or name
  r = await call("pcoSync", { by: "MN" });
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /no K2C Day plan for Saturday, June 13th/);
  await call("setCounty", { auto: true });
  planDate = null;
});

test("Planning Center being down is a 502, and nothing is overwritten", async () => {
  const before = (await get()).sets;
  __setPcoFetch(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }));
  const r = await call("pcoSync", { by: "MN" });
  assert.equal(r.status, 502);
  assert.deepEqual((await get()).sets, before);
  __setPcoFetch(fakePco);
});

test("sets are whitelisted and capped", async () => {
  await call("setSets", { by: "MN", sets: {
    "Worship Set 1": [{ title: "x".repeat(200), key: "Bb", lead: "y".repeat(500), evil: 1 }, { title: "", key: "C" }],
    "Not A Set": [{ title: "Sneaky" }]
  }});
  const s = (await get()).sets;
  assert.equal(s.sets["Worship Set 1"].length, 1, "untitled rows dropped");
  assert.equal(s.sets["Worship Set 1"][0].title.length, 80);
  assert.equal(s.sets["Worship Set 1"][0].lead.length, 300);
  assert.ok(!("evil" in s.sets["Worship Set 1"][0]));
  assert.ok(!("Not A Set" in s.sets));
});

/* ---- the app side ---- */
test("the Now tab shows the event's sets, multi-line leads, and falls back to the built-in list", () => {
  const app = readFileSync(join(root, "js/app-core.js"), "utf8");
  const ws = readFileSync(join(root, "js/worship.js"), "utf8");
  const head = app.slice(0, app.indexOf("const SEGMENTS"));
  const ctx = { esc: s => String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c])) };
  vm.createContext(ctx);
  vm.runInContext(ws + "\n" + head, ctx);
  ctx.STATE = { sets: null };
  assert.equal(ctx.setlistFor("Worship Set 1")[0].title, "The Joy", "built-in list until synced");
  ctx.STATE = { sets: { source: "pco", sets: { "Worship Set 2": [{ title: "Throne Room Song", key: "A", lead: "Karielle - V1\nAngel - melody" }] } } };
  assert.equal(ctx.setlistFor("Worship Set 1"), null, "an event's own sets replace the built-in list entirely");
  const html = ctx.setlistRowsHtml(ctx.setlistFor("Worship Set 2"));
  assert.match(html, /Karielle - V1<br>Angel - melody/);
  assert.match(ctx.wsSourceLine(), /Songs from Planning Center/);
});

test("worship.js keeps the house style and loads before app-core", () => {
  const ws = readFileSync(join(root, "js/worship.js"), "utf8");
  const code = ws.replace(/\/\*[\s\S]*?\*\//g, "").replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "\"\"");
  assert.doesNotMatch(code, /=>|`|\blet\s|\bconst\s|\.\.\./);
  const html = readFileSync(join(root, "index.html"), "utf8");
  const a = html.indexOf('<script src="js/worship.js">'), b = html.indexOf('<script src="js/app-core.js">');
  assert.ok(a > 0 && a < b);
  assert.match(html, /<div id="setsBar"><\/div>/);
  assert.match(readFileSync(join(root, "sw.js"), "utf8"), /"js\/worship\.js"/);
  const sched = readFileSync(join(root, "netlify/functions/pco-sync-scheduled.mjs"), "utf8");
  assert.match(sched, /schedule: "@hourly"/);
});
