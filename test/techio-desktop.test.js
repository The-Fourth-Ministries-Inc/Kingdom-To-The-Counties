/* Tech I/O on a laptop browser (v1.19.9).
   main.wide must drop the 560px letterbox whenever Tech I/O is open, and
   Inputs / Outputs edit must not require a sideways drag under ~1100px.
   Static checks lock the CSS/JS contract; Chromium measures 800- and
   1280-wide layouts the way a volunteer sees them on Netlify. */
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

function styleBlock() {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(m, "index.html style block missing");
  return m[1];
}

test("main.wide drops the 560px letterbox without a 900px media query", () => {
  const css = styleBlock();
  assert.match(css, /main\.wide\{max-width:1480px\}/);
  assert.doesNotMatch(
    css,
    /@media\s*\(min-width:\s*900px\)\s*\{[\s\S]*?main\.wide\{max-width:1480px\}/
  );
  assert.match(js, /classList\.toggle\("wide",id==="techio"\)/);
});

test("Inputs/Outputs edit stacks as labelled cards below 1100px", () => {
  const css = styleBlock();
  assert.match(css, /@media \(max-width:1099px\)\{/);
  assert.match(css, /main\.wide \.iotable\.editing\{[^}]*overflow:\s*visible/);
  assert.match(css, /main\.wide \.iotbl\.editing tr\{display:flex;flex-wrap:wrap/);
  assert.match(css, /td\[data-label\]::before\{content:attr\(data-label\)/);
  assert.match(css, /@media \(min-width:1100px\)\{/);
  assert.match(js, /function ioCell\(/);
  assert.match(js, /data-label="/);
  assert.match(js, /iotable'\+\(ed\?" editing":""\)/);
  assert.match(js, /iotbl wide'\+\(ed\?" editing":""\)/);
  assert.match(js, /iotbl out'\+editCls/);
  assert.match(js, /ioCell\("num k stick2","AVB"/);
  assert.match(js, /ioCell\("num k stick","Mix"/);
  assert.match(js, /iodelcell/);
});

function chromeBin() {
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const n of names) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return "";
}

function editTableMarkup() {
  const field = (label, extraCls, value) =>
    `<td class="${extraCls || ""}" data-label="${label}"><input value="${value}"></td>`;
  return `<div class="iotable editing" id="ioEdit">
    <table class="iotbl wide editing">
      <thead><tr><th></th><th>AVB</th><th>Snake</th><th>Ark split</th><th>Source</th>
        <th>Role / instrument</th><th>Mic / hardware</th><th>48V</th><th>Notes</th>
        <th>FOH ch</th><th>32SC ch</th></tr></thead>
      <tbody>
        <tr class="ed">
          <td class="c stick iodelcell"><button class="iodel" type="button">✕</button></td>
          ${field("AVB", "num k stick2", "2")}
          ${field("Snake", "num", "—")}
          ${field("Ark split", "num", "2")}
          <td data-label="Source"><select class="iopick"><option>Karielle</option></select><input value="Karielle"></td>
          ${field("Role / instrument", "", "Lead Vox")}
          ${field("Mic / hardware", "", "Wireless Mic B")}
          <td class="c" data-label="48V"><input type="checkbox"></td>
          ${field("Notes", "", "Primary Lead Vocalist")}
          ${field("FOH ch", "num", "2")}
          ${field("32SC ch", "num", "2")}
        </tr>
      </tbody>
    </table>
  </div>`;
}

function probeDocument() {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0;background:var(--cream);height:auto !important;max-height:none !important;overflow:auto !important;display:block !important}
</style>
</head><body>
<main class="wide">
  <p class="eyebrow">Tech · FOH · Worship</p>
  <h1 class="title">Tech I/O List</h1>
  ${editTableMarkup()}
</main>
<script>
(function () {
  var main = document.querySelector("main");
  var wrap = document.getElementById("ioEdit");
  var row = document.querySelector("tr.ed");
  var avb = document.querySelector('td[data-label="AVB"] input');
  var notes = document.querySelector('td[data-label="Notes"] input');
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      cw: el.clientWidth,
      sw: el.scrollWidth
    };
  }
  document.title = JSON.stringify({
    vw: document.documentElement.clientWidth,
    main: box(main),
    wrap: box(wrap),
    row: box(row),
    avb: box(avb),
    notes: box(notes),
    display: getComputedStyle(row).display,
    wrapOverflow: getComputedStyle(wrap).overflow,
    stick: getComputedStyle(document.querySelector(".stick2")).position
  });
})();
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
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-extensions",
    "--disable-component-update",
    "--window-size=" + width + "," + height,
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
  assert.ok(bin, "Chromium/Chrome is required for the Tech I/O laptop layout measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-techio-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeDocument());
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

test("800-wide laptop: Tech I/O is not a 560px column and edit does not scroll sideways", { timeout: 70000 }, async () => {
  const r = await measure(800, 700);
  assert.ok(r.vw <= 800, "desk width is " + r.vw);
  assert.ok(r.main.w > 560, "main.wide is still letterboxed at " + r.main.w + "px");
  assert.ok(r.main.w >= 790, "main.wide should fill an 800px window, got " + r.main.w);
  assert.match(r.display, /flex/, "edit row should stack (flex), got " + r.display);
  assert.ok(r.wrap.sw <= r.wrap.cw + 2, "edit sheet still scrolls sideways: client " + r.wrap.cw + " scroll " + r.wrap.sw);
  assert.ok(r.avb.w >= 80, "AVB field is cramped: " + r.avb.w);
  assert.ok(r.notes.w >= 80, "Notes field is cramped: " + r.notes.w);
});

test("1280-wide laptop: Tech I/O uses the desk and the spreadsheet stays unstuck", { timeout: 70000 }, async () => {
  const r = await measure(1280, 800);
  assert.ok(r.main.w > 1000, "main.wide is only " + r.main.w + "px on a 1280 window");
  assert.equal(r.stick, "static", "sticky AVB should release on a desk-width window");
  assert.ok(r.wrap.sw <= r.wrap.cw + 2, "desk-width edit sheet still scrolls sideways: client " + r.wrap.cw + " scroll " + r.wrap.sw);
});
