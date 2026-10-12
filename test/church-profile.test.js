/* Church profile fields (v1.27.0, Zach's list): the schema, the bot import
   API and the app's add/edit actions all carry them; dedup stays on the
   normalized name + town + state. */
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
process.env.LEADER_PIN = "999999";
store._data.set("churches", { value: JSON.stringify({ rev: 3, migr: ["2026-10-12-zeal-movement-partner", "2026-10-12-zeal-movement-correction"], removed: [], list: [
  { id: "grace-concord", name: "Grace Church", town: "Concord", county: "Merrimack", state: "NH", partnerLevel: "covenant" },
  { id: "hope-keene", name: "Hope Chapel", town: "Keene", county: "Cheshire", state: "NH", denomination: "Baptist" }
], log: [] }), etag: "e0" });

const data = await import("../netlify/functions/data.mjs");
data.__setStoreFactory(() => store);
const { default: handler, normChurch, stateCode, sizeBandOf, churchTypeOf, currentEvent, pinForDate } = data;
const asAmbassador = { dayPin: pinForDate(currentEvent().date) };
const { default: api } = await import("../netlify/functions/churches-api.mjs");

const KEY = "p".repeat(32);
const env = { CHURCH_API_KEY_SCOUT: KEY };
const apiReq = (path, body) => api(new Request("https://k2c.example/api/churches/v1/" + path, {
  method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
  body: body ? JSON.stringify(body) : undefined
}), {}, env);
const imp = async (records, extra = {}) => (await apiReq("import", { records, ...extra })).json();
const call = (action, payload = {}, auth = { pin: "999999" }) => handler(new Request("https://x/api", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, ...auth })
}), {});
const roster = async () => data.normChurches(await store.get("churches"));
const byId = async id => (await roster()).list.find(x => x.id === id);
const stamp = { by: "MN", t: "9:00 AM", d: "2026-10-12" };

/* Every field on Zach's list, under the name he used. Each record gets its
   own phone and website so the same-phone/same-site check stays out of the way. */
let n = 0;
const zachRecord = (o = {}) => { n++; return {
  name: "Riverside House Church", town: "Brattleboro", state: "VT", county: "Out of state",
  address: "12 Main St, Brattleboro, VT 05301", pastor: "Pastor Ruth Allen", phone: "(802) 555-0142",
  email: "hello@riversidehouse.org", socialLinks: ["https://facebook.com/riversidehouse", "instagram.com/riversidehouse"],
  website: "riversidehouse.org", description: "A house church of about 30 that meets in homes on Sunday evenings.",
  denomination: "Non-denominational", accreditations: ["ECFA member"], network: "House Church Network of New England",
  size: 30, type: "house church", sourceUrls: ["https://riversidehouse.org/about"], researchedAt: "2026-10-12",
  ...(n > 1 ? { phone: "(802) 555-" + String(1000 + n), website: "church" + n + ".example.org", socialLinks: ["https://facebook.com/church" + n] } : {}), ...o
}; };

test("normalizers: state codes, size from a head count, church types", () => {
  assert.equal(stateCode("New Hampshire"), "NH");
  assert.equal(stateCode("me"), "ME");
  assert.equal(stateCode("Mass."), "MA");
  assert.equal(stateCode("Vermont"), "VT");
  assert.equal(stateCode("NY"), "");
  assert.equal(sizeBandOf(30), "under-50");
  assert.equal(sizeBandOf("250"), "250-499");
  assert.equal(sizeBandOf("100-249"), "100-249");
  assert.equal(sizeBandOf("lots"), "");
  assert.equal(churchTypeOf("House Church"), "house-church");
  assert.equal(churchTypeOf("cathedral"), "");
  const n = normChurch({ name: "X", social: ["javascript:alert(1)", "https://x.com/a", "https://x.com/a"], accreditations: [" A ", "", "A"] });
  assert.deepEqual(n.social, ["https://x.com/a"], "only http(s) links, de-duplicated");
  assert.deepEqual(n.accreditations, ["A"]);
  const bare = normChurch({ name: "Y" });
  for(const k of ["churchType","network","accreditations","description","social"]) assert.ok(!(k in bare), k + " is only written when set");
});

test("the import API takes every field on Zach's list and stores it", async () => {
  const r = await imp([zachRecord()]);
  assert.equal(r.results[0].status, "created", JSON.stringify(r.results[0]));
  const c = await byId(r.results[0].id);
  assert.equal(c.state, "VT");
  assert.equal(c.address, "12 Main St, Brattleboro, VT 05301");
  assert.equal(c.leader, "Pastor Ruth Allen", "pastor is stored as the Pastor / leader field");
  assert.equal(c.phone, "(802) 555-0142");
  assert.equal(c.email, "hello@riversidehouse.org");
  assert.deepEqual(c.social, ["https://facebook.com/riversidehouse", "https://instagram.com/riversidehouse"]);
  assert.equal(c.website, "https://riversidehouse.org");
  assert.match(c.description, /house church of about 30/);
  assert.equal(c.denomination, "Non-denominational");
  assert.deepEqual(c.accreditations, ["ECFA member"]);
  assert.equal(c.network, "House Church Network of New England");
  assert.equal(c.sizeBand, "under-50");
  assert.equal(c.churchType, "house-church");
  assert.deepEqual(c.src, ["https://riversidehouse.org/about"]);
  assert.equal(c.verified, false);
  assert.equal(c.partnerLevel, undefined, "bots never set partnership");
});

test("the stored field names still work, and an alias that disagrees is refused", async () => {
  const r = await imp([
    zachRecord({ name: "Stored Names Fellowship", pastor: undefined, size: undefined, type: undefined, socialLinks: undefined,
      leader: "Rev. Kim", sizeBand: "50-99", churchType: "church-plant", social: ["https://youtube.com/@snf"] }),
    zachRecord({ name: "Clash Chapel", leader: "Someone else" }),
  ]);
  assert.equal(r.results[0].status, "created", JSON.stringify(r.results[0]));
  const c = await byId(r.results[0].id);
  assert.equal(c.leader, "Rev. Kim");
  assert.equal(c.churchType, "church-plant");
  assert.equal(r.results[1].status, "invalid");
  assert.match(r.results[1].reason, /pastor and leader are the same field/);
});

test("state must be NH, ME, VT or MA; full names are accepted", async () => {
  const r = await imp([
    zachRecord({ name: "Empire Church", town: "Albany", state: "NY" }),
    zachRecord({ name: "Pine Tree Church", town: "Portland", state: "Maine" }),
    zachRecord({ name: "Bay Church", town: "Lowell", state: "massachusetts" })
  ]);
  assert.equal(r.results[0].status, "invalid");
  assert.match(r.results[0].reason, /state must be one of NH, ME, VT, MA/);
  assert.equal((await byId(r.results[1].id)).state, "ME");
  assert.equal((await byId(r.results[2].id)).state, "MA");
  assert.equal((await apiReq("keys?state=NY")).status, 422);
  assert.equal((await apiReq("lookup?name=a&town=b&state=TX")).status, 422);
});

test("bad profile values are invalid with a reason, never trimmed", async () => {
  const cases = [
    [{ socialLinks: "https://facebook.com/x" }, /socialLinks must be a list/],
    [{ socialLinks: ["ftp://nope"] }, /socialLinks has an entry that isn't an http\(s\) link/],
    [{ socialLinks: Array.from({ length: 11 }, (_, i) => "https://x.com/" + i) }, /more than 10/],
    [{ accreditations: [42] }, /accreditations has an entry/],
    [{ type: "cathedral" }, /type must be one of congregation, house-church/],
    [{ size: "huge" }, /size must be a head count/],
    [{ description: "x".repeat(601) }, /description is over 600/],
    [{ partner: true }, /leaders set partner/],
    [{ partnerLevel: "partner" }, /leaders set partnerLevel/]
  ];
  const r = await imp(cases.map(([o], i) => zachRecord({ name: "Bad " + i, ...o })));
  cases.forEach(([, re], i) => {
    assert.equal(r.results[i].status, "invalid", "case " + i);
    assert.match(r.results[i].reason, re, "case " + i);
  });
});

test("dedup is normalized name + town + state: other states are other churches", async () => {
  const r = await imp([
    zachRecord({ name: "Riverside Community Church", town: "Brattleboro", state: "VT" }),
    zachRecord({ name: "Riverside House Church", town: "Brattleboro", state: "MA" }),
    zachRecord({ name: "riverside house", town: "Brattleboro", state: "Vermont", })
  ]);
  assert.equal(r.results[0].status, "created", "a different name in the same town is a different church");
  assert.equal(r.results[1].status, "created", "the same name in another state is a different church");
  assert.equal(r.results[2].status, "exists", "case, \"Church\" and the state's full name don't make a new church");
  const vt = (await roster()).list.filter(x => /^riverside/i.test(x.name) && x.town === "Brattleboro" && x.state === "VT");
  assert.equal(vt.length, 2);
});

test("upsert fills blank profile fields only and reports conflicts by Zach's names", async () => {
  const r = await imp([{ name: "Hope Chapel", town: "Keene", county: "Cheshire", state: "NH",
    denomination: "Methodist", network: "Converge Northeast", type: "congregation", pastor: "Pastor Dan",
    socialLinks: ["https://facebook.com/hopekeene"], sourceUrls: ["https://hopekeene.org"], researchedAt: "2026-10-12" }], { mode: "upsert" });
  const x = r.results[0];
  assert.equal(x.status, "updated");
  assert.deepEqual(x.fields.sort(), ["network", "pastor", "socialLinks", "type"]);
  assert.deepEqual(x.conflicts, ["denomination"], "a filled value is never overwritten");
  const c = await byId("hope-keene");
  assert.equal(c.denomination, "Baptist");
  assert.equal(c.network, "Converge Northeast");
  assert.deepEqual(c.src, ["https://hopekeene.org"]);
});

test("keys and lookup return partner level and the partner flag", async () => {
  const k = await (await apiReq("keys?state=NH")).json();
  const g = k.churches.find(x => x.id === "grace-concord");
  assert.equal(g.partnerLevel, "covenant");
  assert.equal(g.partner, true);
  const h = k.churches.find(x => x.id === "hope-keene");
  assert.equal(h.partner, false);
  const l = await (await apiReq("lookup?name=Grace%20Church&town=Concord&state=New%20Hampshire")).json();
  assert.equal(l.match.id, "grace-concord");
  assert.equal(l.match.partner, true);
  for(const k2 of ["pastor", "socialLinks", "description", "accreditations", "network", "size", "type"]) assert.ok(l.match.missing.includes(k2), k2 + " reported missing");
  assert.ok(!l.match.missing.includes("leader"), "missing uses Zach's names");
});

test("the app's add and edit carry the profile and limit the state", async () => {
  const bad = await call("churchAdd", { church: { id: "qc1", name: "Église Québec", town: "Montréal", state: "QC", ...stamp } }, asAmbassador);
  assert.equal(bad.status, 400);
  const ok = await call("churchAdd", { church: { id: "ma1", name: "Harbor Light", town: "Salem", state: "Massachusetts", county: "Out of state", churchType: "church-plant", ...stamp } }, asAmbassador);
  assert.equal(ok.status, 200);
  const added = await byId("ma1");
  assert.equal(added.state, "MA");
  assert.equal(added.churchType, "church-plant");
  const patch = { churchType: "campus", network: "Acts 29", description: "Multi-site church, Salem campus.", accreditations: ["ECFA"],
    social: ["https://instagram.com/harborlight"], src: ["https://harborlight.org/about"], state: "MA" };
  const e = await call("churchEdit", { id: "pe1", ch: "ma1", patch, base: { churchType: "church-plant", network: "", description: "", accreditations: [], social: [], src: [] }, ...stamp });
  assert.equal(e.status, 200);
  const c = await byId("ma1");
  for(const [k, v] of Object.entries(patch)) assert.deepEqual(c[k], v, k);
  const tooMany = await call("churchEdit", { id: "pe2", ch: "ma1", patch: { social: Array.from({ length: 11 }, (_, i) => "https://x.com/" + i) }, ...stamp });
  assert.equal(tooMany.status, 400);
  const noState = await call("churchEdit", { id: "pe3", ch: "ma1", patch: { state: "ZZ" }, ...stamp });
  assert.equal(noState.status, 400);
  assert.equal((await byId("ma1")).state, "MA");
  const amb = await call("churchEdit", { id: "pe4", ch: "ma1", patch: { network: "Other" }, ...stamp }, asAmbassador);
  assert.equal(amb.status, 403, "profile edits are leader-only like every master-list edit");
});
