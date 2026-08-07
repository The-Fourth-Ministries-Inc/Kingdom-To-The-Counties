/* Trailer Load List packing FYIs.
   The property that matters: anyone behind the Day PIN can pin a note to a
   bin without touching the bin's contents or needing a leader, and only a
   leader can mark it handled. Drives the real handler against the in-memory
   blob store (same rig as county-scope.test.js). */
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
const { default: handler, __setStoreFactory, autoDayPin, normBinNote, normBinNotes, normBin, normBins } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);

const dp = autoDayPin();
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
const note = (s, id) => (s.binNotes || []).find(n => n.id === id);

const bins = async () => {
  const r = await handler(new Request("https://x/api?part=bins", { headers: { "x-day-pin": dp } }), {});
  return r.json();
};
const theBin = (b, id) => (b.list || []).find(x => x.id === id);

test("normBinNote whitelists fields, caps lengths, and defaults the bin to GEN", () => {
  const n = normBinNote({ id: "n');x", bin: "109<script>", kind: "exploded", item: "y".repeat(400), text: "x".repeat(900), by: "Troy", sneaky: "z" });
  assert.equal(n.id, "nx");
  assert.equal(n.bin, "109script", "bin refs go through idStr");
  assert.equal(n.kind, "note", "an unknown kind falls back to a plain note");
  assert.equal(n.item.length, 300);
  assert.equal(n.text.length, 500);
  assert.ok(!("sneaky" in n));
  assert.equal(normBinNote({ text: "hi" }).bin, "GEN");
  // A missing/extra report is meaningful with only the item named, so it must
  // survive on either field — but a wholly blank note is dropped.
  assert.equal(normBinNotes({ list: [
    { id: "a", text: "", item: "" }, { id: "b", text: "real" }, { id: "c", item: "gaff tape", kind: "missing" }
  ] }).list.length, 2);
});

test("normBin whitelists roster fields and caps the item list", () => {
  const b = normBin({ id: "109<x>", bin: "109!!", sec: "tech", title: "t".repeat(200),
    items: ["ok", "", "  ", "y".repeat(400), ...Array(90).fill("spam")], loc: "l".repeat(300), sneaky: 1 });
  assert.equal(b.id, "109x");
  assert.equal(b.bin, "109!!", "the number on the lid is free text — it is never an id");
  assert.equal(b.title.length, 120);
  assert.equal(b.items.length, 80, "item list is capped");
  assert.ok(!b.items.some(i => !i.trim()), "blank and whitespace-only item lines are dropped");
  assert.equal(b.items[1].length, 300);
  assert.equal(b.loc.length, 200);
  assert.ok(!("sneaky" in b));
  assert.deepEqual(normBins({ list: "junk" }).list, []);
});

test("the roster self-seeds from the team's sheet and is readable by volunteers", async () => {
  const b = await bins();
  assert.ok(b.list.length > 100, "the real roster seeded (got " + b.list.length + ")");
  assert.ok(b.rev > 0, "seeding bumped rev so phones know to download");
  assert.ok(b.trailers.length === 2, "two trailers");
  assert.ok(b.sections.some(s => s.key === "tech") && b.sections.some(s => s.key === "guest"));
  // Spot-check real data made it through intact.
  const mics = theBin(b, "109");
  assert.equal(mics.title, "Microphones");
  assert.equal(mics.loc, "Right-hand side, metal rack");
  assert.ok(mics.items.some(i => i.includes("wireless mic case")));
  // A parenthesised group with commas inside stayed ONE item, not three.
  assert.ok(mics.items.some(i => i.includes("frequency scanner x1") && i.includes("wireless mics x12")),
    "comma-separated contents inside parentheses were not split apart");
  assert.equal(theBin(b, "306").title, "Paakin Tote");
  assert.equal(theBin(b, "350").title, "Green T Shirt Tote");
  assert.ok(theBin(b, "312").empty, "unassigned bin numbers are on the roster, marked empty");
});

test("a volunteer can report a missing item and an extra — no leader needed", async () => {
  await vpost("binNoteAdd", { id: "n1", bin: "109", kind: "missing", item: "corded mic case1 (xm8500 [tb] x5)", by: "Troy", t: "4:12 PM", d: "2026-07-25" });
  await vpost("binNoteAdd", { id: "n2", bin: "306", kind: "extra", item: "spare patch cable", text: "found it loose in the trailer", by: "Rachel", t: "4:15 PM", d: "2026-07-25" });
  await vpost("binNoteAdd", { id: "n3", bin: "GEN", kind: "note", text: "Rear gate latch is sticking", by: "Sam", t: "4:20 PM", d: "2026-07-25" });
  // An outbox retry of an applied write can't duplicate.
  await vpost("binNoteAdd", { id: "n1", bin: "109", kind: "missing", item: "corded mic case1 (xm8500 [tb] x5)", by: "Troy", t: "4:12 PM", d: "2026-07-25" });

  const s = await get();
  assert.equal((s.binNotes || []).length, 3);
  assert.equal(note(s, "n1").kind, "missing");
  assert.equal(note(s, "n1").item, "corded mic case1 (xm8500 [tb] x5)");
  assert.equal(note(s, "n2").kind, "extra");
  assert.equal(note(s, "n3").bin, "GEN");
  assert.equal(note(s, "n1").hidden, false, "a fresh report is open, whatever the client claims");
});

test("the roster is leader-only to change, and an extra can be applied to a bin", async () => {
  const refused = await vpost("binEdit", { id: "e0", bin: "109", patch: { title: "Hacked" } });
  assert.equal(refused.status, 403, "a volunteer cannot rewrite the roster");
  assert.equal(theBin(await bins(), "109").title, "Microphones");

  // Leader edits contents.
  const before = (await bins()).rev;
  await lpost("binEdit", { id: "e1", bin: "109", patch: { loc: "Right-hand side, metal rack — top shelf" },
    items: ["wireless mic case", "corded mic case 2"], by: "Kyle", t: "5:00 PM", d: "2026-07-25" });
  let b = await bins();
  assert.deepEqual(theBin(b, "109").items, ["wireless mic case", "corded mic case 2"]);
  assert.equal(theBin(b, "109").loc, "Right-hand side, metal rack — top shelf");
  assert.ok(b.rev > before, "rev bumped so every phone re-downloads");
  assert.ok(b.log.some(e => e.bin === "109" && e.by === "Kyle"), "the change is logged with a name");

  // A retried edit that already landed is a no-op, not a second log entry.
  const logLen = b.log.length;
  await lpost("binEdit", { id: "e1", bin: "109", patch: { loc: "somewhere else" }, by: "Kyle" });
  b = await bins();
  assert.equal(b.log.length, logLen, "idempotent on the client-generated id");
  assert.equal(theBin(b, "109").loc, "Right-hand side, metal rack — top shelf");

  // Applying a reported extra appends ONE item (can't clobber a concurrent edit).
  await lpost("binItemAdd", { id: "a1", bin: "306", item: "spare patch cable", by: "Kyle", t: "5:05 PM" });
  await lpost("binItemAdd", { id: "a1", bin: "306", item: "spare patch cable", by: "Kyle", t: "5:05 PM" });
  b = await bins();
  assert.equal(theBin(b, "306").items.filter(i => i === "spare patch cable").length, 1, "append is idempotent");

  // Emptying a bin marks it empty; filling it un-marks it.
  await lpost("binEdit", { id: "e2", bin: "313", patch: { title: "Shade Tote 4" }, items: ["1 shade wall"], by: "Kyle" });
  assert.equal(theBin(await bins(), "313").empty, false, "a filled bin is no longer empty");
});

test("the roster is behind the Day PIN like every other board", async () => {
  const r = await handler(new Request("https://x/api?part=bins"), {});
  assert.equal(r.status, 403, "no Day PIN, no roster");
});

test("a deleted bin is tombstoned and does not come back from the starter list", async () => {
  await lpost("binDelete", { bin: "322", by: "Kyle", t: "5:10 PM" });
  let b = await bins();
  assert.ok(!theBin(b, "322"), "removed");
  assert.ok(b.removed.includes("322"), "tombstoned");
  // A later read re-runs the starter merge — it must not resurrect it.
  b = await bins();
  assert.ok(!theBin(b, "322"), "still gone after the self-seeding merge ran again");
});

test("marking a note handled is leader-only, final-state, and reversible", async () => {
  const refused = await vpost("binNoteAck", { id: "n1", hidden: true, by: "Troy", t: "4:20 PM" });
  assert.equal(refused.status, 403, "a volunteer can't hide the team's notes");

  await lpost("binNoteAck", { id: "n1", hidden: true, by: "Kyle", t: "4:30 PM" });
  // A retried ack that already landed is a no-op, not a toggle.
  await lpost("binNoteAck", { id: "n1", hidden: true, by: "Kyle", t: "4:30 PM" });
  let s = await get();
  assert.equal(note(s, "n1").hidden, true);
  assert.equal(note(s, "n1").ackBy, "Kyle");

  await lpost("binNoteAck", { id: "n1", hidden: false });
  s = await get();
  assert.equal(note(s, "n1").hidden, false, "a leader can reopen a note");
  assert.equal(note(s, "n1").ackBy, "");
});

test("FYIs survive the end-of-day reset — the trailer is the same trailer next week", async () => {
  await lpost("reset", {});
  const s = await get();
  assert.equal((s.binNotes || []).length, 3, "reset must not clear packing notes");
});
