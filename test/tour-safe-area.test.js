/* Tour overlay must sit below the Dynamic Island / status bar. Zach's
   TestFlight 1.18.5 shots showed steps 5/7/9 (Specialists, Recording
   Studio, Resources) with the beige title under the island because
   guidePlace pinned the card at top: 12px. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const js = readFileSync(join(root, "js/app-core.js"), "utf8");

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

test("guidePlace writes --guide-top and CSS clamps to --sat", () => {
  const place = extractFunction(js, "guidePlace");
  assert.match(place, /setProperty\(["']--guide-top["']/);
  assert.doesNotMatch(place, /tip\.style\.top\s*=/);
  assert.match(html, /#guideTip\{[^}]*top:max\(calc\(var\(--sat\) \+ 12px\)/);
  assert.match(html, /--sat:env\(safe-area-inset-top,\s*0px\)/);
});

function probeDocument() {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  const place = extractFunction(js, "guidePlace");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0;height:auto !important;max-height:none !important;overflow:visible !important;display:block !important}
/* Dynamic Island-ish inset. !important wins over :root's env(). */
:root{--sat:47px !important}
</style>
</head><body>
<div id="tallHub" style="position:fixed;top:8px;left:12px;right:12px;height:92vh;background:#eee"></div>
<div id="midHub" style="position:fixed;top:220px;left:16px;width:200px;height:64px;background:#ddd"></div>
<div id="guideCatch" style="display:none"></div>
<div id="guideDim" style="display:none"></div>
<div id="guideTip" style="display:none"></div>
<script>
${place}
var GUIDE_STEPS = [{},{},{},{},{},{},{},{},{},{}];
var guideIdx = 4;
function box(el) {
  var r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, height: r.height };
}
function satPx() {
  var probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;padding-top:var(--sat)";
  document.body.appendChild(probe);
  var n = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.body.removeChild(probe);
  return n;
}
function placeOn(sel, idx) {
  guideIdx = idx;
  guidePlace(document.querySelector(sel), {
    title: "Specialists",
    text: "Work tools live here: the Attendance Counter, Setup Checklist, Radio Checkout, Trailer Load List and the Tech I/O list."
  });
  var tip = document.getElementById("guideTip");
  return {
    top: tip.getBoundingClientRect().top,
    guideTop: tip.style.getPropertyValue("--guide-top"),
    inlineTop: tip.style.top
  };
}
var sat = satPx();
var tall = placeOn("#tallHub", 4);
var mid = placeOn("#midHub", 8);
document.title = JSON.stringify({
  sat: sat,
  tall: tall,
  mid: mid,
  midHub: box(document.getElementById("midHub"))
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

function measure() {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for the tour safe-area measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-tour-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeDocument());
  const attempt = (label) => dumpDomOnce(bin, file, join(dir, label));
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

test("tour card top is at least the safe-area inset when the spotlight forces it up", { timeout: 70000 }, async () => {
  const r = await measure();
  assert.ok(r.sat >= 47, "probe --sat resolved to " + r.sat + ", want 47");
  assert.equal(r.tall.inlineTop, "", "guidePlace must not set inline top (was " + r.tall.inlineTop + ")");
  assert.ok(r.tall.top + 0.5 >= r.sat, "tall-spotlight tour card top " + r.tall.top + " is under safe-area " + r.sat);
  assert.ok(r.mid.top + 0.5 >= r.sat, "mid-spotlight tour card top " + r.mid.top + " is under safe-area " + r.sat);
  assert.ok(r.mid.top + 0.5 >= r.midHub.bottom, "mid card should sit below its spotlight, got top " + r.mid.top + " hub bottom " + r.midHub.bottom);
});
