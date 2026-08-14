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
  sheetToRows,
} from "../scripts/io-consolidate.mjs";

const foh = (o) => ({ side: "foh", chan: "", chanLabel: "", source: "", role: "", avb: 0, port: "", gear: "", p48: false, note: "", aux: false, ...o });
const sc = (o) => foh({ side: "sc", ...o });

/* Minimal stand-in for the bits of the xlsx API sheetToRows touches. */
const XLSX_STUB = {
  utils: {
    decode_range: (ref) => {
      const [a, b] = ref.split(":");
      const cell = (s) => {
        const m = s.match(/^([A-Z]+)(\d+)$/);
        let c = 0;
        for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
        return { c: c - 1, r: Number(m[2]) - 1 };
      };
      return { s: cell(a), e: cell(b) };
    },
    encode_cell: ({ r, c }) => {
      let s = "", n = c + 1;
      while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - m) / 26) | 0; }
      return s + (r + 1);
    },
  },
};

/* This is the bug that silently emptied a third of the import: a merged cell
   stores its value ONLY in the top-left slot, so every other row in the block
   read back null even though the sheet shows the value on all of them. That is
   where the source names down the drum block, the playback ports and every
   note written once against a group of rows lived. */
test("sheetToRows expands merged cells the way the sheet renders them", () => {
  const sheet = {
    "!ref": "A1:C3",
    "!merges": [{ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } }],  // A1:A3 = "Kyle"
    A1: { v: "Kyle" },
    B1: { v: "Kick" }, B2: { v: "Snare" }, B3: { v: "Tom 1" },
    C1: { v: "Hybrid Drum Mic Setup" },
  };
  const rows = sheetToRows(sheet, XLSX_STUB);
  assert.deepEqual(rows.map((r) => r[0]), ["Kyle", "Kyle", "Kyle"]);
  assert.deepEqual(rows.map((r) => r[1]), ["Kick", "Snare", "Tom 1"]);
  // Unmerged blanks stay blank — expansion must not become a general fill-down.
  assert.deepEqual(rows.map((r) => r[2]), ["Hybrid Drum Mic Setup", null, null]);
});

test("sheetToRows leaves a sheet with no merges untouched", () => {
  const rows = sheetToRows({ "!ref": "A1:B2", A1: { v: "a" }, B2: { v: "d" } }, XLSX_STUB);
  assert.deepEqual(rows, [["a", null], [null, "d"]]);
});

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

test("both consoles' hardware and notes survive when they disagree", () => {
  // Real case: the playback Mac is a "CoreAudio Send" to FOH and a "Digital
  // Return" to the 32SC, and each half writes its own note about it.
  const merged = mergeInputs(
    [foh({ chan: "Aux In 1", role: "Tracks (L)", avb: 33, gear: "Mac AVB CoreAudio Send", note: "MultiTracks Playback stem (Left)", aux: true })],
    [sc({ chan: "Aux In 1", role: "Tracks (L)", avb: 33, gear: "Mac AVB Digital Return", note: "Streamed to Aux In 1", aux: true })]
  );
  assert.equal(merged[0].gear, "Mac AVB CoreAudio Send");
  assert.equal(merged[0].altGear, "Mac AVB Digital Return");
  assert.equal(merged[0].note, "MultiTracks Playback stem (Left)");
  assert.equal(merged[0].altNote, "Streamed to Aux In 1");
});

test("agreeing halves don't produce a redundant alternate", () => {
  const merged = mergeInputs(
    [foh({ chan: "1", role: "Lead Vox", avb: 1, gear: "Wireless Mic A", note: "Primary Lead Vocalist" })],
    [sc({ chan: "1", role: "Lead Vox", avb: 1, gear: "Wireless Mic A", note: "Primary Lead Vocalist" })]
  );
  assert.equal(merged[0].altGear, "");
  assert.equal(merged[0].altNote, "");
});

test("a signal only one half carries still keeps that half's hardware and note", () => {
  const merged = mergeInputs([], [sc({ chan: "Aux In 2 (L)", role: "Click", avb: 35, gear: "Mac AVB Digital Return", port: "Personal MBP Network", note: "Streamed to Aux In 2", aux: true })]);
  assert.equal(merged[0].gear, "Mac AVB Digital Return");
  assert.equal(merged[0].port, "Personal MBP Network");
  assert.equal(merged[0].note, "Streamed to Aux In 2");
  assert.equal(merged[0].altGear, "", "nothing to compare against, so no alternate");
});

test("the stereo-pair marker on a channel label is kept", () => {
  const merged = mergeInputs([
    foh({ chan: "13/14", chanLabel: "13/14 (stereo)", role: "Electric Guitar (L)", avb: 19 }),
    foh({ chan: "20", chanLabel: "20", role: "Kick Drum", avb: 25 }),
  ], []);
  assert.equal(merged.find((r) => r.avb === 19).stereo, true);
  assert.equal(merged.find((r) => r.avb === 25).stereo, false);
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

test("the sheet's own Source wording is kept even on a person's own card", () => {
  // "Zach TB" and "Zach AG" are how the sheet tells his talkback from his
  // acoustic; collapsing both to "Zach" loses the distinction at the patch bay.
  const cards = buildCards([
    { avb: 14, foh: "9", source: "Zach TB", role: "Stage Talkback", gear: "Wired TB 1" },
    { avb: 21, foh: "18", source: "Zach AG", role: "Acoustic Guitar 1", gear: "1x Active DI" },
  ], [mix({ aux: "3 & 4", txUnit: "2", txLabel: "IEM Transmitter 2", pack: "Pack 2 (Red)", name: "Zach" })]);
  const zach = cards.find((c) => c.name === "Zach");
  assert.equal(zach.rows.length, 2, "both aliases resolve to the one card");
  assert.deepEqual(zach.rows.map((r) => r.src), ["Zach TB", "Zach AG"]);
});

test("notes ride along on the emitted rows", () => {
  const cards = buildCards(
    [{ avb: 25, foh: "20", source: "Kyle", role: "Kick Drum", gear: "1. Kick Mic", note: "Hybrid Drum Mic Setup" }],
    [mix({ aux: "15 & 16", txUnit: "8", txLabel: "IEM Transmitter 8", pack: "Pack 8 (Blue)", name: "Kyle" })]
  );
  assert.equal(cards.find((c) => c.name === "Kyle").rows[0].note, "Hybrid Drum Mic Setup");
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
