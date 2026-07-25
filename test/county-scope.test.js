/* Per-county scoping.
   Exercises the real request handler against an in-memory stand-in for Netlify
   Blobs, because the property that matters — "switching counties swaps the
   whole board without losing the other county's work" — only shows up in the
   interaction between the key scoping, the action handlers and the GET
   payload. */
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
const { default: handler, __setStoreFactory } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);   // in-memory stand-in for Netlify Blobs

const post = (action, payload = {}, extra = {}) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, payload, pin: "999999", ...extra })
}), {});
const get = async () => {
  const r = await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {});
  return r.json();
};

test("counties keep separate boards and switching does not destroy either", async () => {
  // Start on Carroll and do some work.
  await post("setCounty", { county: "carroll" });
  await post("setCheck", { id: "su-sat-0-0", on: true, by: "Zach", t: "8:05 AM", dm: 485 });
  await post("addCheckin", { id: "v1", name: "Rachel", team: "Ambassadors", t: "9:00 AM" });
  await post("addFeedback", { id: "i1", priority: "urgent", title: "Parking sign down", body: "north entrance", by: "Troy", t: "1:00 PM" });

  let s = await get();
  assert.equal(s.county, "carroll");
  assert.ok(s.checklist["su-sat-0-0"], "Carroll checkmark should be present");
  assert.equal(s.checkins.length, 1);
  assert.equal(s.feedback.length, 1);

  // Switch to Cheshire — a fresh board, none of Carroll's data.
  await post("setCounty", { county: "cheshire" });
  s = await get();
  assert.equal(s.county, "cheshire");
  assert.deepEqual(s.checklist, {}, "Cheshire must not inherit Carroll's checkmarks");
  assert.equal(s.checkins.length, 0);
  assert.equal(s.feedback.length, 0);

  // Work on Cheshire.
  await post("addCheckin", { id: "v2", name: "Bethanie", team: "Guest Services", t: "8:40 AM" });
  s = await get();
  assert.equal(s.checkins.length, 1);
  assert.equal(s.checkins[0].name, "Bethanie");

  // Switch back — Carroll is exactly as we left it.
  await post("setCounty", { county: "carroll" });
  s = await get();
  assert.equal(s.county, "carroll");
  assert.ok(s.checklist["su-sat-0-0"], "Carroll's checkmark survived the round trip");
  assert.equal(s.checkins.length, 1);
  assert.equal(s.checkins[0].name, "Rachel");
  assert.equal(s.feedback.length, 1);
  assert.equal(s.feedback[0].title, "Parking sign down");
});

test("head count and decisions are per county", async () => {
  await post("setCounty", { county: "carroll" });
  let epoch = (await get()).tallyEpoch;
  await post("tallySet", { dev: "phoneA", total: 12, by: { Zach: 12 }, epoch });
  await post("decSet",   { dev: "phoneA", total: 3,  by: { Zach: 3 },  epoch });
  let s = await get();
  assert.equal(s.count, 12);
  assert.equal(s.decisions, 3);

  await post("setCounty", { county: "grafton" });
  s = await get();
  assert.equal(s.count, 0, "a new county starts at zero attendance");
  assert.equal(s.decisions, 0, "a new county starts at zero decisions");

  await post("setCounty", { county: "carroll" });
  s = await get();
  assert.equal(s.count, 12, "Carroll's count came back");
  assert.equal(s.decisions, 3);
});

test("the Day PIN is shared across counties, not per county", async () => {
  await post("setCounty", { county: "carroll" });
  await post("setDayPin", { pin: "4321" });
  await post("setCounty", { county: "cheshire" });

  // Right PIN works on the other county's board.
  const ok = await handler(new Request("https://x/api", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verifyDayPin", pin: "4321" })
  }), {});
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.ok, true);

  // Wrong one still fails.
  const bad = await handler(new Request("https://x/api", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verifyDayPin", pin: "0000" })
  }), {});
  assert.equal(bad.status, 403);
});

test("season-long data is NOT county-scoped", async () => {
  await post("setCounty", { county: "carroll" });
  await post("captureAdd", { id: "cap1", lane: "text", name: "Maria", phone: "555", county: "Carroll County", by: "Amy", t: "2:00 PM", d: "2026-07-25" });
  let s = await get();
  assert.equal(s.captureCount, 1);

  await post("setCounty", { county: "cheshire" });
  s = await get();
  assert.equal(s.captureCount, 1, "captures follow the season, not the county board");
});

test("switching counties rejects an unknown county", async () => {
  const r = await post("setCounty", { county: "atlantis" });
  assert.equal(r.status, 400);
});

test("reset clears only the active county and files a season summary", async () => {
  await post("setCounty", { county: "grafton" });
  await post("addCheckin", { id: "g1", name: "Sam", team: "Tech", t: "9:00 AM" });
  await post("reset", {});

  let s = await get();
  assert.equal(s.checkins.length, 0, "the reset county is cleared");

  // Carroll, reset earlier or not, still holds its own check-in.
  await post("setCounty", { county: "carroll" });
  s = await get();
  assert.equal(s.checkins.length, 1, "another county is untouched by the reset");

  const season = await (await post("seasonList", {})).json();
  assert.ok(season.events.length >= 1, "reset filed a season summary");
  assert.ok(season.events.some(e => e.county === "grafton"), "summary records which county it was");
});

test("an existing unscoped board is adopted into the current county on first run", async () => {
  /* Simulates deploying per-county scoping onto a site that already has a day
     in progress: the pre-scoping blobs must not be orphaned. */
  const fresh = mockStore();
  fresh._data.set("core", { value: JSON.stringify({
    checklist: { "su-sat-0-0": { by:"Zach", t:"8:05 AM", dm:485 } },
    announcements: [], feedback: [], praises: [], notes: {},
    event: { name:"Carroll County", date:"2026-07-25" }, funding:{ pct:64, needed:"$60,000" }
  }), etag:"x1" });
  fresh._data.set("checkins", { value: JSON.stringify([{ id:"old1", name:"Rachel", team:"Ambassadors", t:"9:00 AM" }]), etag:"x2" });

  __setStoreFactory(() => fresh);
  try {
    const r = await handler(new Request("https://x/api", { headers:{ "x-leader-pin":"999999" } }), {});
    const s = await r.json();
    assert.ok(s.checklist["su-sat-0-0"], "the in-progress checkmark survived the switch to scoped keys");
    assert.equal(s.checkins.length, 1);
    assert.equal(s.checkins[0].name, "Rachel");
    assert.ok(fresh._data.has("core~carroll"), "data was copied into the current county's scope");
  } finally {
    __setStoreFactory(() => store);   // restore for any later tests
  }
});

test("with nothing set by hand, the automatic Day PIN is what actually unlocks the app", async () => {
  const fresh = mockStore();
  __setStoreFactory(() => fresh);
  try {
    const { autoDayPin } = await import("../netlify/functions/data.mjs");
    const expected = autoDayPin();          // today's event Saturday, MMDD

    const ok = await handler(new Request("https://x/api", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ action:"verifyDayPin", pin: expected })
    }), {});
    assert.equal(ok.status, 200, "the scheduled PIN should unlock the app with no leader setup at all");

    const bad = await handler(new Request("https://x/api", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ action:"verifyDayPin", pin:"0000" })
    }), {});
    assert.equal(bad.status, 403);

    // And a volunteer holding it can actually read the board.
    const board = await handler(new Request("https://x/api", { headers:{ "x-day-pin": expected } }), {});
    const s = await board.json();
    assert.ok(!s.locked, "a volunteer with the scheduled PIN is not locked out");
  } finally {
    __setStoreFactory(() => store);
  }
});
