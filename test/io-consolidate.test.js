/* Tests for the routing-sheet importer (scripts/io-consolidate.mjs).

   The K2C workbook writes the same input list twice — once for the FOH board,
   once for the 32SC monitor console — and the two halves disagree about
   channel numbers on purpose. Everything here is about the merge behaving the
   way the field expects: AVB is the join key, both channel numbers survive,
   and the places where the sheet contradicts ITSELF are preserved rather than
   quietly resolved. The app flags those; the importer must not hide them.

   Run with the rest of the suite:  npm test
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeInputs, buildCards, auxLabel, parseTransmitter, avbNum, locLabel, findGutter,
} from "../scripts/io-consolidate.mjs";

const foh = (o) => ({ side: "foh", chan: "", source: "", role: "", avb: 0, port: "", gear: "", p48: false, note: "", aux: false, ...o });
const sc = (o) => foh({ side: "sc", ...o });

test("avbNum and auxLabel read the sheet's own phrasing", () => {
  assert.equal(avbNum("AVB 41"), 41);
  assert.equal(avbNum(""), 0);
  assert.equal(auxLabel("Aux 1 & 2"), "1 & 2");
  assert.equal(auxLabel("Outputs 13 & 14"), "13 & 14");
  assert.equal(auxLabel("Aux 9"), "9");
  assert.equal(auxLabel(""), "");
});

test("parseTransmitter picks out the dual-mono leg", () => {
  assert.deepEqual(parseTransmitter("IEM Transmitter 1"), { unit: "1", leg: "" });
  assert.deepEqual(parseTransmitter("IEM Transmitter 9 (L)"), { unit: "9", leg: "L" });
  assert.deepEqual(parseTransmitter("IEM Transmitter 9 (R)"), { unit: "9", leg: "R" });
});

test("the two console halves merge on AVB, keeping both channel numbers", () => {
  const merged = mergeInputs(
    [foh({ chan: "1", source: "Zach", role: "Lead Vox", avb: 1, port: "Ark Splitter - Input 1 (from Ip6)", gear: "Wireless Mic A (Tuned)" })],
    [sc({ chan: "1", source: "Zach", role: "Lead Vox", avb: 1, port: "Ark Splitter - Input 1 (from Ip6)", gear: "Wireless Mic A (Tuned)" })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].avb, 1);
  assert.equal(merged[0].foh, "1");
  assert.equal(merged[0].sc, "1");
});

test("a signal only the monitor console carries still lands, with its source", () => {
  // The raw vocal splits exist on the 32SC (ch 28-32) and nowhere on FOH.
  const merged = mergeInputs([], [sc({ chan: "28", source: "Zach", role: "Lead Vox (Raw split)", avb: 6, port: "Ark Splitter - Input 6" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].foh, "");
  assert.equal(merged[0].sc, "28");
  assert.equal(merged[0].source, "Zach");
});

test("one AVB used by two different signals stays as two rows", () => {
  // The sheet really does this: AVB 41 is both Tom 1 and a spare channel.
  const merged = mergeInputs([
    foh({ chan: "23", source: "Kyle", role: "Tom 1", avb: 41, port: "NSB.32 - 1" }),
    foh({ chan: "32", source: "SPARE", role: "Unused Channel", avb: 41, port: "Ark Splitter - Input 32" }),
  ], []);
  assert.equal(merged.length, 2, "collapsing them would hide a real routing clash");
  assert.deepEqual(merged.map((r) => r.role).sort(), ["Tom 1", "Unused Channel"]);
});

test("when the consoles disagree on the port, FOH is the patch point and 32SC rides along", () => {
  const merged = mergeInputs(
    [foh({ chan: "23", source: "Kyle", role: "Toms", avb: 57, port: "NSB.32 - 1" })],
    [sc({ chan: "23", source: "Kyle", role: "Toms", avb: 57, port: "NSB.32 - 12-14" })]
  );
  assert.equal(merged[0].port, "NSB.32 - 1");
  assert.equal(merged[0].altPort, "NSB.32 - 12-14");
});

test("rows sort by AVB, with the aux returns after the stage patch", () => {
  const merged = mergeInputs([
    foh({ chan: "Aux In 1", role: "Tracks (L)", avb: 33, aux: true }),
    foh({ chan: "20", role: "Kick Drum", avb: 25 }),
    foh({ chan: "1", role: "Lead Vox", avb: 1 }),
  ], []);
  assert.deepEqual(merged.map((r) => r.avb), [1, 25, 33]);
  assert.equal(merged[2].aux, true);
});

test("locLabel leads with AVB — the number both consoles agree on", () => {
  assert.equal(locLabel({ avb: 21, port: "Ark Splitter - Input 21" }), "AVB 21 · Ark 21");
  assert.equal(locLabel({ avb: 44, port: "NSB.32 - 4" }), "AVB 44 · NSB 4");
  assert.equal(locLabel({ avb: 33, port: "Personal MBP Network" }), "AVB 33 · Personal MBP Network");
  assert.equal(locLabel({ avb: 0, port: "" }), "");
});

test("findGutter locates the empty column that splits the sheet in half", () => {
  const rows = [
    ["FOH Channel", "Source", null, "32SC Channel", "Source"],
    ["1", "Zach", null, "1", "Zach"],
  ];
  assert.equal(findGutter(rows, 5), 2);
});

const mix = (o) => ({ aux: "", out: "", txUnit: "", txLabel: "", leg: "", mode: "stereo", pack: "", color: "#c7c2b8", name: "", dest: "", share: [], ...o });

test("cards come out in aux order, carrying the mix slot", () => {
  const cards = buildCards(
    [{ avb: 22, foh: "19", sc: "19", source: "Jeanne", role: "Acoustic Guitar 2", port: "Ark Splitter - Input 22", gear: "1x Active DI" }],
    [
      mix({ aux: "1 & 2", out: "1 & 2", txUnit: "1", txLabel: "IEM Transmitter 1", pack: "Pack 1 (Orange)", name: "Karielle", dest: "Lead Vox" }),
      mix({ aux: "9", out: "9", txUnit: "9", txLabel: "IEM Transmitter 9 (L)", leg: "L", mode: "mono", pack: "Pack 5 (Yellow)", name: "Jeanne", dest: "Add'l Vox" }),
    ]
  );
  assert.deepEqual(cards.map((c) => c.name), ["Karielle", "Jeanne"]);
  assert.equal(cards[1].mode, "mono");
  assert.equal(cards[1].leg, "L");
  assert.equal(cards[1].rows.length, 1, "Jeanne's acoustic should attach to her own card");
  assert.equal(cards[1].rows[0].avb, 22);
});

test("house mics and playback are tagged as groups, never as mix holders", () => {
  const cards = buildCards([
    { avb: 12, foh: "7", sc: "7", source: "Host 1", role: "Speaking Mic", port: "Ark Splitter - Input 12", gear: "Wireless Mic G" },
    { avb: 13, foh: "8", sc: "8", source: "Host 2", role: "Speaking Mic", port: "Ark Splitter - Input 13", gear: "Wireless Mic H" },
    { avb: 33, source: "Playback", role: "Tracks (L)", port: "Personal MBP Network", gear: "Mac AVB CoreAudio Send" },
  ], []);
  const house = cards.find((c) => c.name === "House / Host");
  assert.equal(house.kind, "group");
  assert.equal(house.rows.length, 2);
  // Both hosts share a card, so each row has to remember its own source.
  assert.deepEqual(house.rows.map((r) => r.src), ["Host 1", "Host 2"]);
  assert.equal(cards.find((c) => c.name === "Playback").kind, "group");
});

test("an unassigned mix becomes an open slot rather than vanishing", () => {
  const cards = buildCards([], [mix({ aux: "5 & 6", txUnit: "3", txLabel: "IEM Transmitter 3", pack: "Pack 3 (Green)", name: "SPARE" })]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].name, "— open —");
  assert.equal(cards[0].mode, "stereo");
});

test("extra packs riding a mix are kept against that mix, not given their own", () => {
  const cards = buildCards([], [mix({
    aux: "1 & 2", txUnit: "1", txLabel: "IEM Transmitter 1", pack: "Pack 1 (Orange)", name: "Karielle",
    share: [{ pack: '"Extra" Pack', name: "SPARE", dest: "Add'l Vox" }],
  })]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].share.length, 1);
  assert.equal(cards[0].share[0].pack, '"Extra" Pack');
});
