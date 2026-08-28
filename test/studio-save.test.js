/* Recording Studio save/share + permission copy, and the leader scrubber
   leaving the Now tab. Website QA (v1.18.2) plus Zach's follow-ups. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const html = read("index.html");
const studio = read("js/counties.js");

function section(id) {
  const re = new RegExp('<section[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</section>');
  const m = html.match(re);
  assert.ok(m, "missing #" + id);
  return m[1];
}

test("Now / Event Day has no leader time-scrubber", () => {
  const now = section("page-now");
  assert.equal(/Leader preview/.test(now), false);
  assert.equal(/scrub the day/.test(now), false);
  assert.equal(/simRange/.test(now), false);
  assert.equal(/type="range"/.test(now), false);
  assert.equal(/simLock/.test(now), false);
  assert.equal(/simBody/.test(now), false);
});

test("Leader preview lives only on the leader dashboard", () => {
  const dash = section("page-dashboard");
  assert.match(dash, /id="dashBody"/);
  assert.match(dash, /id="simRange"/);
  assert.match(dash, /Leader preview — scrub the day to test it/);
  assert.equal(/id="simRange"/.test(section("page-now")), false);
});

test("Recording Studio permission copy is in the UI before camera/mic", () => {
  const studioPage = section("page-prompter");
  assert.match(studioPage, /id="tpPermCopy"/);
  assert.match(studioPage, /Camera/);
  assert.match(studioPage, /Microphone/);
  assert.match(studioPage, /If you tap Block/);
  assert.match(html, /id="tpTips"[\s\S]*Camera and Microphone/);
  const capture = section("page-capture");
  assert.match(capture, /id="capPhotoPerm"/);
  assert.match(capture, /id="capAudioPerm"/);
  assert.match(capture, /id="capPermErr"/);
  assert.match(studio, /function tpTipsGo\(/);
  assert.match(studio, /if\(!tpTipsSeen\)/);
});

test("Recording Studio save path is callable and not a blob <a><button>", () => {
  assert.match(studio, /function tpSaveVideo\(/);
  assert.match(studio, /function tpDownloadBlob\(/);
  assert.match(studio, /function tpAsFile\(/);
  assert.match(studio, /navigator\.share/);
  assert.match(studio, /tpSaveBtn[\s\S]*tpSaveVideo\(\)/);
  assert.match(studio, /tpShare[\s\S]*tpSaveVideo\(\)/);
  assert.equal(/<a id="tpDl"[^>]*>\s*<button/.test(html), false);
  assert.match(html, /id="tpSaveBtn"/);
  assert.match(html, /id="tpDl"/);
  assert.match(html, /id="tpPrev"/);
});
