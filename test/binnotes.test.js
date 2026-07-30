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
const { default: handler, __setStoreFactory, autoDayPin, normBinNote, normBinNotes } = await import("../netlify/functions/data.mjs");
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

test("normBinNote whitelists fields, caps lengths, and defaults the bin to GEN", () => {
  const n = normBinNote({ id: "n');x", bin: "002-007<script>", text: "x".repeat(900), by: "Troy", sneaky: "z" });
  assert.equal(n.id, "nx");
  assert.equal(n.bin, "002-007scrip", "bin refs go through idStr (capped at 12)");
  assert.equal(n.text.length, 500);
  assert.ok(!("sneaky" in n));
  assert.equal(normBinNote({ text: "hi" }).bin, "GEN");
  // Notes that lost their text are dropped on read, not rendered as blanks.
  assert.equal(normBinNotes({ list: [{ id: "a", text: "" }, { id: "b", text: "real" }] }).list.length, 1);
});

test("a volunteer can pin an FYI to a bin — and a general one — without any leader", async () => {
  await vpost("binNoteAdd", { id: "n1", bin: "001-014", text: "Only 10 of the 12 long XLRs are in here", by: "Troy", t: "4:12 PM", d: "2026-07-25" });
  await vpost("binNoteAdd", { id: "n2", bin: "GEN", text: "Someone added an extra patch cable — went into 002-007", by: "Rachel", t: "4:15 PM", d: "2026-07-25" });
  // An outbox retry of an applied write can't duplicate.
  await vpost("binNoteAdd", { id: "n1", bin: "001-014", text: "Only 10 of the 12 long XLRs are in here", by: "Troy", t: "4:12 PM", d: "2026-07-25" });

  const s = await get();
  assert.equal((s.binNotes || []).length, 2);
  assert.equal(note(s, "n1").bin, "001-014");
  assert.equal(note(s, "n2").bin, "GEN");
  assert.equal(note(s, "n1").hidden, false, "a fresh note is open, whatever the client claims");
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
  assert.equal((s.binNotes || []).length, 2, "reset must not clear packing notes");
});
