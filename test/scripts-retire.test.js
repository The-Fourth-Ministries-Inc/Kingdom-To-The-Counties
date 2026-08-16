/* Counties we've already been to fall off the Recording Studio board.
   The board is season-long, so without a rule it only grows: by August a
   volunteer scrolls past Sullivan, Grafton and Strafford — invitations to
   Saturdays that already happened — to reach the county they're filming for.
   The rule is the Day PIN's rule (current through the Sunday rain date, gone
   the Monday after), and the thing that must never happen is a script being
   retired that isn't ours to retire: a leader's custom-event script has no
   county and therefore no expiry.
   Date maths plus a filter is exactly the combination that is quietly wrong
   for one weekend a season, so it is pinned down here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const { default: handler, __setStoreFactory, countyRetired, scriptCounty, scriptRetired, currentEvent }
  = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);

/* The season, as the app ships it. Kept here in full so a schedule change has
   to be made deliberately in three places rather than sliding through. */
const SEASON = [
  ["sullivan",   "2026-06-13"], ["grafton",    "2026-06-27"],
  ["strafford",  "2026-07-11"], ["carroll",    "2026-07-25"],
  ["cheshire",   "2026-08-15"], ["belknap",    "2026-08-22"],
  ["coos",       "2026-09-05"], ["rockingham", "2026-10-10"]
];

const post = (action, payload = {}) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, payload, pin: "999999" })
}), {});
const get = async () => {
  const r = await handler(new Request("https://x/api", { headers: { "x-leader-pin": "999999" } }), {});
  return r.json();
};
const board = async () => (await get()).prompter.scripts;
const stored = () => JSON.parse(store._data.get("prompter").value).scripts;

/* Strafford was July 11th 2026. Every "already been there" assertion below
   uses it, so these tests stay true for every day after that weekend rather
   than only while the 2026 season is running. */
const STRAFFORD = {
  id: "strafford-Z",
  event: "Strafford County — Jul 11 · Rochester Fairgrounds",
  title: "Script Z — Come As You Are",
  body: "Hey — I want to tell you about something happening in Strafford County…"
};

test("a county retires the Monday after its event, not before", () => {
  assert.equal(countyRetired("carroll", "2026-07-24"), false, "the Friday before");
  assert.equal(countyRetired("carroll", "2026-07-25"), false, "its own Saturday");
  assert.equal(countyRetired("carroll", "2026-07-26"), false, "the Sunday rain date must keep the script");
  assert.equal(countyRetired("carroll", "2026-07-27"), true,  "the Monday following");
  assert.equal(countyRetired("carroll", "2026-12-25"), true);
  // Back-to-back weekends: Cheshire Aug 15 → Belknap Aug 22.
  assert.equal(countyRetired("cheshire", "2026-08-16"), false);
  assert.equal(countyRetired("cheshire", "2026-08-17"), true);
  assert.equal(countyRetired("belknap",  "2026-08-17"), false, "next week's county is not retired by this week's rollover");
});

test("the whole season retires in order and nothing retires early", () => {
  for(const [, date] of SEASON){
    // On the Monday after any event, exactly the counties up to and including
    // it are gone and every later one is still on the board.
    const monday = nextDay(nextDay(date));
    for(const [other, otherDate] of SEASON){
      assert.equal(countyRetired(other, monday), otherDate <= date, other + " on " + monday);
    }
  }
  assert.equal(countyRetired("sullivan", "2026-06-15"), true, "the first county goes first");
  assert.equal(countyRetired("rockingham", "2026-10-11"), false, "the last county holds through its Sunday");
  assert.equal(countyRetired("rockingham", "2026-10-12"), true, "…and then the season is done");
});

test("a script is placed by its id prefix, or failing that its event line", () => {
  assert.equal(scriptCounty({ id: "strafford-A", event: "" }), "strafford");
  assert.equal(scriptCounty({ id: "rockingham-C", event: "" }), "rockingham");
  // A leader-added script gets a uid(), so the event string has to carry it —
  // including Coös, whose ö must still match the "coos" key.
  assert.equal(scriptCounty({ id: "m2k9xq3jab7c", event: "Coös County — Sep 5 · Gorham Town Common" }), "coos");
  assert.equal(scriptCounty({ id: "abc123", event: "Belknap County — Aug 22 · Belknap 4-H Fairgrounds" }), "belknap");
});

test("anything we cannot place in the season is never retired", () => {
  // The editor's "Other / custom event…" escape hatch — a rally, a fundraiser,
  // an evergreen invite. Not ours to expire, whatever the date says.
  for(const sc of [
    { id: "promo1", event: "Manchester Youth Rally — Nov 7" },
    { id: "evergreen", event: "" },
    { id: "hillsborough-A", event: "Hillsborough County — Jul 4" },  // not on the schedule
    {}, null
  ]){
    assert.equal(scriptRetired(sc, "2026-12-25"), false, JSON.stringify(sc));
  }
  assert.equal(countyRetired("", "2026-12-25"), false);
  assert.equal(countyRetired("nashua", "2026-12-25"), false);
});

test("a past county's scripts are never seeded onto a fresh board", async () => {
  const scripts = await board();
  assert.ok(scripts.length, "the board still self-seeds the counties ahead of us");
  const early = scripts.filter(sc => scriptRetired(sc));
  assert.deepEqual(early.map(s => s.id), [], "a phone must not receive scripts for counties we've been to");
  assert.ok(!stored().some(sc => sc.id === "strafford-A"), "and they are not written to storage either");
});

test("a past county's script leaves the board but is not destroyed", async () => {
  await post("promptAdd", { script: STRAFFORD });
  assert.ok(stored().some(sc => sc.id === STRAFFORD.id), "the write itself still lands");
  const scripts = await board();
  assert.ok(!scripts.some(sc => sc.id === STRAFFORD.id), "Strafford is off the board — that Saturday has passed");
  assert.ok(stored().some(sc => sc.id === STRAFFORD.id),
    "…but it is filtered, not deleted: fixing a date in SCHEDULE must bring the county back, and Laura's record of who filmed what survives");
});

test("a custom-event script keeps its place on the board", async () => {
  const rally = { id: "rally1", event: "Manchester Youth Rally — Nov 7", title: "Rally invite", body: "Come out on the 7th…" };
  await post("promptAdd", { script: rally });
  assert.ok((await board()).some(sc => sc.id === rally.id), "no county, no expiry");
});

test("a stale phone cannot seed the whole season back onto an empty board", async () => {
  store._data.delete("prompter");
  await post("promptSeed", { scripts: [STRAFFORD, {
    id: "rockingham-Z", event: "Rockingham County — Oct 10 · Star Speedway", title: "Script Z", body: "October 10th…"
  }] });
  assert.ok(!stored().some(sc => sc.id === STRAFFORD.id), "the past county is dropped from the seed");
  assert.ok(stored().some(sc => sc.id === "rockingham-Z"), "the rest of the season is seeded as normal");
  store._data.delete("prompter");
});

/* The phone mirrors this rule offline (js/counties.js), which means the event
   dates now exist twice. SCHEDULE in data.mjs is the authority; this is the
   tripwire, because a client roster that is one week out would hide a county
   the week of its own event. */
test("the county roster the phone ships with matches the server's schedule", () => {
  const src = readFileSync(new URL("../js/counties.js", import.meta.url), "utf8");
  const m = src.match(/var COUNTIES\s*=\s*(\[[\s\S]*?\n\]);/);
  assert.ok(m, "COUNTIES literal not found in js/counties.js");
  const COUNTIES = new Function("return " + m[1])();

  assert.deepEqual(COUNTIES.map(c => c.key), SEASON.map(([key]) => key),
    "same counties, same order as SCHEDULE in data.mjs");
  for(const c of COUNTIES){
    assert.match(c.date || "", /^\d{4}-\d{2}-\d{2}$/, c.key + " needs an ISO event date");
    assert.equal(new Date(c.date + "T12:00:00Z").getUTCDay(), 6, c.key + " should fall on a Saturday");
    assert.equal(currentEvent(c.date).key, c.key, c.key + " should be the current event on its own date");
    /* Three probes pin the server's date for this key to exactly c.date:
       not retired on the Saturday, not retired on the Sunday, retired on the
       Monday. Any drift in either direction fails one of them. */
    assert.equal(countyRetired(c.key, c.date), false, c.key + " retired on its own event day");
    assert.equal(countyRetired(c.key, nextDay(c.date)), false, c.key + " retired on its rain date");
    assert.equal(countyRetired(c.key, nextDay(nextDay(c.date))), true, c.key + " still live the Monday after");
  }
});

function nextDay(iso){
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
