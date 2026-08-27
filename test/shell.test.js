/* Shell layout that volunteers actually see: header safe-area, Resources
   card order, and the version badge staying in lockstep with the SW cache. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppVersion } from "../scripts/app-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function guidesHub(html) {
  const m = html.match(/<section class="page" id="page-guides">([\s\S]*?)<\/section>/);
  assert.ok(m, "Ambassador Resources section missing");
  const hub = m[1].match(/<div class="hub">([\s\S]*?)<\/div>/);
  assert.ok(hub, "Ambassador Resources hub missing");
  return hub[1];
}

function hubTitles(hub) {
  return [...hub.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
}

test("viewport-fit=cover is on so env(safe-area-inset-*) can be non-zero", () => {
  const html = read("index.html");
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
});

test("sticky header pads with Capacitor --safe-area-inset-top, not WKWebView contentInset", () => {
  const html = read("index.html");
  assert.match(html, /--sat:var\(--safe-area-inset-top,\s*env\(safe-area-inset-top,\s*0px\)\)/);
  assert.match(html, /\.topwrap\{[^}]*padding-top:var\(--sat\)/);
  assert.match(html, /\.topbar\{[^}]*padding:12px 18px/);
  assert.doesNotMatch(html, /\.topbar\{[^}]*safe-area-inset-top/);
  assert.match(html, /\.daygate\{[^}]*padding:calc\(var\(--sat\) \+ 24px\)/);
  assert.match(html, /\.tabbar\{[^}]*padding-bottom:var\(--sab\)/);

  const cap = JSON.parse(read("capacitor.config.json"));
  assert.equal(cap.ios.contentInset, "never");
});

test("Privacy Policy is the last Ambassador Resources card and still opens privacy.html", () => {
  const html = read("index.html");
  const hub = guidesHub(html);
  const titles = hubTitles(hub);
  assert.ok(titles.length >= 6, "expected the resource cards, got " + titles.join(", "));
  assert.notEqual(titles[0], "Privacy Policy");
  assert.equal(titles[titles.length - 1], "Privacy Policy");
  assert.match(hub, /href="privacy\.html"/);
  assert.match(html, /id="dayGate"[\s\S]*href="privacy\.html"/);
  assert.match(read("privacy.html"), /Ambassador Companion Privacy Policy/);
  assert.equal(titles[0], "Quick Capture");
});

test("version badge, service worker cache, and SW comment stay aligned", () => {
  const html = read("index.html");
  const sw = read("sw.js");
  const version = readAppVersion(html);
  assert.equal(version, "1.18.2");
  assert.match(sw, new RegExp("app v" + version.replace(/\./g, "\\.")));
  const cache = sw.match(/var CACHE = "(k2c-v\d+)"/);
  assert.ok(cache, "SW cache name missing");
  assert.equal(cache[1], "k2c-v54");
});
