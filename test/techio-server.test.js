/* Tech I/O lineup on the server (v1.21.0).
   Runs the real request handler against an in-memory stand-in for Netlify
   Blobs (same pattern as county-scope.test.js). Covers where a new event's
   lineup comes from, who may write it, and that the old roster actions an
   older app copy may still send can never wipe it. */
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
    async set(key, value){ data.set(key, { value: JSON.stringify(value), etag:"e"+(++seq) }); return { modified:true }; },
    async delete(key){ data.delete(key); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const store = mockStore();
process.env.LEADER_PIN = "999999";
const { default: handler, __setStoreFactory, currentEvent, pinForDate } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);
const DAY = pinForDate(currentEvent().date);

const call = (action, payload = {}, auth = { pin: "999999" }) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, payload, ...auth })
}), {});
const post = async (action, payload, auth) => { const r = await call(action, payload, auth); return r.status; };
const asTech = { dayPin: DAY };
const get = async () => (await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {})).json();

/* A small lineup: enough shape to exercise every path. */
function rig(name = "Kyle", extra = {}){
  return {
    snakeSize: 16, nsbStart: 1, nsbAvb: 40,
    positions: [
      { id: "drums", name: "Drums", person: name, active: true, iem: true, kind: "musician", inputs: [
        { id: "kick", role: "Kick Drum", avb: "25", split: "25", via: "split", snake: true, foh: "20", sc: "20" },
        { id: "tom-1", role: "Tom 1", via: "nsb", snake: true, foh: "23" }
      ]}
    ],
    snakeOrder: ["kick", "tom-1"],
    packs: [{ id: "pack-8", label: "Pack 8 (Blue)", person: name, tx: 8, leg: "" }],
    txs: [{ n: 8, mode: "stereo", color: "#2E7CD6" }],
    buses: [], people: [name],
    ...extra
  };
}

test("a new event with nothing earlier starts from the client's built-in roster", async () => {
  assert.equal(await post("setCounty", { county: "sullivan" }), 200);
  let s = await get();
  assert.equal(s.rig, null, "no lineup until someone opens Tech I/O");
  assert.equal(await post("rigSeed", { seed: rig("Kyle") }, asTech), 200, "any tech can start it");
  s = await get();
  assert.equal(s.rig.positions[0].person, "Kyle");
  assert.equal(s.rig.from.kind, "builtin");
  // A second phone's seed is a no-op.
  await post("rigSeed", { seed: rig("Somebody else") }, asTech);
  s = await get();
  assert.equal(s.rig.positions[0].person, "Kyle");
});

test("the next event starts from the previous event's lineup, checkmarks cleared", async () => {
  await post("setCounty", { county: "sullivan" });
  assert.equal(await post("rigCheck", { iid: "kick", done: true, by: "MN", t: "2:00 PM" }, asTech), 200);
  let s = await get();
  assert.equal(s.rig.positions[0].inputs[0].done, true);
  assert.equal(await post("rigSave", { rig: { ...rig("Steve"), rev: 0 }, by: "MN" }), 200);
  s = await get();
  assert.equal(s.rig.positions[0].person, "Steve");
  assert.equal(s.rig.positions[0].inputs[0].done, true, "saving keeps the patch checkmark");

  // Grafton is next on the schedule.
  await post("setCounty", { county: "grafton" });
  await post("rigSeed", { seed: rig("Built-in") }, asTech);
  s = await get();
  assert.equal(s.rig.positions[0].person, "Steve", "carried over from Sullivan, not the built-in");
  assert.equal(s.rig.from.kind, "last");
  assert.equal(s.rig.from.county, "sullivan");
  assert.equal(s.rig.positions[0].inputs[0].done, false, "checkmarks start clear");
});

test("a patch tick on a brand-new event seeds it first, then sticks", async () => {
  await post("setCounty", { county: "strafford" });
  assert.equal(await post("rigCheck", { iid: "kick", done: true, by: "MN", t: "9:00 AM", seed: rig("Built-in") }, asTech), 200);
  const s = await get();
  assert.equal(s.rig.positions[0].person, "Steve", "previous event (Grafton) wins over the seed");
  assert.equal(s.rig.positions[0].inputs[0].done, true);
  assert.equal(s.rig.positions[0].inputs[0].by, "MN");
});

test("only leaders can change the lineup, clear checks or restore", async () => {
  await post("setCounty", { county: "strafford" });
  assert.equal(await post("rigSave", { rig: rig("X") }, asTech), 403);
  assert.equal(await post("rigClearChecks", {}, asTech), 403);
  assert.equal(await post("rigRestore", { from: "template" }, asTech), 403);
  assert.equal(await post("rigTemplateSave", {}, asTech), 403);
  assert.equal(await post("rigCheck", { iid: "kick", done: true, by: "No PIN", t: "x" }, {}), 403, "and nobody without the Day PIN");
});

test("Clear checkmarks clears ticks and nothing else", async () => {
  await post("setCounty", { county: "strafford" });
  let s = await get();
  const rev = s.rig.rev;
  assert.equal(await post("rigClearChecks", {}), 200);
  s = await get();
  assert.equal(s.rig.positions[0].inputs[0].done, false);
  assert.equal(s.rig.positions[0].person, "Steve");
  assert.equal(s.rig.rev, rev);
});

test("Template: save, then restore it into another event", async () => {
  await post("setCounty", { county: "strafford" });
  await post("rigSave", { rig: rig("Template Kyle"), by: "MN" });
  assert.equal(await post("rigTemplateSave", { by: "MN" }), 200);
  await post("setCounty", { county: "carroll" });
  await post("rigSave", { rig: rig("Someone"), by: "MN" });
  assert.equal(await post("rigRestore", { from: "template", by: "MN" }), 200);
  const s = await get();
  assert.equal(s.rig.positions[0].person, "Template Kyle");
  assert.equal(s.rig.from.kind, "template");
  assert.ok([...store._data.keys()].some(k => k.includes("-io-restore")), "a backup was taken first");
});

test("Restore from the last event and from the built-in", async () => {
  await post("setCounty", { county: "cheshire" });
  await post("rigSave", { rig: rig("Wrong"), by: "MN" });
  assert.equal(await post("rigRestore", { from: "last", by: "MN" }), 200);
  let s = await get();
  assert.equal(s.rig.positions[0].person, "Template Kyle", "Carroll is the event before Cheshire");
  assert.equal(await post("rigRestore", { from: "builtin", seed: rig("Built-in"), by: "MN" }), 200);
  s = await get();
  assert.equal(s.rig.positions[0].person, "Built-in");
});

test("Restore says so when there is nothing to restore from", async () => {
  await post("setCounty", { county: "sullivan" }); // first event of the season
  assert.equal(await post("rigRestore", { from: "last", by: "MN" }), 404);
});

test("the lineup is whitelisted and capped like every other blob", async () => {
  await post("setCounty", { county: "belknap" });
  await post("rigSave", { rig: {
    positions: [{ id: "p'1", name: "Drums", person: "<b>K</b>", kind: "laser", evil: 1, inputs: [
      { id: "r'1", role: "Kick", via: "teleport", mixOf: ["a'b"], junk: 1 },
      { id: "r'1", role: "Dup id" }
    ]}],
    packs: [{ id: "k1", label: "P", tx: 99, leg: "X" }],
    txs: [{ n: 1, mode: "quad", color: "javascript:x" }],
    nsbStart: 500, snakeSize: -3, hack: true
  }, by: "MN" });
  const r = (await get()).rig, p = r.positions[0];
  assert.equal(p.id, "p1");
  assert.equal(p.kind, "musician");
  assert.ok(!("evil" in p) && !("hack" in r));
  assert.equal(p.inputs[0].via, "split");
  assert.deepEqual(p.inputs[0].mixOf, ["ab"]);
  assert.notEqual(p.inputs[0].id, p.inputs[1].id, "duplicate ids are made unique");
  assert.equal(r.packs[0].tx, 16);
  assert.equal(r.packs[0].leg, "");
  assert.equal(r.txs[0].mode, "stereo");
  assert.equal(r.txs[0].color, "#c7c2b8");
  assert.equal(r.nsbStart, 32);
  assert.equal(r.snakeSize, 1);
});

test("an older app's roster writes never wipe the lineup", async () => {
  await post("setCounty", { county: "coos" });
  await post("rigSave", { rig: rig("Kyle"), by: "MN" });
  await post("setIOList", { list: [{ id: "Pack8", name: "Tyler", rows: [{ id: "r1", role: "Kick" }] }] });
  await post("ioSetRow", { pid: "Pack8", rid: "r1", done: true, by: "MN", t: "x" }, asTech);
  const s = await get();
  assert.ok(s.rig, "lineup survives");
  assert.equal(s.rig.positions[0].person, "Kyle");
  assert.deepEqual(s.ioList, [], "the legacy list stays out of the poll once a lineup exists");
});

test("the end-of-day reset leaves the lineup and its checkmarks alone", async () => {
  await post("setCounty", { county: "merrimack" });
  await post("rigSave", { rig: rig("Kyle"), by: "MN" });
  await post("rigCheck", { iid: "kick", done: true, by: "MN", t: "9:00 AM" }, asTech);
  assert.equal(await post("reset", {}), 200);
  const s = await get();
  assert.equal(s.rig.positions[0].person, "Kyle");
  assert.equal(s.rig.positions[0].inputs[0].done, true);
});
