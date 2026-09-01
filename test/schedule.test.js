/* Automatic Day PIN + county rollover.
   The rule: the Day PIN is the event's Saturday as MMDD, an event stays
   current through its Sunday (the rain date), and the next event takes over on
   the Monday following. Date maths is exactly the kind of thing that is
   quietly wrong for one weekend a season, so it is pinned down here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentEvent, autoDayPin, pinForDate, scheduledEvent, countyDeburr } from "../netlify/functions/data.mjs";

test("the PIN is the event Saturday as MMDD", () => {
  assert.equal(pinForDate("2026-07-25"), "0725");
  assert.equal(pinForDate("2026-06-13"), "0613");
  assert.equal(pinForDate("2026-10-10"), "1010");
});

test("an event is current on its own Saturday", () => {
  assert.equal(currentEvent("2026-07-25").key, "carroll");
  assert.equal(autoDayPin("2026-07-25"), "0725");
});

test("it stays put on the Sunday — the rain date must not change the PIN", () => {
  assert.equal(currentEvent("2026-07-26").key, "carroll");
  assert.equal(autoDayPin("2026-07-26"), "0725");
});

test("it rolls to the next county on the Monday following", () => {
  assert.equal(currentEvent("2026-07-27").key, "cheshire");
  assert.equal(autoDayPin("2026-07-27"), "0815");
});

test("it holds the next event all the way through the gap week", () => {
  // Nothing happens between Jul 27 and Aug 15 — Cheshire stays queued up.
  for(const d of ["2026-07-28", "2026-08-01", "2026-08-10", "2026-08-14"]){
    assert.equal(currentEvent(d).key, "cheshire", "on " + d);
    assert.equal(autoDayPin(d), "0815", "on " + d);
  }
});

test("back-to-back weekends roll correctly", () => {
  // Cheshire Aug 15 → Belknap Aug 22, only one week apart.
  assert.equal(currentEvent("2026-08-15").key, "cheshire");
  assert.equal(currentEvent("2026-08-16").key, "cheshire");   // Sunday
  assert.equal(currentEvent("2026-08-17").key, "belknap");    // Monday
  assert.equal(autoDayPin("2026-08-17"), "0822");
  assert.equal(currentEvent("2026-08-22").key, "belknap");
  assert.equal(currentEvent("2026-08-23").key, "belknap");    // Sunday
  assert.equal(currentEvent("2026-08-24").key, "coos");       // Monday
  assert.equal(currentEvent("2026-08-31").key, "coos");       // Laura's Monday 9:50 PM
  assert.equal(currentEvent("2026-09-01").key, "coos");
});

test("Coös / Coos / coos is one county", () => {
  assert.equal(countyDeburr("Coös"), "coos");
  assert.equal(countyDeburr("Coos"), "coos");
  assert.equal(countyDeburr("coos"), "coos");
  assert.equal(countyDeburr("Coös County"), "coos county");
  assert.equal(scheduledEvent("2026-08-31").key, "coos");
  assert.equal(scheduledEvent("2026-08-31").name, "Coös County");
  assert.match(scheduledEvent("2026-08-31").place, /Gorham/);
});

test("every event in the season resolves to itself on its own day", () => {
  const expected = [
    ["2026-06-13", "sullivan",   "0613"],
    ["2026-06-27", "grafton",    "0627"],
    ["2026-07-11", "strafford",  "0711"],
    ["2026-07-25", "carroll",    "0725"],
    ["2026-08-15", "cheshire",   "0815"],
    ["2026-08-22", "belknap",    "0822"],
    ["2026-09-05", "coos",       "0905"],
    ["2026-10-10", "rockingham", "1010"]
  ];
  for(const [date, key, pin] of expected){
    assert.equal(currentEvent(date).key, key, "county on " + date);
    assert.equal(autoDayPin(date), pin, "pin on " + date);
  }
});

test("every scheduled date really is a Saturday", () => {
  const expected = ["2026-06-13","2026-06-27","2026-07-11","2026-07-25","2026-08-15","2026-08-22","2026-09-05","2026-10-10"];
  for(const d of expected){
    assert.equal(new Date(d + "T12:00:00Z").getUTCDay(), 6, d + " should be a Saturday");
  }
});

test("before the season the first event is queued; after it, the last one sticks", () => {
  assert.equal(currentEvent("2026-01-01").key, "sullivan");
  assert.equal(autoDayPin("2026-01-01"), "0613");
  assert.equal(currentEvent("2026-12-25").key, "rockingham");
  assert.equal(autoDayPin("2026-12-25"), "1010");
});
