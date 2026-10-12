/* Church roster storage (v1.25.0): no silent caps, duplicate guard, field-level
   edit conflicts, partner counter, the one-time Zeal migration, audit trail,
   backups + restore. Runs the real handler against an in-memory Blobs stand-in. */
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
/* The roster as v1.24.0 left it — written before the new code ever runs. */
const legacy = { rev: 7, removed: [], list: Array.from({ length: 900 }, (_, i) => ({ id: "c" + i, name: "Church " + i, town: "Town " + (i % 50), county: "Merrimack", state: "NH", connections: [] })),
  log: [], tpl: {} };
store._data.set("churches", { value: JSON.stringify(legacy), etag: "e0" });

const mod = await import("../netlify/functions/data.mjs");
const { default: handler, __setStoreFactory, normChurches, partnerStats } = mod;
__setStoreFactory(() => store);

const call = (action, payload = {}, auth = { pin: "999999" }) => handler(new Request("https://x/api", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, ...auth })
}), {});
const roster = async () => (await handler(new Request("https://x/api?part=churches", { headers: { "x-leader-pin": "999999" } }), {})).json();
const poll = async () => (await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {})).json();
const stamp = { by: "MN", t: "9:00 AM", d: "2026-10-12" };

test("the first read keeps an untouched pre-v1.25.0 copy and keeps all 900 churches", async () => {
  const c = await roster();
  assert.ok(c.list.length >= 900, "the old 800 cap must not trim the list");
  const pre = await store.get("bak-pre-v1.25.0-churches");
  assert.ok(pre, "pre-upgrade backup written");
  assert.equal(pre.data.rev, 7);
  assert.equal(pre.data.list.length, 900);
  assert.ok(await store.get("bak-pre-v1.25.0-io"), "io blobs backed up too");
});

test("The Zeal Movement is added once, as a Partner, by migration", async () => {
  const c = await roster();
  const z = c.list.filter(x => /zeal movement/i.test(x.name));
  assert.equal(z.length, 1);
  assert.equal(z[0].id, "zeal-movement-manchester");
  assert.equal(z[0].name, "The Zeal Movement");
  assert.equal(z[0].town, "Manchester");
  assert.equal(z[0].county, "Hillsborough");
  assert.equal(z[0].partnerLevel, "partner");
  assert.equal(z[0].contact, "Phil & Kaylin Tuttle");
  assert.equal(z[0].contactRole, "Lead Pastors");
  assert.equal(z[0].address, "811 Canal Street, Manchester, NH 03101");
  assert.equal(z[0].website, "http://www.thezealmovement.com");
  assert.equal(z[0].email, "admin@thezealmovement.com");
  assert.deepEqual(z[0].src, ["http://www.thezealmovement.com/our-team"]);
  assert.doesNotMatch(JSON.stringify(c), /Cuddle/);
  assert.equal(z[0].origin, "migration");
  assert.ok(c.migr.includes("2026-10-12-zeal-movement-partner"));
  assert.ok(c.migr.includes("2026-10-12-zeal-movement-correction"));
  assert.equal(c.log.filter(e => e.ch === z[0].id).length, 1, "a fresh store gets one 'added' entry, no correction noise");
  assert.equal(c.removed.length, 0);
  // Deleting it sticks: the migration has run and never runs again.
  assert.equal((await call("churchDelete", { ch: z[0].id, ...stamp })).status, 200);
  const after = await roster();
  assert.equal(after.list.filter(x => /zeal movement/i.test(x.name)).length, 0);
  assert.ok([...store._data.keys()].some(k => /^bak-ch-\d+-delete$/.test(k)), "delete takes a snapshot first");
});

test("the migration fills blanks on an existing match instead of adding a twin", async () => {
  const c = normChurches({ rev: 1, list: [{ id: "zeal", name: "The Zeal Movement Church", town: "Manchester, NH", county: "", contact: "", notes: "Met at a rally" }] });
  const { CH_PARTNER_LEVELS } = mod;
  assert.ok(CH_PARTNER_LEVELS.includes("partner"));
  // Re-run through the GET path on a fresh store.
  const s2 = mockStore();
  s2._data.set("churches", { value: JSON.stringify(c), etag: "x" });
  __setStoreFactory(() => s2);
  const r = await roster();
  __setStoreFactory(() => store);
  const z = r.list.filter(x => /zeal/i.test(x.name));
  assert.equal(z.length, 1, "no duplicate");
  assert.equal(z[0].id, "zeal");
  assert.equal(z[0].partnerLevel, "partner");
  assert.equal(z[0].contact, "Phil & Kaylin Tuttle");
  assert.match(z[0].notes, /^Met at a rally\n/, "a leader's notes are kept");
});

test("the correction fixes the shipped Zeal row and folds Manchester duplicates into it", async () => {
  const shipped = { id: "zeal-movement-manchester", name: "Zeal Movement Church", kind: "church", town: "Manchester", county: "Hillsborough", state: "NH",
    contact: "Phil Cuddle", partnerLevel: "partner", notes: "Partner church. Contact: Phil Cuddle (spouse's name TBD).", origin: "migration", v: 1 };
  const dup = { id: "zeal-church", name: "Zeal Church", town: "Manchester", county: "Hillsborough", state: "NH", phone: "603-555-0199",
    interest: 3, notes: "Sunday 10:30", connections: [{ id: "k1", amb: "Ann", note: "knows Phil", t: "1:00 PM", d: "2026-10-01" }] };
  const bySite = { id: "zm2", name: "ZM Manchester", town: "Manchester, NH", county: "Hillsborough", state: "NH", website: "https://thezealmovement.com/visit" };
  const elsewhere = { id: "zeal-concord", name: "Zeal Movement Church", town: "Concord", county: "Merrimack", state: "NH" };
  const s4 = mockStore();
  s4._data.set("churches", { value: JSON.stringify({ rev: 360, migr: ["2026-10-12-zeal-movement-partner"], removed: [],
    list: [shipped, dup, bySite, elsewhere], log: [{ id: "l1", ch: "zeal-church", type: "call", by: "Ann", note: "", t: "2:00 PM", d: "2026-10-02" }] }), etag: "x" });
  __setStoreFactory(() => s4);
  const r = await roster();
  const again = await roster();
  __setStoreFactory(() => store);
  const z = r.list.filter(x => x.town.startsWith("Manchester") && /zeal|zm/i.test(x.name));
  assert.equal(z.length, 1, "one Manchester Zeal row");
  const k = z[0];
  assert.equal(k.id, "zeal-movement-manchester");
  assert.equal(k.name, "The Zeal Movement");
  assert.equal(k.contact, "Phil & Kaylin Tuttle");
  assert.equal(k.leader, "Pastors Phil & Kaylin Tuttle");
  assert.equal(k.address, "811 Canal Street, Manchester, NH 03101");
  assert.equal(k.email, "admin@thezealmovement.com");
  assert.equal(k.phone, "603-555-0199", "blanks filled from the duplicate");
  assert.equal(k.interest, 3);
  assert.equal(k.connections.length, 1);
  assert.equal(k.v, 2);
  assert.doesNotMatch(k.notes, /Cuddle/);
  assert.match(k.notes, /Sunday 10:30/);
  assert.match(k.notes, /Tuttle/);
  assert.ok(r.list.some(x => x.id === "zeal-concord"), "a Zeal in another town is a different church");
  assert.deepEqual(r.removed.sort(), ["zeal-church", "zm2"], "duplicates are tombstoned, not resurrected");
  assert.equal(r.log.find(e => e.id === "l1").ch, k.id, "their history moves to the kept row");
  assert.ok(r.log.some(e => e.ch === k.id && /Corrected from thezealmovement\.com\/our-team/.test(e.note) && /merged 2 duplicates/.test(e.note)));
  assert.ok(r.rev > 360);
  assert.equal(again.rev, r.rev, "runs once");
  const audit = await s4.get([...s4._data.keys()].find(x => x.startsWith("churches-audit-")));
  const upd = audit.entries.find(e => e.act === "update" && e.ch === k.id);
  assert.deepEqual(upd.changes.contact, { from: "Phil Cuddle", to: "Phil & Kaylin Tuttle" });
  assert.equal(audit.entries.filter(e => e.act === "merge").length, 2);
});

test("adding a duplicate is refused with the existing id, not silently dropped", async () => {
  const r = await call("churchAdd", { church: { id: "dup1", name: "church 3", town: "town 3", county: "Merrimack", ...stamp, addedBy: "MN" } });
  assert.equal(r.status, 409);
  const b = await r.json();
  assert.equal(b.duplicate, true);
  assert.equal(b.id, "c3");
  const ok = await call("churchAdd", { church: { id: "new1", name: "St. Mary's Parish", town: "Dover", county: "Strafford", ...stamp, addedBy: "MN" } });
  assert.equal(ok.status, 200);
  const twin = await call("churchAdd", { church: { id: "new2", name: "Saint Marys Parish", town: "Dover NH", county: "Strafford", ...stamp } });
  assert.equal(twin.status, 409, "St./Saint, apostrophes and a trailing NH are the same church");
});

test("two leaders editing different fields both land; overlapping edits are a 409", async () => {
  const a = await call("churchEdit", { id: "e1", ch: "c5", patch: { phone: "603-555-0101" }, base: { phone: "" }, ...stamp });
  assert.equal(a.status, 200);
  const b = await call("churchEdit", { id: "e2", ch: "c5", patch: { email: "pastor@example.org" }, base: { email: "" }, ...stamp });
  assert.equal(b.status, 200, "different field — merges");
  const stale = await call("churchEdit", { id: "e3", ch: "c5", patch: { phone: "603-555-9999" }, base: { phone: "" }, ...stamp });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.deepEqual(body.fields, ["phone"]);
  assert.equal(body.church.phone, "603-555-0101");
  const c5 = (await roster()).list.find(x => x.id === "c5");
  assert.equal(c5.phone, "603-555-0101");
  assert.equal(c5.email, "pastor@example.org");
  assert.ok(c5.v >= 2, "record version moves on every change");
});

test("partner fields are leader-editable and the poll carries the counter", async () => {
  for(const [i, lvl] of [["c10","partner"],["c11","covenant"],["c12","praying"]]){
    const r = await call("churchEdit", { id: "p" + i, ch: i, patch: { partnerLevel: lvl, partnerSince: "2026-10-01", owner: "Zach", nextStep: "Lunch", nextStepDue: "2026-10-20", sizeBand: "100-249", denomination: "Baptist" }, base: { partnerLevel: "" }, ...stamp });
    assert.equal(r.status, 200);
  }
  const bad = await call("churchEdit", { id: "pbad", ch: "c13", patch: { partnerLevel: "bestie", sizeBand: "huge" }, ...stamp });
  assert.equal(bad.status, 200);
  const list = (await roster()).list;
  assert.equal(list.find(x => x.id === "c13").partnerLevel, undefined, "unknown level is dropped");
  assert.equal(list.find(x => x.id === "c10").owner, "Zach");
  const p = await poll();
  assert.equal(p.partnerGoal, 100);
  assert.equal(p.partnerCount, 2, "Partner + Covenant count toward 100; Praying does not");
  assert.deepEqual(p.partnerTiers, { praying: 1, partner: 1, covenant: 1 });
  assert.equal(partnerStats([{ partnerLevel: "partner", flag: { reason: "x" } }]).count, 0, "flagged churches don't count");
  const ambassador = await call("churchEdit", { id: "amb", ch: "c14", patch: { partnerLevel: "partner" }, ...stamp }, {});
  assert.equal(ambassador.status, 403, "ambassadors can't set partnership");
});

test("every change lands in the monthly audit log with before and after", async () => {
  const keys = [...store._data.keys()].filter(k => k.startsWith("churches-audit-"));
  assert.equal(keys.length, 1);
  const a = await store.get(keys[0]);
  const edit = a.entries.find(e => e.act === "update" && e.ch === "c5" && e.changes.phone);
  assert.ok(edit);
  assert.deepEqual(edit.changes.phone, { from: "", to: "603-555-0101" });
  assert.ok(a.entries.some(e => e.act === "create" && /zeal/i.test(e.name) && e.actor === "migration"));
  assert.ok(a.entries.some(e => e.act === "delete"));
});

test("connections are no longer trimmed at 40", async () => {
  for(let i = 0; i < 45; i++) assert.equal((await call("churchConnect", { ch: "c20", amb: "Amb " + i, note: "", t: "x", d: "y" }, { pin: "999999" })).status, 200);
  assert.equal((await roster()).list.find(x => x.id === "c20").connections.length, 45);
});

test("leaders can list backups and restore one; the current list is snapshotted first", async () => {
  const r = await call("backupList", {});
  const { backups } = await r.json();
  const pre = backups.find(b => b.key === "bak-pre-v1.25.0-churches");
  assert.ok(pre && pre.kind === "churches");
  const before = (await roster()).rev;
  const res = await call("churchRestore", { key: pre.key, by: "MN" });
  assert.equal(res.status, 200);
  const c = await roster();
  assert.equal(c.list.filter(x => /^c\d+$/.test(x.id)).length, 900);
  assert.ok(!c.list.some(x => x.id === "new1"), "a church added after the backup is gone again");
  assert.ok(c.rev > before, "rev moves forward so every phone refetches");
  assert.ok(c.migr.includes("2026-10-12-zeal-movement-partner"), "restoring doesn't re-run migrations");
  assert.ok([...store._data.keys()].some(k => /^bak-ch-\d+-prerestore$/.test(k)));
  assert.equal((await call("churchRestore", { key: "io~rockingham" })).status, 400, "only church backups");
  assert.equal((await call("churchRestore", { key: pre.key }, {})).status, 403, "leader only");
});

test("nightly backup writes one dated copy of churches and io", async () => {
  const r = await mod.nightlyBackup();
  assert.equal(r.ok, true);
  assert.ok([...store._data.keys()].some(k => /^bak-day-\d{4}-\d{2}-\d{2}-churches$/.test(k)));
  assert.ok([...store._data.keys()].some(k => /^bak-day-\d{4}-\d{2}-\d{2}-io$/.test(k)));
});

test("a full list is an error, not a silent drop", async () => {
  const s3 = mockStore();
  s3._data.set("churches", { value: JSON.stringify({ rev: 1, migr: ["2026-10-12-zeal-movement-partner"], list: Array.from({ length: 5000 }, (_, i) => ({ id: "f" + i, name: "F " + i, town: "T" })) }), etag: "x" });
  __setStoreFactory(() => s3);
  const r = await call("churchAdd", { church: { id: "over", name: "One Too Many", town: "Keene", ...stamp } });
  __setStoreFactory(() => store);
  assert.equal(r.status, 507);
  assert.equal((await r.json()).full, true);
});
