/* Real layout regression for the Day PIN keyboard/footer collision.
   Only the gate's markup, stylesheet and keyboard helpers enter the probe.
   No app startup, network access, PIN submission or check-in is possible.
   Resizing an iframe gives Chromium real layout viewports/media queries;
   a supplied visualViewport models Safari's independently moving keyboard.
   This measures geometry, not an actual iOS keyboard or native picker. */
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

function extractFunction(name) {
  const start = js.search(new RegExp("function\\s+" + name + "\\s*\\("));
  assert.ok(start >= 0, "missing function " + name);
  let depth = 0;
  for (let i = js.indexOf("{", start); i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}" && --depth === 0) return js.slice(start, i + 1);
  }
  throw new Error("unclosed function " + name);
}

const scenarios = [
  { name: "portrait keyboard, visual offset 180 and height 400", width: 390, height: 844, top: 180, visible: 400 },
  { name: "portrait keyboard shrinks to 300", width: 390, height: 844, top: 180, visible: 300 },
  { name: "keyboard closes after focused PIN", width: 390, height: 844, top: 0, visible: 844 },
  { name: "keyboard reopens after close", width: 390, height: 844, top: 180, visible: 400 },
  { name: "rotate to landscape with keyboard open", width: 844, height: 390, top: 0, visible: 220 },
  { name: "landscape keyboard closes", width: 844, height: 390, top: 0, visible: 390 },
  { name: "native portrait resize without viewport pin", width: 390, height: 300, top: 0, visible: 300 },
  { name: "native landscape resize without viewport pin", width: 844, height: 220, top: 0, visible: 220 },
  { name: "rotate back and reopen portrait keyboard", width: 390, height: 844, top: 180, visible: 300 },
  { name: "portrait keyboard with notch inset", width: 390, height: 844, top: 180, visible: 300, safe: [47, 0, 0, 0] },
  { name: "landscape keyboard with home indicator and side insets", width: 844, height: 390, top: 0, visible: 220, safe: [0, 47, 21, 47] },
  { name: "native landscape resize with safe area", width: 844, height: 220, top: 0, visible: 220, safe: [0, 47, 21, 47] },
  { name: "final close restores portrait with safe areas", width: 390, height: 844, top: 0, visible: 844, safe: [47, 0, 34, 0] }
];

function probeDocument() {
  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  const gate = html.match(/<div class="daygate" id="dayGate">[\s\S]*?(?=<nav class="tabbar">)/);
  assert.ok(style, "missing app stylesheet");
  assert.ok(gate, "missing Day PIN gate markup");
  // Headless Chromium reports zero device insets. Substitute just those
  // environment values, leaving all production layout rules unchanged.
  const css = style[1].replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/env\(safe-area-inset-(top|right|bottom|left)(?:\s*,\s*[^)]+)?\)/g,
      (_, side) => "var(--probe-safe-" + side + ", 0px)");
  const functions = ["kbOverlayEls", "kbIsField", "kbPinOverlay", "kbUnpinOverlay",
    "kbNeedPin", "kbVisibleRect", "kbScrollField", "kbSyncPageField", "syncKbOverlay"]
    .map(extractFunction).join("\n");
  const frame = '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<style>' + css + '</style></head><body>' + gate[0] +
    '<script>' + functions + '</script></body></html>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>
<body><iframe id="phone" style="display:block;border:0;width:390px;height:844px"></iframe>
<script>
const phone = document.getElementById("phone");
const scenarios = ${JSON.stringify(scenarios)};
phone.onload = function () {
  try {
    const w = phone.contentWindow, d = w.document;
    const gate = d.getElementById("dayGate");
    const sheet = d.querySelector(".dgsheet");
    const body = d.querySelector(".dgbody") || sheet;
    const footer = d.querySelector(".dgactions");
    const unlock = d.getElementById("dayPinOk");
    const privacy = d.querySelector(".dgpv");
    let vv;
    Object.defineProperty(w, "visualViewport", { configurable: true, get: () => vv });
    gate.classList.add("show");
    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    }
    function hit(el) {
      const r = el.getBoundingClientRect();
      const at = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return at === el || el.contains(at);
    }
    function measure(field) {
      const b = box(body);
      return {
        field: box(field), fieldId: field && field.id,
        body: b,
        scrollport: { top: b.top + body.clientTop, bottom: b.top + body.clientTop + body.clientHeight,
          left: b.left + body.clientLeft, right: b.left + body.clientLeft + body.clientWidth },
        footer: box(footer), unlock: box(unlock), privacy: box(privacy),
        sheet: box(sheet), gate: box(gate), pinned: gate.classList.contains("kb-pin"),
        layout: { width: w.innerWidth, height: w.innerHeight },
        inlinePin: { top: gate.style.top, left: gate.style.left, width: gate.style.width, height: gate.style.height },
        scrollTop: body.scrollTop, sheetScrollTop: sheet.scrollTop,
        unlockHit: hit(unlock), privacyHit: hit(privacy), fieldHit: field ? hit(field) : null,
        hasBody: !!d.querySelector(".dgbody"), hasFooter: !!footer,
        footerOutsideBody: !!footer && !body.contains(footer),
        bodyOverflow: w.getComputedStyle(body).overflowY,
        footerShrink: footer && w.getComputedStyle(footer).flexShrink
      };
    }
    const result = [];
    for (const scenario of scenarios) {
      phone.style.width = scenario.width + "px";
      phone.style.height = scenario.height + "px";
      const safe = scenario.safe || [0, 0, 0, 0];
      ["top", "right", "bottom", "left"].forEach((side, i) =>
        d.documentElement.style.setProperty("--probe-safe-" + side, safe[i] + "px"));
      // Force the iframe resize before the production helper reads innerHeight.
      phone.getBoundingClientRect();
      vv = { offsetTop: scenario.top, offsetLeft: 0, width: scenario.width, height: scenario.visible };
      w.syncKbOverlay();
      const entry = { name: scenario.name, initial: measure(null), fields: [] };
      for (const id of ["dayPinInput", "dayNameInput", "dayTeamSel", "dayPinInput"]) {
        const field = d.getElementById(id);
        // Begin on the wrong end to prove the real helper reveals the field.
        body.scrollTop = id === "dayNameInput" ? body.scrollHeight : 0;
        field.focus({ preventScroll: true });
        w.syncKbOverlay();
        entry.fields.push(measure(field));
        // Repeat focus/resize sync while already pinned: no accumulated shove.
        for (let i = 0; i < 3; i++) {
          field.blur();
          field.focus({ preventScroll: true });
          w.syncKbOverlay();
        }
        entry.fields.push(measure(field));
      }
      // Independent user scrolling must never move the action footer.
      body.scrollTop = 0;
      entry.scrollStart = measure(null);
      body.scrollTop = body.scrollHeight;
      entry.scrollEnd = measure(null);
      result.push(entry);
    }
    document.title = JSON.stringify({ result });
  } catch (error) {
    document.title = JSON.stringify({ error: String(error), stack: error.stack });
  }
};
phone.srcdoc = ${JSON.stringify(frame).replace(/</g, "\\u003c")};
</script></body></html>`;
}

function chromeBin() {
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return "";
}

function dumpDom(bin, file, profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["--headless=new", "--disable-gpu", "--no-sandbox",
      "--disable-dev-shm-usage", "--hide-scrollbars", "--force-device-scale-factor=1",
      "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
      "--disable-sync", "--disable-extensions", "--disable-component-update",
      "--virtual-time-budget=8000", "--user-data-dir=" + profile, "--dump-dom", "file://" + file],
    { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "", finished = false;
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (error) reject(error);
      else resolve(output);
    }
    const timer = setTimeout(() => finish(new Error("Day PIN Chromium probe timed out: " + errors)), 25000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", part => { errors = (errors + part).slice(-2000); });
    child.stdout.on("data", part => {
      output += part;
      if (output.includes("<title>{") && output.includes("</html>")) finish();
    });
    child.on("error", finish);
    child.on("close", code => finish(output.includes("<title>{") ? null :
      new Error("Day PIN Chromium probe exited " + code + ": " + errors)));
  });
}

const EPS = 1;
function within(inner, outer, label) {
  assert.ok(inner.top >= outer.top - EPS && inner.bottom <= outer.bottom + EPS &&
    inner.left >= outer.left - EPS && inner.right <= outer.right + EPS,
  label + ": " + JSON.stringify({ inner, outer }));
}

function checkActions(r, scenario) {
  const visible = { top: scenario.top, bottom: scenario.top + scenario.visible, left: 0, right: scenario.width };
  within(r.unlock, visible, "Unlock must remain in the visual viewport");
  within(r.privacy, visible, "Privacy must remain in the visual viewport");
  within(r.unlock, r.sheet, "Unlock must remain inside the sheet");
  within(r.privacy, r.sheet, "Privacy must remain inside the sheet");
  assert.ok(r.unlock.bottom <= r.privacy.top + EPS, "Unlock overlaps Privacy");
  for (const [name, rect] of [["Unlock", r.unlock], ["Privacy", r.privacy]]) {
    assert.ok(rect.height >= 44 - EPS && rect.width >= 44 - EPS, name + " must have a 44px target");
  }
  assert.ok(r.unlockHit && r.privacyHit, "Action centers must be visible and hit-testable");
}

test("Day PIN fields and fixed action footer never collide across keyboard transitions", { timeout: 70000 }, async t => {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for Day PIN layout regression");
  const dir = mkdtempSync(join(tmpdir(), "k2c-day-gate-"));
  let output;
  try {
    const file = join(dir, "probe.html");
    writeFileSync(file, probeDocument());
    output = await dumpDom(bin, file, join(dir, "chrome")).catch(error => {
      if (!/timed out/.test(error.message)) throw error;
      return dumpDom(bin, file, join(dir, "chrome-retry"));
    });
  } finally {
    // Chrome helpers can briefly retain the temporary profile after exit.
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (_) { /* Do not hide the probe result behind profile cleanup. */ }
  }
  const title = output.match(/<title>(\{[\s\S]*?\})<\/title>/);
  assert.ok(title, "Chromium did not return Day PIN layout measurements");
  const probe = JSON.parse(title[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  assert.equal(probe.error, undefined, probe.stack || probe.error);
  assert.equal(probe.result.length, scenarios.length);
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i], result = probe.result[i];
    await t.test(scenario.name, () => {
      const pinned = scenario.top > 1 || scenario.height - scenario.visible > 80;
      assert.deepEqual(result.initial.layout, { width: scenario.width, height: scenario.height }, "real iframe layout viewport");
      assert.equal(result.initial.pinned, pinned, "native resizing must not retain a visual-viewport pin");
      assert.ok(Math.abs(result.initial.gate.top - scenario.top) <= EPS, "gate must track visual offset");
      assert.ok(Math.abs(result.initial.gate.height - scenario.visible) <= EPS, "gate must track visible height");
      if (!pinned) assert.deepEqual(result.initial.inlinePin, { top: "", left: "", width: "", height: "" }, "stale pin styles cleared after close/native resize");
      checkActions(result.initial, scenario);
      for (const r of result.fields) {
        within(r.field, r.scrollport, r.fieldId + " must be fully inside the content scrollport");
        assert.ok(r.field.bottom <= r.unlock.top + EPS, r.fieldId + " overlaps Unlock: " + JSON.stringify({ field: r.field, unlock: r.unlock }));
        assert.ok(r.field.height >= 44 - EPS && r.field.width >= 44 - EPS, r.fieldId + " must have a 44px target");
        assert.ok(r.fieldHit, r.fieldId + " is obscured at its center");
        checkActions(r, scenario);
        assert.ok(r.hasBody && r.hasFooter && r.footerOutsideBody, "scrollable fields and action footer must be siblings");
        assert.match(r.bodyOverflow, /^(auto|scroll)$/, "content must be scrollable");
        assert.equal(r.footerShrink, "0", "footer must not shrink");
        assert.ok(r.scrollport.bottom <= r.footer.top + EPS, "scrollport overlaps reserved footer");
        assert.ok(r.field.bottom <= r.footer.top + EPS, "focused field overlaps reserved footer");
        assert.equal(r.sheetScrollTop, 0, "the whole card must not scroll");
      }
      checkActions(result.scrollStart, scenario);
      checkActions(result.scrollEnd, scenario);
      assert.deepEqual(result.scrollEnd.unlock, result.scrollStart.unlock, "content scrolling moved Unlock");
      assert.deepEqual(result.scrollEnd.privacy, result.scrollStart.privacy, "content scrolling moved Privacy");
    });
  }
});
