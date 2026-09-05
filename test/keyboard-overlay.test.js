/* Day PIN / modal keyboard shove (v1.19.5).
   iOS Safari overlays the software keyboard and scrolls visualViewport; it
   does not shrink 100dvh. A position:fixed inset:0 overlay then appears to
   lift the whole 100dvh shell. These tests lock the pin-to-visual-viewport
   contract and the v1.19.4 tab-bar shell. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

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

function fakeEl(init) {
  const classes = new Set(init.classes || []);
  const kids = init.kids || [];
  const style = Object.assign({}, init.style || {});
  const el = {
    tagName: init.tagName || "DIV",
    type: init.type || "",
    isContentEditable: !!init.isContentEditable,
    style,
    scrollTop: init.scrollTop || 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    contains: (node) => node === el || kids.indexOf(node) >= 0,
    querySelector: (sel) => {
      if (sel.indexOf(".dgsheet") >= 0) return init.sheet || null;
      if (sel.indexOf(".sheet") >= 0) return init.sheet || null;
      return null;
    },
    getBoundingClientRect: () => init.rect || { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 },
    focus: init.focus || (() => {})
  };
  return el;
}

test("Day PIN gate still fills the layout viewport until the keyboard pin applies", () => {
  const gate = rule(".daygate");
  assert.match(gate, /position\s*:\s*fixed/);
  assert.match(gate, /inset\s*:\s*0/);
  assert.match(gate, /overflow\s*:\s*hidden/);
  assert.match(html, /\.daygate\.kb-pin\{/);
  assert.match(html, /\.daygate\.kb-pin \.dgsheet\{[^}]*max-height:\s*100%/);
  assert.doesNotMatch(rule(".daygate.kb-pin"), /transform/);
  assert.doesNotMatch(rule(".modal.kb-pin"), /transform/);
});

test("v1.19.4 100dvh in-flow tab bar is still the shell contract", () => {
  assert.match(html, /html\{[^}]*height:100dvh/);
  assert.match(html, /body\{[^}]*height:100dvh/);
  assert.match(html, /body\{[^}]*display:flex;flex-direction:column/);
  assert.match(html, /\.tabbar\{[^}]*position:relative/);
  assert.doesNotMatch(html, /\.tabbar\{[^}]*position:fixed/);
  assert.doesNotMatch(html, /interactive-widget/);
  assert.match(html, /<span class="ver">v1\.19\.5<\/span>/);
});

test("all keyboard overlays share the visualViewport pin", () => {
  assert.match(js, /function kbOverlayEls\(/);
  assert.match(extractFunction(js, "kbOverlayEls"), /\.daygate,\s*\.modal/);
  assert.match(js, /function kbPinOverlay\(/);
  assert.match(js, /function kbUnpinOverlay\(/);
  assert.match(js, /function syncKbOverlay\(/);
  assert.match(js, /function kbBindViewport\(/);
  assert.match(extractFunction(js, "kbBindViewport"), /visualViewport/);
  assert.match(extractFunction(js, "kbBindViewport"), /["']resize["']/);
  assert.match(extractFunction(js, "kbBindViewport"), /["']scroll["']/);
  assert.match(extractFunction(js, "kbBindViewport"), /focusin/);
  assert.match(extractFunction(js, "kbPinOverlay"), /style\.top/);
  assert.match(extractFunction(js, "kbPinOverlay"), /style\.height/);
  assert.doesNotMatch(extractFunction(js, "kbPinOverlay"), /transform/);
  assert.match(extractFunction(js, "maybeDayGate"), /preventScroll:\s*true/);
  assert.match(html, /id="pinModal"/);
  assert.match(html, /id="tpEditor"/);
  assert.match(html, /id="tpDoneModal"/);
  assert.match(html, /id="binModal"/);
  assert.match(html, /id="dayGate"/);
});

test("kbNeedPin is true only when the visual viewport and layout disagree", () => {
  const src = extractFunction(js, "kbNeedPin");
  function run(vv, innerHeight) {
    const ctx = createContext({ window: { innerHeight: innerHeight }, vv: vv });
    runInContext(src + "\nresult = kbNeedPin(vv);", ctx);
    return ctx.result;
  }
  assert.equal(run({ offsetTop: 0, offsetLeft: 0, height: 844 }, 844), false, "idle Safari / WKWebView");
  assert.equal(run({ offsetTop: 0, offsetLeft: 0, height: 520 }, 520), false, "Android / Capacitor resize");
  assert.equal(run({ offsetTop: 0, offsetLeft: 0, height: 500 }, 844), true, "iOS keyboard shrinks visualViewport");
  assert.equal(run({ offsetTop: 180, offsetLeft: 0, height: 500 }, 844), true, "iOS scrolled visualViewport");
  assert.equal(run({ offsetTop: 0, offsetLeft: 12, height: 844 }, 844), true, "horizontal visual offset");
  assert.equal(run(null, 844), false);
});

test("kbPinOverlay writes the visual rect and kbUnpinOverlay clears it", () => {
  const src = [
    extractFunction(js, "kbPinOverlay"),
    extractFunction(js, "kbUnpinOverlay")
  ].join("\n");
  const el = fakeEl({});
  const ctx = createContext({ el });
  runInContext(src + "\nkbPinOverlay(el, {top:180,left:0,width:390,height:400});", ctx);
  assert.equal(el.style.top, "180px");
  assert.equal(el.style.left, "0px");
  assert.equal(el.style.width, "390px");
  assert.equal(el.style.height, "400px");
  assert.equal(el.style.right, "auto");
  assert.equal(el.style.bottom, "auto");
  assert.equal(el.classList.contains("kb-pin"), true);
  runInContext("kbUnpinOverlay(el);", ctx);
  assert.equal(el.style.top, "");
  assert.equal(el.style.height, "");
  assert.equal(el.classList.contains("kb-pin"), false);
});

test("syncKbOverlay pins a shown gate to the visual rect and leaves the shell alone", () => {
  const sheet = fakeEl({
    rect: { top: 200, left: 24, bottom: 560, right: 366, width: 342, height: 360 }
  });
  const pin = fakeEl({
    tagName: "INPUT",
    type: "text",
    rect: { top: 480, left: 40, bottom: 530, right: 350, width: 310, height: 50 }
  });
  const gate = fakeEl({
    classes: ["show"],
    kids: [sheet, pin],
    sheet,
    rect: { top: 0, left: 0, bottom: 844, right: 390, width: 390, height: 844 }
  });
  const pinModal = fakeEl({ classes: [] });
  const main = fakeEl({ style: { paddingBottom: "" } });
  const src = [
    extractFunction(js, "kbOverlayEls"),
    extractFunction(js, "kbIsField"),
    extractFunction(js, "kbPinOverlay"),
    extractFunction(js, "kbUnpinOverlay"),
    extractFunction(js, "kbNeedPin"),
    extractFunction(js, "kbVisibleRect"),
    extractFunction(js, "kbScrollField"),
    extractFunction(js, "kbSyncPageField"),
    extractFunction(js, "syncKbOverlay")
  ].join("\n");
  const ctx = createContext({
    window: {
      innerHeight: 844,
      visualViewport: { offsetTop: 180, offsetLeft: 0, width: 390, height: 400 }
    },
    document: {
      querySelectorAll: (sel) => {
        assert.match(sel, /daygate/);
        return [gate, pinModal];
      },
      querySelector: (sel) => (sel === "main" ? main : null),
      documentElement: fakeEl({ tagName: "HTML" }),
      body: fakeEl({ tagName: "BODY" }),
      activeElement: pin
    }
  });
  runInContext(src + "\nsyncKbOverlay();", ctx);
  assert.equal(gate.style.top, "180px", "gate must sit on the visual viewport, not the layout top");
  assert.equal(gate.style.height, "400px");
  assert.equal(gate.classList.contains("kb-pin"), true);
  assert.equal(pinModal.classList.contains("kb-pin"), false, "hidden leader PIN sheet stays unpinned");
  assert.equal(pinModal.style.top, "", "hidden overlay must not keep a leftover pin");
  assert.equal(main.style.paddingBottom, "", "overlay path must not pad main / lift the tab bar");
});

test("syncKbOverlay is a no-op when the layout viewport already matches (Android / Capacitor)", () => {
  const gate = fakeEl({ classes: ["show"] });
  const src = [
    extractFunction(js, "kbOverlayEls"),
    extractFunction(js, "kbIsField"),
    extractFunction(js, "kbPinOverlay"),
    extractFunction(js, "kbUnpinOverlay"),
    extractFunction(js, "kbNeedPin"),
    extractFunction(js, "kbVisibleRect"),
    extractFunction(js, "kbScrollField"),
    extractFunction(js, "kbSyncPageField"),
    extractFunction(js, "syncKbOverlay")
  ].join("\n");
  const ctx = createContext({
    window: {
      innerHeight: 520,
      visualViewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 520 }
    },
    document: {
      querySelectorAll: () => [gate],
      querySelector: () => null,
      documentElement: fakeEl({ tagName: "HTML" }),
      body: fakeEl({ tagName: "BODY" }),
      activeElement: fakeEl({ tagName: "INPUT", type: "text" })
    }
  });
  runInContext(src + "\nsyncKbOverlay();", ctx);
  assert.equal(gate.style.top, "");
  assert.equal(gate.classList.contains("kb-pin"), false);
});

function extract(re, label) {
  const m = html.match(re);
  assert.ok(m, label + " missing from index.html");
  return m[0];
}

function probeKeyboardDocument() {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  const topwrap = extract(/<div class="topwrap">[\s\S]*?<\/div>\s*<main>/, "topwrap");
  const gate = extract(/<div class="daygate" id="dayGate">[\s\S]*?<\/div>\s*<nav class="tabbar">/, "daygate");
  const tabs = extract(/<nav class="tabbar">[\s\S]*?<\/nav>/, "tabbar");
  const pinFn = [
    extractFunction(js, "kbPinOverlay"),
    extractFunction(js, "kbUnpinOverlay")
  ].join("\n");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0;background:#ccc;height:auto !important;max-height:none !important;overflow:visible !important;display:block !important}
#phone{width:390px;height:844px;position:relative;overflow:hidden;background:var(--cream);display:flex;flex-direction:column}
#phone .topwrap{flex:none}
#phone main{flex:1 1 auto;min-height:0;overflow:auto}
#phone .daygate{position:absolute;inset:0}
#phone .tabbar{position:relative;flex:none;left:auto;right:auto;bottom:auto}
</style>
</head><body>
<div id="phone">
${topwrap.replace(/<main>$/, "")}
<main><section class="page active" id="page-now"></section></main>
${gate.replace(/<nav class="tabbar">$/, "")}
${tabs}
</div>
<script>
${pinFn}
(function () {
  var phone = document.getElementById("phone");
  var gate = document.getElementById("dayGate");
  var sheet = document.querySelector(".dgsheet");
  var pin = document.getElementById("dayPinInput");
  gate.classList.add("show");
  function box(el) {
    var r = el.getBoundingClientRect();
    var pr = phone.getBoundingClientRect();
    return {
      top: Math.round((r.top - pr.top) * 10) / 10,
      bottom: Math.round((r.bottom - pr.top) * 10) / 10,
      h: Math.round(r.height * 10) / 10
    };
  }
  var before = { gate: box(gate), tabbar: box(document.querySelector(".tabbar")), title: box(document.querySelector(".dgsheet h3")) };
  kbPinOverlay(gate, { top: 180, left: 0, width: 390, height: 400 });
  var afterPin = {
    gate: box(gate),
    tabbar: box(document.querySelector(".tabbar")),
    title: box(document.querySelector(".dgsheet h3")),
    kbPin: gate.classList.contains("kb-pin")
  };
  var fr = pin.getBoundingClientRect();
  var sr = sheet.getBoundingClientRect();
  if (fr.bottom > sr.bottom - 16) sheet.scrollTop += Math.ceil(fr.bottom - (sr.bottom - 16));
  else if (fr.top < sr.top + 16) sheet.scrollTop -= Math.ceil((sr.top + 16) - fr.top);
  var after = {
    gate: box(gate),
    tabbar: box(document.querySelector(".tabbar")),
    title: afterPin.title,
    pin: box(pin),
    unlock: box(document.getElementById("dayPinOk")),
    sheet: box(sheet),
    phoneH: phone.clientHeight,
    kbPin: afterPin.kbPin,
    titleAfterPin: afterPin.title
  };
  document.title = JSON.stringify({ before: before, after: after });
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

function chromeDumpArgs(file, userData) {
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

test("pinned Day PIN gate stays in the visual hole and the tab bar stays flush", { timeout: 70000 }, async () => {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for the keyboard-overlay measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-kb-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeKeyboardDocument());
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
  assert.equal(r.after.kbPin, true);
  assert.ok(Math.abs(r.after.gate.top - 180) <= 2, "gate top " + r.after.gate.top + " should be 180");
  assert.ok(Math.abs(r.after.gate.h - 400) <= 3, "gate height " + r.after.gate.h + " should be 400");
  assert.ok(r.after.titleAfterPin.top >= r.after.gate.top - 1, "title shoved above the visual rect (" + r.after.titleAfterPin.top + ")");
  assert.ok(r.after.titleAfterPin.top < 180 + 80, "title should stay near the top of the visual hole");
  assert.ok(r.after.pin.top >= r.after.gate.top - 1, "PIN field above the visual rect");
  assert.ok(r.after.pin.bottom <= r.after.gate.bottom + 1, "PIN field below the visual rect");
  assert.ok(Math.abs(r.after.tabbar.bottom - r.after.phoneH) <= 1.5,
    "tab bar moved with the keyboard pin: bottom " + r.after.tabbar.bottom + " phone " + r.after.phoneH);
  assert.ok(Math.abs(r.before.tabbar.bottom - r.after.tabbar.bottom) <= 1.5,
    "pinning the overlay must not lift the in-flow tab bar");
});
