/* Server-side normalizer tests.
   These cover the pure functions in netlify/functions/data.mjs — the layer
   that decides what client input is allowed to become stored data. They run
   with no network and no Netlify Blobs:  npm test

   Why these in particular: every one of them is a rule we rely on elsewhere.
   If idStr stops stripping quotes, the onclick handlers in index.html become
   injectable again; if normCore drops a field, a whole feature silently
   stops persisting. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normCore, normPrompter, normChurches, normIO, normIssue,
  normCheckin, normCapture, normCaptures, compactTally, idStr, safeUrl
} from "../netlify/functions/data.mjs";

test("idStr strips anything that could break out of an onclick attribute", () => {
  assert.equal(idStr("x');fetch('//evil')//"), "xfetchevil");
  assert.equal(idStr('a"b<c>d'), "abcd");
  assert.equal(idStr("Good_id-123"), "Good_id-123");
  assert.equal(idStr(null), "");
  assert.equal(idStr("a".repeat(80)).length, 40);
});

test("safeUrl only lets http(s) through", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>x</script>"), "");
  assert.equal(safeUrl("vbscript:x"), "");
  assert.equal(safeUrl("https://example.org"), "https://example.org");
  assert.equal(safeUrl("http://example.org"), "http://example.org");
  assert.equal(safeUrl("example.org"), "https://example.org");
  assert.equal(safeUrl(""), "");
});

test("normCore keeps the shape the client depends on", () => {
  const c = normCore({});
  for(const k of ["checklist","extras","notes","announcements","feedback","praises","event","dayPin","funding"]){
    assert.ok(k in c, "missing " + k);
  }
  assert.deepEqual(c.extras, []);
  assert.equal(typeof c.event.shift, "number");
});

test("normCore clamps the rain-date shift and funding percentage", () => {
  assert.equal(normCore({ event:{ shift: 9 } }).event.shift, 2);
  assert.equal(normCore({ event:{ shift: -4 } }).event.shift, 0);
  assert.equal(normCore({ event:{ shift: "1" } }).event.shift, 1);
  assert.equal(normCore({ funding:{ pct: 900 } }).funding.pct, 100);
  assert.equal(normCore({ funding:{ pct: -5 } }).funding.pct, 0);
  assert.equal(normCore({ funding:{ pct: "abc" } }).funding.pct, 64);
});

test("normCore retires the old day PIN but keeps a custom one", () => {
  assert.equal(normCore({ dayPin: "0627" }).dayPin, "0711");
  assert.equal(normCore({ dayPin: "4242" }).dayPin, "4242");
});

test("leader-added checklist extras are whitelisted and capped", () => {
  const c = normCore({ extras: [
    { id: "ok-1", day: "fri", cat: "tech", text: "Extra fuel", due: 600, by: "Zach", sneaky: "x" },
    { id: "bad'id", day: "nope", cat: "nope", text: "Odd one", due: 99999 },
    { id: "empty", day: "sat", cat: "log", text: "" }               // dropped: no text
  ]});
  assert.equal(c.extras.length, 2);
  assert.equal(c.extras[0].id, "ok-1");
  assert.ok(!("sneaky" in c.extras[0]));
  assert.equal(c.extras[1].id, "badid");   // quote stripped
  assert.equal(c.extras[1].day, "sat");    // invalid day falls back
  assert.equal(c.extras[1].cat, "log");    // invalid cat falls back
  assert.equal(c.extras[1].due, 1439);     // clamped into the day
});

test("normIssue validates priority and neutralizes client-set moderation flags", () => {
  const it = normIssue({ id:"i1", priority:"bogus", title:"t", body:"b", hidden:"yes", ackBy:"x" });
  assert.equal(it.priority, "med");
  assert.equal(it.hidden, true);           // coerced to boolean, not the string
  assert.equal(typeof it.ackBy, "string");
  assert.equal(normIssue({ priority:"urgent" }).priority, "urgent");
  assert.ok(normIssue({}).id.length > 0);  // an id is always assigned
});

test("comment ids are sanitized so retry-dedupe can't be spoofed with markup", () => {
  const it = normIssue({ comments: [{ cid: "c1'x", name:"A", text:"hi", t:"1:00 PM" }] });
  assert.equal(it.comments[0].cid, "c1x");
});

test("normCheckin caps field lengths", () => {
  const c = normCheckin({ name: "n".repeat(200), team: "t".repeat(200), attested: 1 });
  assert.equal(c.name.length, 40);
  assert.equal(c.team.length, 40);
  assert.equal(c.attested, true);
});

test("normCapture validates response type and follow-up state", () => {
  assert.equal(normCapture({ resp:"salvation" }).resp, "salvation");
  assert.equal(normCapture({ resp:"nonsense" }).resp, "");
  assert.equal(normCapture({}).st, "new");
  assert.equal(normCapture({ st:"entered" }).st, "entered");
  assert.equal(normCapture({ st:"hacked" }).st, "new");
  assert.equal(normCapture({ lane:"weird" }).lane, "text");
});

test("normCaptures keeps at most the ceiling", () => {
  const many = Array.from({ length: 1200 }, (_, i) => ({ id: "c" + i, name: "n" }));
  assert.equal(normCaptures(many).length, 1000);
  assert.deepEqual(normCaptures("not an array"), []);
});

test("normIO whitelists roster fields and makes row ids attribute-safe", () => {
  const io = normIO({ list: [{
    id: "p'1", name: "Drums", color: "javascript:x", evil: "gone",
    rows: [{ id: "r'1", role: "Kick", gear: "D6", done: "truthy", by: "Z", t: "1:00 PM" }]
  }]});
  assert.equal(io.list[0].id, "p1");
  assert.equal(io.list[0].color, "#c7c2b8");    // invalid colour falls back
  assert.ok(!("evil" in io.list[0]));
  assert.equal(io.list[0].rows[0].id, "r1");
  assert.equal(io.list[0].rows[0].done, true);
  assert.deepEqual(normIO(null).list, []);
});

/* v1.16.0 — the table views read these fields off the stored roster. If the
   normalizer drops one, the Inputs table loses a whole column and the
   mono/stereo collapse silently forgets which transmitter leg a mix is on. */
test("normIO keeps the routing and IEM-mix fields the table views need", () => {
  const io = normIO({ list: [{
    id: "pack5", name: "Jeanne", pack: "Pack 5", color: "#F2CB05",
    aux: "9", out: "9", txUnit: "9", leg: "l", mode: "mono", dest: "Add'l Vox",
    kind: "", share: [{ pack: "Spare Pack 1", name: "SPARE", dest: "Add'l Vox" }],
    rows: [{ id: "r1", role: "Overhead (L)", avb: "44", foh: "26", sc: "",
             port: "NSB.32 - 4", altPort: "NSB.32 - 15-16", src: "Kyle", p48: 1,
             note: "Hybrid Drum Mic Setup", altNote: "Streamed to Aux In 1",
             altGear: "Mac AVB Digital Return", stereo: 1 }]
  }]});
  const p = io.list[0], r = p.rows[0];
  assert.equal(p.aux, "9");
  assert.equal(p.leg, "L");                 // normalised to upper case
  assert.equal(p.mode, "mono");
  assert.equal(p.share[0].pack, "Spare Pack 1");
  assert.equal(r.avb, "44");
  assert.equal(r.foh, "26");
  assert.equal(r.port, "NSB.32 - 4");
  assert.equal(r.altPort, "NSB.32 - 15-16");
  assert.equal(r.src, "Kyle");
  assert.equal(r.p48, true);
  assert.equal(r.note, "Hybrid Drum Mic Setup");
  assert.equal(r.altNote, "Streamed to Aux In 1");
  assert.equal(r.altGear, "Mac AVB Digital Return");
  assert.equal(r.stereo, true);
});

test("normIO rejects an unknown mix mode rather than storing it", () => {
  assert.equal(normIO({ list: [{ id: "a", mode: "quadraphonic" }] }).list[0].mode, "none");
  assert.equal(normIO({ list: [{ id: "a", leg: "X" }] }).list[0].leg, "");
});

test("normIO carries the PA output buses alongside the roster", () => {
  const io = normIO({ buses: [
    { id: "b'1", bus: "Aux 1 & 2", sig: "Stereo Subgroup", dest: "NSB 32.16 - Output 1 & 2",
      hw: "Main Venue Subwoofers L/R", purpose: "Low-frequency system punch", evil: "gone" },
    { id: "b2", bus: "Aux 7 - Unused", off: 1 }
  ]});
  assert.equal(io.buses[0].id, "b1");
  assert.equal(io.buses[0].hw, "Main Venue Subwoofers L/R");
  assert.ok(!("evil" in io.buses[0]));
  assert.equal(io.buses[1].off, true);
  assert.deepEqual(normIO(null).buses, []);
});

test("compactTally converts legacy delta logs and clamps negatives", () => {
  const legacy = compactTally([{ delta: 3, by: "Amy" }, { delta: 2, by: "Amy" }, { delta: 1, by: "Bo" }]);
  assert.equal(legacy.total, 6);
  assert.equal(legacy.by.Amy, 5);
  assert.equal(legacy.by.Bo, 1);
  const absolute = compactTally({ total: 10, by: { Amy: 10 } });
  assert.equal(absolute.total, 10);
  const negative = compactTally({ total: -5, by: { Amy: -2 } });
  assert.equal(negative.total, 0);
  assert.equal(negative.by.Amy, 0);
});

test("normPrompter tombstones survive and script ids are sanitized", () => {
  const p = normPrompter({ removed: ["a", "b"], scripts: [{ id: "s'1", title: "T", body: "B" }] });
  assert.deepEqual(p.removed, ["a", "b"]);
  assert.equal(p.scripts[0].id, "s1");
  assert.equal(p.scripts[0].done, null);
});

test("normChurches forces safe website links and validates alignment", () => {
  const c = normChurches({ list: [
    { id:"c1", name:"First Baptist", website:"javascript:alert(1)", align:"bogus" },
    { id:"c2", name:"Grace", website:"grace.org", align:"strong", interest: 99 }
  ]});
  assert.equal(c.list[0].website, "");
  assert.equal(c.list[0].align, "unverified");
  assert.equal(c.list[1].website, "https://grace.org");
  assert.equal(c.list[1].align, "strong");
  assert.equal(c.list[1].interest, 5);       // clamped to the 0-5 scale
  assert.equal(c.list[1].state, "NH");       // default state
});

test("normChurches always returns the template object", () => {
  const c = normChurches({});
  assert.deepEqual(c.tpl, { subject: "", email: "", sms: "" });
  assert.equal(c.rev, 0);
  assert.deepEqual(c.list, []);
});
