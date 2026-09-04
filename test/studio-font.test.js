/* Recording Studio teleprompter type size (v1.19.3).
   Laura (Android Play) could not read the script at arm's length: A+ added
   4px from 28 and stopped at 96, and nested editor HTML kept its own 16px.
   This file asserts the CSS/JS contract and, when Chromium is present,
   measures computed font-size on a 390-wide viewport — no camera. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function numConst(name) {
  const m = studio.match(new RegExp("\\b" + name + "\\s*=\\s*(\\d+)"));
  assert.ok(m, name + " missing");
  return Number(m[1]);
}

test("prompter font constants are large enough for arm's-length reading", () => {
  const min = numConst("TP_FONT_MIN");
  const max = numConst("TP_FONT_MAX");
  const step = numConst("TP_FONT_STEP");
  const def = numConst("TP_FONT_DEFAULT");
  assert.ok(def >= 44, "default is " + def + "px, want ≥44 (was 28)");
  assert.ok(step >= 12, "step is " + step + "px, want ≥12 (was 4)");
  assert.ok(max >= 160, "max is " + max + "px, want ≥160 (was 96)");
  assert.ok(min <= 24, "min is " + min + "px, want a still-usable floor");
  assert.ok(def + step * 2 <= max, "two A+ taps must still be under the cap");
  assert.match(studio, /tpFontSize\s*=\s*TP_FONT_DEFAULT/);
  assert.match(extractFunction(studio, "tpApplyFont"), /--tp-font/);
  assert.match(studio, /tpFontSize\s*=\s*Math\.min\(tpFontSize\s*\+\s*TP_FONT_STEP\s*,\s*TP_FONT_MAX\)/);
  assert.match(studio, /tpFontSize\s*=\s*Math\.max\(tpFontSize\s*-\s*TP_FONT_STEP\s*,\s*TP_FONT_MIN\)/);
  assert.doesNotMatch(extractFunction(studio, "tpApplyFont"), /style\.transform\s*=\s*["']scale/);
});

test("prompter CSS uses --tp-font on #tpText and its children", () => {
  const css = styleBlock();
  const text = css.match(/#tpText\{[^}]+\}/);
  assert.ok(text, "#tpText rule missing");
  assert.match(text[0], /--tp-font:\s*44px/);
  assert.match(text[0], /font-size:\s*var\(--tp-font\)/);
  assert.match(text[0], /text-size-adjust:\s*100%/);
  assert.match(text[0], /padding:\s*min\(22vh,\s*1\.25em\)\s+0\s+40vh/);
  assert.doesNotMatch(text[0], /font-size:\s*28px/);
  assert.doesNotMatch(text[0], /padding:\s*40vh\s+0([;}])/);
  assert.match(css, /#tpText\s*,\s*#tpText\s+\*\s*\{[^}]*font-size:\s*var\(--tp-font\)\s*!important/);
  assert.match(html, /id="tpFontVal"/);
  const ed = html.match(/#tpEdBody\{[^}]+\}/);
  assert.ok(ed, "#tpEdBody rule missing");
  assert.match(ed[0], /font-size:\s*16px/);
  assert.match(html, /\[contenteditable="true"\][\s\S]*font-size:\s*16px\s*!important/);
});

function probeDocument() {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  const apply = extractFunction(studio, "tpApplyFont");
  const consts = studio.match(/var TP_FONT_MIN=\d+,TP_FONT_MAX=\d+,TP_FONT_STEP=\d+,TP_FONT_DEFAULT=\d+;/);
  assert.ok(consts, "TP_FONT_* declaration missing");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0}
#phone{width:390px;height:844px;position:relative;overflow:hidden;background:#000}
#phone #tpApp{position:absolute;inset:0;display:block}
</style>
</head><body>
<div id="phone">
<div id="tpApp" class="show">
  <div id="tpWrap">
    <div id="tpTrack">
      <div id="tpText"><span id="tpNested" style="font-size:16px">Hey — something is happening right here in Coös County.</span></div>
    </div>
  </div>
  <div id="tpControls">
    <div class="trow">
      <button type="button" id="tpFontDown">A−</button>
      <div class="tlbl">Font <span id="tpFontVal">44</span></div>
      <button type="button" id="tpFontUp">A+</button>
      <button type="button" id="tpPlay" class="wide prim">▶ Play</button>
    </div>
  </div>
  <button id="tpBack">‹ Scripts</button>
</div>
</div>
<script>
${consts[0]}
var tpFontSize=TP_FONT_DEFAULT;
var tpTextEl=document.getElementById("tpText");
${apply}
document.getElementById("tpFontUp").addEventListener("click",function(){tpFontSize=Math.min(tpFontSize+TP_FONT_STEP,TP_FONT_MAX);tpApplyFont();});
document.getElementById("tpFontDown").addEventListener("click",function(){tpFontSize=Math.max(tpFontSize-TP_FONT_STEP,TP_FONT_MIN);tpApplyFont();});
tpApplyFont();
function fs(el){return parseFloat(getComputedStyle(el).fontSize);}
function box(el){
  var r=el.getBoundingClientRect();
  return {w:r.width,h:r.height,top:r.top,visible:r.width>0&&r.height>0};
}
var nested=document.getElementById("tpNested");
var wrap=document.getElementById("tpWrap");
function overlap(a,b){
  var ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
  return Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top);
}
var defText=fs(tpTextEl), defNested=fs(nested), defGlyph=box(nested), defOverlap=overlap(wrap,nested);
document.getElementById("tpFontUp").click();
var stepText=fs(tpTextEl);
tpFontSize=TP_FONT_MAX;
tpApplyFont();
var maxText=fs(tpTextEl), maxNested=fs(nested), maxGlyph=box(nested), maxOverlap=overlap(wrap,nested);
var badge=document.getElementById("tpFontVal").textContent;
var play=box(document.getElementById("tpPlay"));
var back=box(document.getElementById("tpBack"));
document.title=JSON.stringify({
  vw:document.getElementById("phone").clientWidth,
  defText:defText, defNested:defNested, defGlyphH:defGlyph.h, defOverlap:defOverlap,
  stepText:stepText,
  maxText:maxText, maxNested:maxNested, maxGlyphH:maxGlyph.h, maxOverlap:maxOverlap,
  badge:badge,
  textTransform:tpTextEl.style.transform||getComputedStyle(tpTextEl).transform,
  play:play, back:back
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

test("390-wide: default, A+ step, and max prompter size beat nested 16px", { timeout: 70000 }, async () => {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for the studio font measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-tpfont-"));
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
  assert.ok(r.vw <= 390, "viewport width is " + r.vw);
  assert.ok(r.defText >= 44, "default computed #tpText is " + r.defText + "px");
  assert.ok(r.defNested >= 44, "nested 16px span at default is " + r.defNested + "px — A+ must win");
  assert.ok(r.stepText >= r.defText + 11.5, "one A+ tap went " + r.defText + " → " + r.stepText);
  assert.ok(r.maxText >= 160, "max computed #tpText is " + r.maxText + "px");
  assert.ok(r.maxNested >= 160, "nested 16px span at max is " + r.maxNested + "px");
  assert.ok(r.maxGlyphH >= 140, "max glyph box is " + r.maxGlyphH + "px tall — still tiny on a 390-wide phone");
  assert.ok(r.defOverlap >= 40, "default first line overlap with the reading window is " + r.defOverlap);
  assert.ok(r.maxOverlap >= 80, "max first line is clipped out of the 46% wrap (overlap " + r.maxOverlap + ")");
  assert.equal(Number(r.badge), numConst("TP_FONT_MAX"));
  assert.ok(!/scale\(/i.test(String(r.textTransform || "")), "prompter must not use transform:scale for type size");
  assert.ok(r.play && r.play.visible && r.play.h + 0.5 >= 44, "Play must stay a 44px control");
  assert.ok(r.back && r.back.visible && r.back.h + 0.5 >= 44, "‹ Scripts must stay a 44px control");
});
