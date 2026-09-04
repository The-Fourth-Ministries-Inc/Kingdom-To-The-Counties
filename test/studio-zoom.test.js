/* Recording Studio teleprompter zoom trap (TestFlight, Dynamic Island).
   After Edit, iOS WKWebView left a visualViewport zoom because #tpEdBody
   was a 14.5px contenteditable — the 16px anti-zoom rule only covered
   input/textarea/select. The leftover scale cropped the camera and hid
   ‹ Scripts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const html = read("index.html");
const studio = read("js/counties.js");

function extractFunction(src, name) {
  const start = src.search(new RegExp("function\\s+" + name + "\\s*\\("));
  assert.ok(start >= 0, "missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function styleBlock() {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(m, "index.html style block missing");
  return m[1];
}

function chromeBin() {
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const n of names) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return "";
}

test("contenteditable script body is in the 16px iOS-zoom rule", () => {
  assert.match(html, /\[contenteditable="true"\]/);
  assert.match(html, /font-size:\s*16px\s*!important/);
  const body = html.match(/#tpEdBody\{[^}]+\}/);
  assert.ok(body, "#tpEdBody rule missing");
  assert.match(body[0], /font-size:\s*16px/);
  assert.doesNotMatch(body[0], /font-size:\s*14\.5px/);
  const meta = html.match(/<meta name="viewport"[^>]+>/);
  assert.ok(meta, "viewport meta missing");
  assert.doesNotMatch(meta[0], /user-scalable\s*=\s*no/);
  assert.doesNotMatch(meta[0], /maximum-scale/);
});

test("‹ Scripts stays a 44px control above the camera after Edit", () => {
  const back = html.match(/#tpBack\{[^}]+\}/);
  assert.ok(back, "#tpBack rule missing");
  assert.match(back[0], /min-height:\s*44px/);
  assert.match(back[0], /min-width:\s*44px/);
  assert.match(back[0], /z-index:\s*220/);
  assert.match(html, /<button id="tpBack">‹ Scripts<\/button>/);
  assert.match(html, /onclick="tpCloseEditor\(\)"/);
  assert.match(studio, /function tpCloseEditor\(/);
  assert.match(studio, /tpCloseEditor\(\)/);
  assert.match(studio, /function tpResetCamLayer\(/);
  assert.match(studio, /function tpResetTipLayer\(/);
  assert.match(studio, /function tpResetLeftoverScale\(/);
  assert.match(studio, /function tpLockScale\(/);
  assert.match(extractFunction(studio, "tpOpen"), /tpLockScale\(\)/);
  assert.match(extractFunction(studio, "tpClose"), /tpUnlockScale\(\)/);
  assert.match(extractFunction(studio, "tpForceClose"), /tpUnlockScale\(\)/);
  assert.match(extractFunction(studio, "tpSaveEditor"), /tpCloseEditor\(\)/);
  assert.match(extractFunction(studio, "tpDelete"), /tpCloseEditor\(\)/);
});

test("modals and studio sheets clear the Dynamic Island safe-area", () => {
  const modal = html.match(/\.modal\{[^}]+\}/);
  assert.ok(modal, ".modal rule missing");
  assert.match(modal[0], /align-items:\s*flex-start/);
  assert.match(modal[0], /overflow:\s*auto/);
  assert.match(modal[0], /var\(--sat\)/);
  assert.match(modal[0], /var\(--sab\)/);
  assert.doesNotMatch(modal[0], /align-items:\s*center/);
  const tips = html.match(/#tpTips\{[^}]+\}/);
  assert.ok(tips, "#tpTips rule missing");
  assert.match(tips[0], /var\(--sat\)/);
  assert.match(html, /#guideTip\{[^}]*top:max\(calc\(var\(--sat\) \+ 12px\)/);
});

function fakeEl(init) {
  const classes = new Set(init.classes || []);
  const style = Object.assign({}, init.style || {});
  style.setProperty = function (name, value) { this[name] = value; };
  const attrs = Object.assign({}, init.attrs || {});
  return {
    style,
    textContent: init.textContent || "",
    innerHTML: init.innerHTML || "",
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => {
        if (on === false) classes.delete(c);
        else if (on === true) classes.add(c);
        else if (classes.has(c)) classes.delete(c);
        else classes.add(c);
      }
    },
    getAttribute: (k) => attrs[k],
    setAttribute: (k, v) => { attrs[k] = v; },
    blur: () => { init.blurred = true; },
    _attrs: attrs,
    _classes: classes,
    _init: init
  };
}

test("leaving the editor clears leftover scale and keeps the studio open", () => {
  const names = [
    "tpViewportMeta", "tpSetViewport", "tpStudioOpen", "tpLockScale",
    "tpUnlockScale", "tpResetLeftoverScale", "tpResetCamLayer",
    "tpResetTipLayer", "tpApplyFont", "tpBlurEditor", "tpCloseEditor"
  ];
  const src = names.map((n) => extractFunction(studio, n)).join("\n");
  const cam = fakeEl({ style: { transform: "scale(2.4)", zoom: "1.5" }, classes: [] });
  const tips = fakeEl({ style: { transform: "scale(1.8)", zoom: "2" } });
  const wrap = fakeEl({ style: { zoom: "1.4" }, classes: ["mirror"] });
  const text = fakeEl({ style: { transform: "scale(1.6)", zoom: "1.3", fontSize: "48px" } });
  const track = fakeEl({ style: { transform: "scale(1.2)" } });
  const editor = fakeEl({ classes: ["show"] });
  const app = fakeEl({ classes: ["show"] });
  const back = fakeEl({ textContent: "‹ Scripts" });
  const meta = fakeEl({ attrs: { content: "width=device-width, initial-scale=1, viewport-fit=cover" } });
  const els = {
    tpCam: cam, tpTips: tips, tpWrap: wrap, tpText: text, tpTrack: track,
    tpEditor: editor, tpApp: app, tpBack: back
  };
  let scrolled = false;
  const ctx = createContext({
    TP_VP_BASE: "width=device-width, initial-scale=1, viewport-fit=cover",
    tpFacing: "user",
    tpFontSize: 44,
    tpTextEl: text,
    tpTrack: track,
    tpPos: 40,
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => sel === 'meta[name="viewport"]' ? meta : null,
      activeElement: { blur: () => { els._blurred = true; } }
    },
    window: { scrollTo: () => { scrolled = true; } },
    requestAnimationFrame: (fn) => fn()
  });
  runInContext(src + "\ntpCloseEditor();", ctx);
  assert.equal(editor._classes.has("show"), false, "editor must close");
  assert.equal(app._classes.has("show"), true, "studio stays open");
  assert.equal(cam.style.transform, "", "camera leftover transform must clear");
  assert.equal(cam.style.zoom, "", "camera leftover zoom must clear");
  assert.equal(tips.style.transform, "", "tips leftover transform must clear");
  assert.equal(text.style.transform, "", "text leftover scale must clear");
  assert.equal(text.style.fontSize, "44px", "teleprompter font must return to the stock size, not the zoomed leftover");
  assert.equal(track.style.transform, "translateY(-40px)", "script scroll is not a leftover scale");
  assert.ok(back.textContent.indexOf("Scripts") >= 0, "‹ Scripts control still present");
  assert.match(meta._attrs.content, /maximum-scale=1/, "studio viewport stays locked after Edit");
  assert.equal(scrolled, true);
});

function probeDocument() {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  const names = [
    "tpViewportMeta", "tpSetViewport", "tpStudioOpen", "tpLockScale",
    "tpUnlockScale", "tpResetLeftoverScale", "tpResetCamLayer",
    "tpResetTipLayer", "tpApplyFont", "tpBlurEditor", "tpCloseEditor"
  ];
  const fns = names.map((n) => extractFunction(studio, n)).join("\n");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0}
:root{--sat:47px !important;--sab:34px !important}
</style>
</head><body>
<div id="tpApp" class="show">
  <video id="tpCam" style="transform:scale(2.2);zoom:1.8"></video>
  <div id="tpWrap"><div id="tpTrack" style="transform:scale(1.5)"><div id="tpText" style="transform:scale(1.7);zoom:1.4;font-size:48px">Coös script</div></div></div>
  <div id="tpLabel">Coös County · Script A</div>
  <button id="tpBack">‹ Scripts</button>
  <div id="tpTips"></div>
</div>
<div class="modal show" id="tpEditor"><div class="sheet" id="tpEdSheet">
  <h3 id="tpEdTitle">Edit script</h3>
  <div id="tpEdBody" contenteditable="true">Hello</div>
  <div class="row"><button class="cancel" onclick="tpCloseEditor()">Cancel</button><button class="ok">Save</button></div>
</div></div>
<script>
var TP_VP_BASE="width=device-width, initial-scale=1, viewport-fit=cover";
var tpFacing="user",tpFontSize=44,tpPos=0;
var tpTrack=document.getElementById("tpTrack"),tpTextEl=document.getElementById("tpText");
${fns}
function box(el){
  var r=el.getBoundingClientRect();
  return {top:r.top,bottom:r.bottom,w:r.width,h:r.height,visible:r.width>0&&r.height>0};
}
var edBody=document.getElementById("tpEdBody");
edBody.focus();
tpCloseEditor();
var cam=document.getElementById("tpCam");
var back=document.getElementById("tpBack");
var editor=document.getElementById("tpEditor");
var modal=document.querySelector(".modal");
var tips=document.getElementById("tpTips");
var sat=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat"))||0;
document.title=JSON.stringify({
  editorOpen: editor.classList.contains("show"),
  studioOpen: document.getElementById("tpApp").classList.contains("show"),
  camTransform: cam.style.transform,
  camZoom: cam.style.zoom,
  textTransform: document.getElementById("tpText").style.transform,
  textZoom: document.getElementById("tpText").style.zoom,
  textFont: document.getElementById("tpText").style.fontSize,
  trackTransform: document.getElementById("tpTrack").style.transform,
  back: box(back),
  backText: back.textContent,
  edFont: parseFloat(getComputedStyle(edBody).fontSize),
  modalPadTop: parseFloat(getComputedStyle(modal).paddingTop),
  tipsPadTop: parseFloat(getComputedStyle(tips).paddingTop),
  sat: sat,
  viewport: document.querySelector('meta[name="viewport"]').getAttribute("content")
});
</script>
</body></html>`;
}

function parseProbeTitle(htmlDump) {
  const titled = htmlDump.match(/<title>(\{[\s\S]*?\})<\/title>/);
  assert.ok(titled, "chrome dump-dom did not include probe JSON");
  return JSON.parse(titled[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}

const DUMP_MS = 25000;

function chromeDumpArgs(file, userData) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=390,844",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-extensions",
    "--disable-component-update",
    "--virtual-time-budget=8000",
    "--user-data-dir=" + userData,
    "--dump-dom",
    "file://" + file
  ];
}

function dumpDomOnce(bin, file, userData) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, chromeDumpArgs(file, userData), { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { child.kill("SIGKILL"); } catch (e) { /* already gone */ }
      fn();
    };
    const t = setTimeout(() => {
      finish(() => reject(new Error("chrome dump-dom timed out")));
    }, DUMP_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("<title>{") && out.includes("</html>")) {
        finish(() => resolve(out));
      }
    });
    child.on("error", (e) => finish(() => reject(e)));
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (out.includes("<title>")) resolve(out);
      else reject(new Error("chrome dump-dom exited " + code + " without probe JSON"));
    });
  });
}

test("edit script → leave editor → no leftover scale / back control still present", { timeout: 70000 }, async () => {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for the studio zoom measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-studio-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeDocument());
  const attempt = (label) => dumpDomOnce(bin, file, join(dir, label));
  let out;
  try {
    out = await attempt("chrome").catch((err) => {
      if (!/timed out/.test(String(err && err.message))) throw err;
      return attempt("chrome-retry");
    });
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* chrome user-data */ }
  }
  const r = parseProbeTitle(out);
  assert.equal(r.editorOpen, false, "editor must close");
  assert.equal(r.studioOpen, true, "studio stays open");
  assert.equal(r.camTransform, "", "camera leftover transform");
  assert.equal(r.camZoom, "", "camera leftover zoom");
  assert.equal(r.textTransform, "", "text leftover scale");
  assert.equal(r.textZoom, "", "text leftover zoom");
  assert.equal(r.textFont, "44px");
  assert.match(r.trackTransform, /^translateY\(0(px)?\)$/);
  assert.ok(r.back && r.back.visible, "‹ Scripts must still be on screen");
  assert.ok(r.back.h + 0.5 >= 44, "‹ Scripts height " + r.back.h + " is under 44px");
  assert.ok(r.back.top + 0.5 >= r.sat, "‹ Scripts top " + r.back.top + " is under safe-area " + r.sat);
  assert.match(r.backText, /Scripts/);
  assert.ok(r.edFont >= 16, "editor body computed font is " + r.edFont);
  assert.ok(r.modalPadTop + 0.5 >= r.sat, "modal padding-top " + r.modalPadTop + " is under safe-area " + r.sat);
  assert.ok(r.tipsPadTop + 0.5 >= r.sat, "tips padding-top " + r.tipsPadTop + " is under safe-area " + r.sat);
  assert.match(r.viewport, /maximum-scale=1/);
});
