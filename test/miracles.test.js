/* Miracle Tracker: the two-witness validation standard (Deut 19:15).
   The property that matters — "a miracle only counts once two people who are
   not the reporter, each on their own phone, have confirmed it" — is enforced
   server-side, so these drive the real request handler against the in-memory
   blob store (same rig as county-scope.test.js) plus the pure counting rule
   the client mirrors. */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ---- in-memory blob store with the bits data.mjs uses ---- */
function mockStore(){
  const data = new Map();          // key -> { value, etag }
  let seq = 0;
  return {
    _data: data,
    async get(key, _o){ const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(key, _o){
      const r = data.get(key);
      return r ? { data: JSON.parse(r.value), etag: r.etag } : null;
    },
    async setJSON(key, value, opts){
      const cur = data.get(key);
      if(opts && opts.onlyIfNew && cur) return { modified:false };
      if(opts && opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified:false };
      data.set(key, { value: JSON.stringify(value), etag: "e" + (++seq) });
      return { modified:true };
    },
    async set(key, value){ data.set(key, { value: JSON.stringify(value), etag:"e"+(++seq) }); return { modified:true }; },
    async delete(key){ data.delete(key); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const store = mockStore();
process.env.LEADER_PIN = "999999";
const {
  default: handler, __setStoreFactory, autoDayPin,
  normMiracle, normMiracles, miracleWitnessCount, miracleConfirmed, WITNESS_MIN
} = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);

const dp = autoDayPin();
/* A volunteer behind the Day PIN — reporting and witnessing must NOT need the
   leader PIN, or the "everyone feeds one centralized record" premise dies. */
const vpost = (action, payload = {}) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, payload, dayPin: dp })
}), {});
const lpost = (action, payload = {}) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, payload, pin: "999999" })
}), {});
const get = async () => {
  const r = await handler(new Request("https://x/api", { headers: { "x-day-pin": dp } }), {});
  return r.json();
};
const miracle = (s, id) => (s.miracles || []).find(m => m.id === id);

test("normMiracle whitelists fields, caps lengths, and defaults the type", () => {
  const m = normMiracle({
    id: "m');alert(1)", type: "resurrection", name: "x".repeat(200),
    note: "y".repeat(5000), by: "Zach", hidden: true, sneaky: "z",
    witnesses: [{ wid: "w1", name: "Amy", extra: "no" }, { name: "" }]
  });
  assert.equal(m.id, "malert1");
  assert.equal(m.type, "other", "unknown types fall back to other");
  assert.equal(m.name.length, 80);
  assert.equal(m.note.length, 1000);
  assert.ok(!("sneaky" in m) && !("hidden" in m));
  assert.equal(m.witnesses.length, 1, "witnesses without a name are dropped");
  assert.ok(!("extra" in m.witnesses[0]));
  assert.equal(normMiracles({ list: "junk" }).list.length, 0);
});

test("the witness count implements the two-witness standard", () => {
  const base = { by: "Zach", dev: "phoneZ" };
  assert.equal(WITNESS_MIN, 2);
  // The reporter's own name never counts, whatever the casing or spacing.
  assert.equal(miracleWitnessCount({ ...base, witnesses: [{ name: " zach " }] }), 0);
  // The reporting phone never counts, whoever's name is on it.
  assert.equal(miracleWitnessCount({ ...base, witnesses: [{ name: "Amy", dev: "phoneZ" }] }), 0);
  // The same person counts once.
  assert.equal(miracleWitnessCount({ ...base, witnesses: [{ name: "Amy" }, { name: "AMY " }] }), 1);
  // Two real witnesses = established.
  const ok = { ...base, witnesses: [{ name: "Amy", dev: "phoneA" }, { name: "Troy", dev: "phoneT" }] };
  assert.equal(miracleWitnessCount(ok), 2);
  assert.equal(miracleConfirmed(ok), true);
  assert.equal(miracleConfirmed({ ...base, witnesses: [{ name: "Amy" }] }), false);
});

test("a volunteer can report; validation takes two other people on other phones", async () => {
  await vpost("miracleAdd", { id: "m1", type: "healing", name: "Maria", note: "Knee pain gone after prayer at the tent", county: "carroll", by: "Zach", dev: "phoneZ", t: "3:10 PM", d: "2026-07-25" });
  let s = await get();
  let m = miracle(s, "m1");
  assert.ok(m, "the report is in the shared payload for every phone");
  assert.equal(s.witnessMin, 2);
  assert.equal(m.name, "Maria", "the optional name is kept when given");

  // The reporter confirming their own report is a no-op…
  await vpost("miracleWitness", { id: "m1", wid: "w1", name: "Zach", dev: "phoneQ" });
  // …and so is any name sent from the reporting phone.
  await vpost("miracleWitness", { id: "m1", wid: "w2", name: "Amy", dev: "phoneZ" });
  s = await get(); m = miracle(s, "m1");
  assert.equal(m.witnesses.length, 0, "neither the reporter nor their phone can witness");

  // First real witness — still not established.
  await vpost("miracleWitness", { id: "m1", wid: "w3", name: "Amy", dev: "phoneA", t: "3:20 PM" });
  s = await get(); m = miracle(s, "m1");
  assert.equal(miracleWitnessCount(m), 1);
  assert.equal(miracleConfirmed(m), false, "one witness is not the biblical standard");

  // The same person again (case/spacing games) and the same phone under a
  // new name both bounce.
  await vpost("miracleWitness", { id: "m1", wid: "w4", name: " AMY ", dev: "phoneB" });
  await vpost("miracleWitness", { id: "m1", wid: "w5", name: "Troy", dev: "phoneA" });
  s = await get(); m = miracle(s, "m1");
  assert.equal(m.witnesses.length, 1, "duplicate people and duplicate phones don't stack");

  // A second genuine witness establishes it.
  await vpost("miracleWitness", { id: "m1", wid: "w6", name: "Troy", dev: "phoneT", t: "3:31 PM" });
  s = await get(); m = miracle(s, "m1");
  assert.equal(miracleConfirmed(m), true, "two witnesses — established");

  // An outbox retry of an already-landed confirmation changes nothing.
  await vpost("miracleWitness", { id: "m1", wid: "w6", name: "Troy", dev: "phoneT", t: "3:31 PM" });
  s = await get(); m = miracle(s, "m1");
  assert.equal(m.witnesses.length, 2);
});

test("a retried miracleAdd can't duplicate, and the name really is optional", async () => {
  await vpost("miracleAdd", { id: "m2", type: "salvation", note: "Young man prayed to receive Christ at the altar", by: "Liz", dev: "phoneL", t: "4:00 PM", d: "2026-07-25" });
  await vpost("miracleAdd", { id: "m2", type: "salvation", note: "Young man prayed to receive Christ at the altar", by: "Liz", dev: "phoneL", t: "4:00 PM", d: "2026-07-25" });
  const s = await get();
  assert.equal((s.miracles || []).filter(m => m.id === "m2").length, 1);
  assert.equal(miracle(s, "m2").name, "", "no name required — anonymity is allowed");
});

test("deleting a report is leader-only", async () => {
  const refused = await vpost("miracleDelete", { id: "m2" });
  assert.equal(refused.status, 403, "a volunteer can't remove a testimony");
  let s = await get();
  assert.ok(miracle(s, "m2"), "still there");

  await lpost("miracleDelete", { id: "m2" });
  s = await get();
  assert.ok(!miracle(s, "m2"), "a leader can remove it");
});

test("the tracker is season-long: it survives reset and county switches", async () => {
  let s = await get();
  assert.ok(miracle(s, "m1"), "m1 exists before the reset");

  await lpost("reset", {});
  s = await get();
  const m = miracle(s, "m1");
  assert.ok(m, "reset must not clear the season's testimony record");
  assert.equal(m.witnesses.length, 2, "half a season of witnesses survives too");

  await lpost("setCounty", { county: "cheshire" });
  s = await get();
  assert.ok(miracle(s, "m1"), "miracles follow the season, not the county board");
  await lpost("setCounty", { auto: true });
});
