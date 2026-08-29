/* Volunteer phone controls that shipped under the 44px floor, plus the
   Recording Studio landscape island gap: #tpBack / #tpLabel / #tpPost
   used raw 12–14px sides and never read safe-area-inset-left/right.
   Landscape CSS also dropped every #tpControls button — including Rec —
   to min-height:40px because that rule beat #tpRecBtn. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");

function styleBlock() {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(m, "index.html style block missing");
  return m[1];
}

function rule(selector) {
  const css = styleBlock();
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc.replace(/\s+/g, "\\s*") + "\\s*\\{([^}]+)\\}");
  const m = css.match(re);
  assert.ok(m, "missing CSS rule " + selector);
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

test("page-back, tour, radio, and name-bar controls are ≥44px in CSS", () => {
  assert.match(rule(".back"), /min-height\s*:\s*44px/);
  assert.match(rule("#guideTip button"), /min-height\s*:\s*44px/);
  assert.match(rule(".radio-row button"), /min-height\s*:\s*44px/);
  assert.match(rule(".namebar button"), /min-height\s*:\s*44px/);
});

test("shell chrome also clears landscape island left/right insets", () => {
  assert.match(html, /\.topbar\{[^}]*var\(--sal\)/);
  assert.match(html, /\.topbar\{[^}]*var\(--sar\)/);
  assert.match(html, /\.nowstrip\{[^}]*var\(--sal\)/);
  assert.match(html, /\.tabbar\{[^}]*padding-left:var\(--sal\)/);
  assert.match(html, /main\{[^}]*var\(--sal\)/);
});

test("studio reads left/right safe-area so landscape island cannot cover ‹ Scripts", () => {
  assert.match(html, /--sal:env\(safe-area-inset-left,\s*0px\)/);
  assert.match(html, /--sar:env\(safe-area-inset-right,\s*0px\)/);
  const back = rule("#tpBack");
  assert.match(back, /var\(--sar\)/);
  assert.doesNotMatch(back, /right:\s*12px/);
  const label = rule("#tpLabel");
  assert.match(label, /var\(--sal\)/);
  assert.doesNotMatch(label, /left:\s*12px/);
  const post = html.match(/#tpPost\{[^}]+\}/);
  assert.ok(post, "#tpPost rule missing");
  assert.match(post[0], /var\(--sal\)/);
  assert.match(post[0], /var\(--sar\)/);
});

test("landscape studio Rec stays 72px and other controls stay ≥44px", () => {
  assert.match(html, /#tpControls button\{min-height:44px;padding:8px 12px\}/);
  assert.doesNotMatch(html, /#tpControls button\{min-height:40px/);
  assert.match(html, /#tpControls #tpRecBtn\{[^}]*min-height:\s*72px/);
});

function probeDocument(width, height) {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0;background:#ccc}
#phone{width:${width}px;height:${height}px;position:relative;overflow:hidden;background:var(--cream)}
#phone #tpApp,#phone #guideTip{position:absolute}
#phone #tpApp{inset:0}
</style>
</head><body>
<div id="phone">
<button class="back">‹ Specialists</button>
<div class="namebar" id="namebar-rad">✍️ <b>Set your name</b> so your work is credited to you <button>Set name</button></div>
<div class="radio-row"><span class="rn">📻 #1</span><span class="rs">In the case</span><button class="co">Check out</button></div>
<div id="guideTip" style="display:block">
  <div class="gt">Specialists</div>
  <p>Work tools live here.</p>
  <div class="gnav"><span class="gstep">5 / 10</span>
    <button class="gback">‹ Back</button>
    <button class="gskip">Skip</button>
    <button class="gnext">Next ›</button>
  </div>
</div>
<div id="tpApp" class="show">
  <div id="tpLabel">Coös County · Script A</div>
  <button id="tpBack">‹ Scripts</button>
  <div id="tpControls">
    <div class="trow">
      <button id="tpFontDown">A−</button>
      <button id="tpFlip">🔄</button>
    </div>
    <div class="trow">
      <button id="tpPlay" class="wide prim">▶ Play</button>
      <button id="tpRecBtn"></button>
    </div>
  </div>
  <div id="tpPost" class="show">
    <div class="trow">
      <button id="tpSaveBtn" class="save">⬇ Save</button>
      <button id="tpShare">📤 Share</button>
      <button id="tpMarkDone">✅ Mark done</button>
    </div>
  </div>
</div>
</div>
<script>
document.documentElement.style.setProperty("--sat","47px");
document.documentElement.style.setProperty("--sab","21px");
document.documentElement.style.setProperty("--sal","47px");
document.documentElement.style.setProperty("--sar","47px");
function box(el){
  if(!el) return null;
  var r=el.getBoundingClientRect();
  var p=document.getElementById("phone").getBoundingClientRect();
  return {w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,top:Math.round((r.top-p.top)*10)/10,left:Math.round((r.left-p.left)*10)/10,right:Math.round((r.right-p.left)*10)/10,bottom:Math.round((r.bottom-p.top)*10)/10};
}
var phone=document.getElementById("phone");
var rec=document.getElementById("tpRecBtn");
var back=document.getElementById("tpBack");
var label=document.getElementById("tpLabel");
var save=document.getElementById("tpSaveBtn");
var mark=document.getElementById("tpMarkDone");
var sat=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat"))||0;
var sal=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sal"))||0;
var sar=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sar"))||0;
document.title=JSON.stringify({
  vw:phone.clientWidth, vh:phone.clientHeight, sat:sat, sal:sal, sar:sar,
  pageBack:box(document.querySelector(".back")),
  nameBtn:box(document.querySelector(".namebar button")),
  radioBtn:box(document.querySelector(".radio-row button")),
  guideNext:box(document.querySelector("#guideTip .gnext")),
  guideSkip:box(document.querySelector("#guideTip .gskip")),
  guideBack:box(document.querySelector("#guideTip .gback")),
  tpBack:box(back),
  tpLabel:box(label),
  tpPlay:box(document.getElementById("tpPlay")),
  tpFlip:box(document.getElementById("tpFlip")),
  tpRec:box(rec),
  tpSave:box(save),
  tpMark:box(mark)
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

function chromeDumpArgs(file, userData, width, height) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=" + width + "," + height,
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

function dumpDomOnce(bin, file, userData, width, height) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, chromeDumpArgs(file, userData, width, height), { stdio: ["ignore", "pipe", "pipe"] });
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

function measure(width, height) {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for phone-control measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-ctrl-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeDocument(width, height));
  const attempt = (label) => dumpDomOnce(bin, file, join(dir, label), width, height);
  return attempt("chrome").catch((err) => {
    if (!/timed out/.test(String(err && err.message))) throw err;
    return attempt("chrome-retry");
  }).then((out) => {
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* chrome user-data */ }
    return parseProbeTitle(out);
  }, (err) => {
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* chrome user-data */ }
    throw err;
  });
}

function assertHit(el, label) {
  assert.ok(el, label + " missing");
  assert.ok(el.h + 0.5 >= 44, label + " height " + el.h + " is under 44px");
}

test("390-wide: back, tour, radio, and name-bar hits are ≥44px", { timeout: 70000 }, async () => {
  const r = await measure(390, 844);
  assert.ok(r.vw <= 390, "viewport width is " + r.vw);
  assertHit(r.pageBack, "‹ Specialists");
  assertHit(r.nameBtn, "Set name");
  assertHit(r.radioBtn, "Check out");
  assertHit(r.guideNext, "tour Next");
  assertHit(r.guideSkip, "tour Skip");
  assertHit(r.guideBack, "tour Back");
});

test("landscape studio: Rec is not squashed; ‹ Scripts and Save clear the side insets", { timeout: 70000 }, async () => {
  const r = await measure(844, 390);
  assert.ok(r.vh <= 390, "viewport height is " + r.vh);
  assert.ok(r.sal >= 47, "probe --sal resolved to " + r.sal);
  assert.ok(r.sar >= 47, "probe --sar resolved to " + r.sar);
  assertHit(r.tpBack, "‹ Scripts");
  assertHit(r.tpPlay, "Play");
  assertHit(r.tpFlip, "Flip");
  assertHit(r.tpSave, "Save");
  assert.ok(r.tpRec && r.tpRec.h + 0.5 >= 72, "Rec height " + (r.tpRec && r.tpRec.h) + " was squashed under 72px");
  assert.ok(r.tpRec.w + 0.5 >= 72, "Rec width " + r.tpRec.w + " was squashed under 72px");
  assert.ok(r.tpBack.right + 0.5 <= r.vw - r.sar, "‹ Scripts right " + r.tpBack.right + " sits in the " + r.sar + "px island");
  assert.ok(r.tpLabel.left + 0.5 >= r.sal, "script label left " + r.tpLabel.left + " sits in the " + r.sal + "px island");
  assert.ok(r.tpMark.right + 0.5 <= r.vw - r.sar, "Mark done right " + r.tpMark.right + " sits in the " + r.sar + "px island");
  assert.ok(r.tpSave.left + 0.5 >= r.sal, "Save left " + r.tpSave.left + " sits in the " + r.sal + "px island");
});
