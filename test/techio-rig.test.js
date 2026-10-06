/* Tech I/O lineup model (v1.21.0).
   js/techio.js is plain browser script, so it is loaded into a VM context with
   just the app-core globals its pure functions touch. These lock the rules a
   leader relies on when they change people and gear between events: snake and
   NSB numbering stays contiguous, mixdowns follow the mics, a person on two
   positions still has one mix, and splitting a transmitter keeps the packs
   that are already on it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "js/techio.js"), "utf8");

function load(){
  const ctx = {
    esc: s => String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c])),
    LEADER: false
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const T = load();
/* Arrays built inside the VM have another realm's prototype; compare plain copies. */
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
const fresh = () => T.ioRigFix(T.ioClone(T.IO_RIG));
const inp = (rig, id) => { for(const p of rig.positions) for(const r of p.inputs) if(r.id === id) return { p, r }; return null; };
const pack = (rig, id) => rig.packs.find(k => k.id === id);

test("the built-in roster has nothing to fix", () => {
  const rig = fresh();
  const issues = T.ioIssues(rig);
  eq(issues.map(x => x.msg), []);
});

test("the built-in roster carries this season's corrections", () => {
  const rig = fresh();
  const all = rig.positions.flatMap(p => p.inputs.map(r => r.role));
  assert.ok(!all.some(r => /sax/i.test(r)), "Saxophone placeholder is gone");
  assert.ok(!rig.positions.some(p => /unused|spare/i.test(p.name)), "Spare / Unused cards are gone");
  assert.equal(inp(rig, "ag2-di").p.person, "Steve", "Steve is on AG2");
  assert.equal(pack(rig, "pack-5").person, "Steve");
  assert.equal(pack(rig, "pack-5").tx, 5, "Pack 5 is on TX 5, not TX 9");
  assert.equal(pack(rig, "spare-3").person, "Sean");
  eq([pack(rig, "spare-3").tx, pack(rig, "spare-3").leg], [5, "R"]);
  assert.ok(inp(rig, "spotify-l") && inp(rig, "spotify-l").r.foh === "Aux In 2", "Spotify is its own position on FOH Aux In");
  assert.equal(inp(rig, "host-1-in").p.person, "Speaker Left");
  assert.equal(inp(rig, "host-2-in").p.person, "Speaker Right");
  const vox = rig.positions.filter(p => /^(Lead )?Vox · Mic [A-E]$/.test(p.name));
  assert.equal(vox.length, 5);
  for(const p of vox) assert.equal(p.inputs.length, 2, p.name + " has Tuned + Raw");
  assert.equal(inp(rig, "vox-f-in").p.inputs.length, 1, "Mic F has a single input");
});

test("snake channels are contiguous with the snare bottom in", () => {
  const rig = fresh(), D = T.ioDerive(rig);
  const ch = id => D.snake[id];
  eq(["kick","snare-top","snare-bot","tom-1","tom-2","tom-3","oh-l","oh-r"].map(ch), [1,2,3,4,5,6,7,8]);
  eq(["bass-di","ag1-di","ag2-di","eg-l","eg-r","keys-l","keys-r"].map(ch), [9,10,11,12,13,14,15]);
  assert.equal(T.ioSnakeOf(D, inp(rig, "toms-mix").r), "4-6", "toms mixdown follows the toms");
  assert.equal(T.ioSnakeOf(D, inp(rig, "oh-mix").r), "7-8", "overheads mixdown follows the overheads");
  assert.equal(D.snakeUsed, 15);
});

test("dropping the snare bottom closes the gap instead of leaving a hole", () => {
  const rig = fresh();
  inp(rig, "snare-bot").r.on = false;
  const D = T.ioDerive(rig);
  assert.equal(D.snake["snare-bot"], undefined);
  eq(["tom-1","tom-2","tom-3","oh-l","oh-r","bass-di","keys-r"].map(id => D.snake[id]), [3,4,5,6,7,8,14]);
  assert.equal(T.ioSnakeOf(D, inp(rig, "toms-mix").r), "3-5");
  assert.equal(T.ioSnakeOf(D, inp(rig, "oh-mix").r), "6-7");
  eq(T.ioIssues(rig).filter(x => x.lvl === "err"), []);
});

test("NSB inputs follow the stage-box orientation, and AVB follows NSB", () => {
  const rig = fresh();
  let D = T.ioDerive(rig);
  eq(["tom-1","tom-2","tom-3","oh-l","oh-r"].map(id => D.nsb[id]), [1,2,3,4,5]);
  eq(["tom-1","oh-r"].map(id => T.ioAvbOf(D, inp(rig, id).r)), ["41","45"]);
  rig.nsbStart = 12;
  D = T.ioDerive(rig);
  eq(["tom-1","tom-2","tom-3","oh-l","oh-r"].map(id => D.nsb[id]), [12,13,14,15,16]);
  assert.equal(T.ioNsbOf(D, inp(rig, "toms-mix").r), "12-14");
  assert.equal(T.ioAvbOf(D, inp(rig, "tom-1").r), "52");
});

test("snake order can be changed and numbering follows", () => {
  const rig = fresh();
  rig.snakeOrder = ["bass-di", ...rig.snakeOrder.filter(x => x !== "bass-di")];
  const D = T.ioDerive(rig);
  assert.equal(D.snake["bass-di"], 1);
  assert.equal(D.snake["kick"], 2);
});

test("TX n owns aux / Ark outputs 2n-1 and 2n", () => {
  eq(T.ioTxAux(1, ""), [1, 2]);
  eq(T.ioTxAux(4, "L"), [7]);
  eq(T.ioTxAux(4, "R"), [8]);
  eq(T.ioTxAux(5, "L"), [9]);
  eq(T.ioTxAux(8, ""), [15, 16]);
});

test("splitting Mike's TX 4 gives Spare Pack 2 aux 8 — no new line, no lost pack", () => {
  const rig = fresh(), before = rig.packs.length;
  T.ioTxSplit(rig, 4);
  assert.equal(rig.packs.length, before, "no pack invented");
  assert.equal(pack(rig, "pack-4").leg, "L");
  assert.equal(pack(rig, "spare-2").leg, "R");
  eq(T.ioPackMix(rig, pack(rig, "pack-4")).aux, [7]);
  eq(T.ioPackMix(rig, pack(rig, "spare-2")).aux, [8]);
  const mixes = T.ioMixes(rig).filter(m => m.tx === 4);
  eq(mixes.map(m => [m.leg, m.aux[0], m.packs.map(k => k.id)]), [["L", 7, ["pack-4"]], ["R", 8, ["spare-2"]]]);
  // and back again
  eq(T.ioTxMergeClash(rig, 4), [], "a spare pack isn't a person, so no warning");
  T.ioTxMerge(rig, 4);
  eq(T.ioPackMix(rig, pack(rig, "spare-2")).aux, [7, 8]);
});

test("merging two people onto one stereo mix is called out", () => {
  const rig = fresh();
  eq(T.ioTxMergeClash(rig, 3).sort(), ["Alissa", "Annie"]);
  T.ioTxMerge(rig, 3);
  assert.ok(T.ioIssues(rig).some(x => x.lvl === "err" && /Annie and Alissa|Alissa and Annie/.test(x.msg)));
});

test("one person on several positions has one card and one mix", () => {
  const rig = fresh();
  const zach = rig.positions.filter(p => p.active && p.person === "Zach").map(p => p.name);
  eq(zach, ["Lead Vox · Mic A", "Acoustic 1", "Talkback 1"]);
  assert.equal(T.ioPeopleNow(rig).filter(n => n === "Zach").length, 1);
  assert.equal(T.ioPacksOf(rig, "Zach").length, 1);
  const html = T.ioRenderCards(rig, T.ioDerive(rig));
  assert.equal((html.match(/<span class="pn">Zach</g) || []).length, 1, "a single card for Zach");
});

test("swapping a musician is a name change on the position and the pack", () => {
  const rig = fresh();
  inp(rig, "ag2-di").p.person = "Julian";
  assert.ok(T.ioIssues(rig).some(x => /Julian has no IEM pack/.test(x.msg)));
  assert.ok(T.ioIssues(rig).some(x => /Steve, who isn't on any position/.test(x.msg)));
  pack(rig, "pack-5").person = "Julian";
  eq(T.ioIssues(rig), []);
});

test("checks catch the mistakes the old sheet carried", () => {
  const rig = fresh();
  inp(rig, "vox-f-in").p.active = true;
  inp(rig, "vox-f-in").p.person = "Annie";
  inp(rig, "vox-f-in").r.avb = "3"; // same as Mic C
  const msgs = T.ioIssues(rig).map(x => x.msg).join("\n");
  assert.match(msgs, /AVB 3 is used by/);
  rig.snakeSize = 12;
  assert.match(T.ioIssues(rig).map(x => x.msg).join("\n"), /snake needs 15 channels but has 12/);
});

test("stereo pairs may share a console channel; different positions may not", () => {
  const rig = fresh();
  assert.ok(!T.ioIssues(rig).some(x => /FOH ch 13\/14/.test(x.msg)));
  inp(rig, "keys-l").r.foh = "13/14";
  assert.ok(T.ioIssues(rig).some(x => /FOH ch 13\/14/.test(x.msg)));
});

test("a mono transmitter needs every pack on a leg", () => {
  const rig = fresh();
  pack(rig, "spare-3").leg = "";
  assert.ok(T.ioIssues(rig).some(x => x.lvl === "err" && /Spare Pack 3 is on TX 5, which is dual-mono/.test(x.msg)));
});

test("saving keeps the server's checkmarks, not the editor's", () => {
  const cur = fresh(), next = fresh();
  T.ioSetCheck(cur, "kick", true, "MN", "2:01 PM");
  T.ioSetCheck(next, "tom-1", true, "stale", "1:00 PM");
  T.ioMergeChecks(next, cur);
  assert.equal(inp(next, "kick").r.done, true);
  assert.equal(inp(next, "kick").r.by, "MN");
  assert.equal(inp(next, "tom-1").r.done, false);
});

test("progress counts only what is in use this event", () => {
  const rig = fresh();
  const total = T.ioCounts(rig).total;
  inp(rig, "snare-bot").r.on = false;
  assert.equal(T.ioCounts(rig).total, total - 1);
  assert.ok(!rig.positions.find(p => p.id === "vox-f").active);
  T.ioSetCheck(rig, "kick", true, "MN", "x");
  assert.equal(T.ioCounts(rig).done, 1);
  T.ioClearChecks(rig);
  assert.equal(T.ioCounts(rig).done, 0);
});

test("CSV export lists the inputs by AVB and the IEM sheet", () => {
  const rows = T.ioCsvRows(fresh());
  eq(rows[0].slice(0, 3), ["AVB", "Snake", "Patch"]);
  assert.equal(rows[1][0], "1");
  const tom = rows.find(r => r[5] === "Tom 1");
  eq([tom[0], tom[1], tom[2]], ["41", "4", "NSB 1"]);
  const sean = rows.find(r => r[0] === "TX 5" && r[1] === "R");
  eq(sean.slice(2), ["10", "Spare Pack 3", "Sean"]);
});

test("techio.js keeps the house style and loads where it must", () => {
  // Plain ES5-flavoured script like app-core.js: no arrows, template literals, let/const or spread.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "\"\"");
  assert.doesNotMatch(code, /=>|`|\blet\s|\bconst\s|\.\.\./);
  const html = readFileSync(join(root, "index.html"), "utf8");
  const a = html.indexOf('<script src="js/techio.js">'), b = html.indexOf('<script src="js/app-core.js">');
  assert.ok(a > 0 && a < b, "techio.js must load before app-core.js (app-core's boot renders Tech I/O)");
  assert.match(readFileSync(join(root, "sw.js"), "utf8"), /"js\/techio\.js"/, "precached for offline");
});
