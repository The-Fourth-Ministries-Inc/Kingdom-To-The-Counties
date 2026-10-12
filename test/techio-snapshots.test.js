/* Tech I/O snapshots (v1.26.0): every write to a Tech I/O blob first stores
   the blob exactly as it was, a write whose snapshot fails is refused, only
   leaders can replace the lineup, a narrower schema can't trim it, and the
   first read after a county rollover can't overwrite it. */
import { test } from "node:test";
import assert from "node:assert/strict";

function mockStore(){
  const data = new Map();
  let seq = 0;
  return {
    _data: data,
    failSnapshots: false,
    async get(key){ const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(key){ const r = data.get(key); return r ? { data: JSON.parse(r.value), etag: r.etag } : null; },
    async setJSON(key, value, opts){
      if(this.failSnapshots && key.startsWith("iosnap-")) throw new Error("blobs down");
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

let store = mockStore();
process.env.LEADER_PIN = "999999";
const { default: handler, __setStoreFactory, currentEvent, pinForDate } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);
const DAY = pinForDate(currentEvent().date);
const CTY = currentEvent().key;
const IO = "io~" + CTY;
const leader = { pin: "999999" }, tech = { dayPin: DAY };
const call = (action, payload = {}, auth = leader) => handler(new Request("https://x/api", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, ...auth })
}), {}).then(r => r.status, () => 500);
const poll = async () => (await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {})).json();
const snaps = blob => [...store._data.keys()].filter(k => k.startsWith("iosnap-" + blob + "-")).sort();
const raw = key => store._data.has(key) ? JSON.parse(store._data.get(key).value) : null;

function rig(name = "Kyle", n = 2){
  return { snakeSize: 16, nsbStart: 1, nsbAvb: 40, buses: [], people: [name], snakeOrder: [],
    packs: [{ id: "pack-8", label: "Pack 8", person: name, tx: 8, leg: "" }], txs: [{ n: 8, mode: "stereo", color: "#2E7CD6" }],
    positions: [{ id: "drums", name: "Drums", person: name, active: true, iem: true, kind: "musician",
      inputs: Array.from({ length: n }, (_, i) => ({ id: "in" + i, role: "Input " + i, via: "split", snake: true, foh: String(i + 1) })) }] };
}
const curRev = async () => (await poll()).rig.rev;

test("every Tech I/O write stores the blob exactly as it was, first", async () => {
  assert.equal(await call("rigSeed", { seed: rig() }, tech), 200);
  assert.equal(snaps(IO).length, 0, "nothing to keep before the very first write");
  const steps = [
    ["rigCheck", { iid: "in0", done: true, by: "T", t: "9:00 AM" }, tech],
    ["rigSave", { rig: rig("Zach", 3), by: "Z", baseRev: 0, saveId: "s1" }, leader],
    ["rigClearChecks", { by: "Z" }, leader],
    ["setIOList", { list: [{ id: "p1", name: "Stage", rows: [{ id: "r1", role: "Kick" }] }], by: "Z" }, leader],
    ["ioSetRow", { pid: "p1", rid: "r1", done: true, by: "T", t: "9:01 AM" }, tech],
    ["rigRestore", { from: "builtin", seed: rig("Built-in"), by: "Z" }, leader]
  ];
  for(const [action, payload, auth] of steps){
    const before = raw(IO), beforeKeys = new Set(snaps(IO));
    if(action === "rigClearChecks") await call("rigCheck", { iid: "in1", done: true, by: "T", t: "9:00 AM" }, tech);
    const expected = raw(IO);
    assert.equal(await call(action, payload, auth), 200, action);
    const mine = snaps(IO).filter(k => k.endsWith("-" + action) && !beforeKeys.has(k));
    assert.equal(mine.length, 1, action + " took exactly one snapshot");
    const snap = raw(mine[0]);
    assert.deepEqual(snap.data, action === "rigClearChecks" ? expected : before, action + " snapshot is the stored value it replaced");
    assert.equal(snap.blob, IO);
  }
  assert.equal(await call("rigTemplateSave", { by: "Z" }, leader), 200);
  assert.equal(snaps("io-template").length, 0, "first Template: nothing to keep");
  const firstTpl = raw("io-template");
  assert.equal(await call("rigTemplateSave", { by: "Z" }, leader), 200);
  assert.deepEqual(raw(snaps("io-template")[0]).data, firstTpl, "replacing the Template keeps the old one");
});

test("a write whose snapshot can't be stored is refused and nothing changes", async () => {
  const before = raw(IO);
  store.failSnapshots = true;
  const st = await call("rigCheck", { iid: "in0", done: true, by: "T", t: "9:05 AM" }, tech);
  const st2 = await call("rigSave", { rig: rig("Nobody", 1), by: "Z", baseRev: (await curRev()), saveId: "s9" }, leader);
  store.failSnapshots = false;
  assert.ok(st >= 500 && st2 >= 500, "refused with a server error, so the outbox retries");
  assert.deepEqual(raw(IO), before);
});

test("only leaders can replace, restore or clear the lineup; techs still tick inputs", async () => {
  const rev = await curRev();
  assert.equal(await call("rigSave", { rig: rig("Intruder"), by: "X", baseRev: rev, saveId: "x1" }, tech), 403);
  assert.equal(await call("rigRestore", { from: "builtin", seed: rig("Intruder") }, tech), 403);
  assert.equal(await call("rigClearChecks", {}, tech), 403);
  assert.equal(await call("rigTemplateSave", {}, tech), 403);
  assert.equal(await call("rigSave", { rig: rig("Intruder"), by: "X", baseRev: rev, saveId: "x2" }, {}), 403);
  assert.equal((await poll()).rig.positions[0].person, "Built-in");
  assert.equal(await call("rigCheck", { iid: "in0", done: true, by: "T", t: "9:06 AM" }, tech), 200);
});

test("a tick never lets normalization trim the stored lineup", async () => {
  const io = raw(IO);
  io.rig.positions[0].inputs = Array.from({ length: 30 }, (_, i) => ({ id: "x" + i, role: "X" + i }));
  store._data.set(IO, { value: JSON.stringify(io), etag: "big" });
  assert.ok(await call("rigCheck", { iid: "x0", done: true, by: "T", t: "9:07 AM" }, tech) >= 500);
  assert.equal(raw(IO).rig.positions[0].inputs.length, 30, "all 30 inputs still stored");
});

test("the first read after a county rollover can't overwrite the lineup or the prompter", async () => {
  store = mockStore();
  const put = (k, v) => store._data.set(k, { value: JSON.stringify(v), etag: "p" + k });
  put("active", { county: "", mode: "auto", migrated: true });
  put("state", { ioList: [{ id: "old", rows: [] }], prompter: { scripts: [] }, checkins: [] });
  put(IO, { list: [], buses: [], rig: { ...rig("Team"), rev: 41, savedAt: "2026-10-09T12:00:00Z", savedBy: "Z" } });
  put("prompter", { scripts: [{ id: "keep", title: "Season script", body: "x" }] });
  await Promise.all([poll(), poll(), poll()]);
  assert.equal(raw(IO).rig.rev, 41);
  assert.equal(raw(IO).rig.positions[0].person, "Team");
  assert.deepEqual(raw("prompter"), { scripts: [{ id: "keep", title: "Season script", body: "x" }] });
  assert.ok(raw("core~" + CTY), "the new county still gets its board");
});

test("leaders see snapshots, other events' lineups and the Template, and can restore any of them", async () => {
  const put = (k, v) => store._data.set(k, { value: JSON.stringify(v), etag: "q" + k });
  put("io~hillsborough", { list: [], buses: [], rig: { ...rig("Hillsborough team"), rev: 7, savedAt: "2026-09-26T12:00:00Z" } });
  put("io-template", { at: "2026-10-01T12:00:00Z", rig: rig("Template team") });
  assert.equal(await call("rigSave", { rig: rig("Replacement", 4), by: "Z", baseRev: 41, saveId: "r1" }, leader), 200);
  const r = await handler(new Request("https://x/api", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rigVersions", payload: {}, pin: "999999" }) }), {});
  const { versions } = await r.json();
  // The io-history entry and the snapshot hold the same lineup; the list shows one of them.
  const snap = versions.find(v => (v.kind === "before save" || v.kind === "history:save") && v.people.includes("Team"));
  assert.ok(snap && snap.people.includes("Team"), "the replaced lineup is offered");
  assert.ok(versions.some(v => v.kind === "event: Hillsborough County" && v.people.includes("Hillsborough team")));
  assert.ok(versions.some(v => v.kind === "template"));
  assert.equal(await call("rigRestore", { from: "version", key: snap.key, idx: snap.idx, by: "Z" }, leader), 200);
  assert.equal((await poll()).rig.positions[0].person, "Team");
  assert.equal(await call("rigRestore", { from: "version", key: "core~" + CTY, idx: 0 }, leader), 404, "only Tech I/O keys");
  assert.equal(await call("rigRestore", { from: "version", key: "iosnap-core~" + CTY + "-0000000000001-abc-rigSave", idx: 0 }, leader), 404);
});

test("pruning only ever drops checkmark snapshots past the newest 500", async () => {
  const realRandom = Math.random;
  const saveSnaps = () => snaps(IO).filter(k => /-(rigSave|rigRestore)$/.test(k));
  const keep = saveSnaps();
  assert.ok(keep.length >= 2, "have " + keep.length);
  try {
    Math.random = () => 0.05;
    // As a leader: tech writes are rate-limited per connection.
    for(let i = 0; i < 520; i++) assert.equal(await call("rigCheck", { iid: "in0", done: i % 2 === 0, by: "T", t: "9:00 AM" }, leader), 200);
  } finally { Math.random = realRandom; }
  const ticks = snaps(IO).filter(k => /-rigCheck$/.test(k));
  assert.ok(ticks.length <= 500 && ticks.length >= 490, "tick snapshots capped at 500 (" + ticks.length + ", " + snaps(IO).length + " total)");
  assert.deepEqual(saveSnaps(), keep, "save and restore snapshots are untouched");
});
