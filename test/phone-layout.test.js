/* Phone shell at iPhone 390×844: ticker must not clip, tab labels must be
   readable, and primary / Privacy targets in the Day PIN gate must be ≥44px.
   Static checks guard the CSS contract; Chromium (when present) measures a
   live 390-wide layout so a regression fails the same way a volunteer sees it.

   Headless --dump-dom on GitHub-hosted runners sometimes never prints
   </html> within 8s (Mobile signed internal run 33167912630) even though
   the same assertions passed on the PR ~4 minutes earlier. The helper
   uses new headless, waits longer, and retries once on timeout. Layout
   assertions are unchanged. */
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

test("NOW/NEXT CSS does not ellipsize or clip segment names", () => {
  const now = rule(".nowstrip #stripNow");
  const next = rule(".nowstrip #stripNext");
  const nx = rule(".nowstrip .nx");
  assert.match(now, /overflow\s*:\s*visible/);
  assert.match(next, /overflow\s*:\s*visible/);
  assert.match(now, /white-space\s*:\s*normal/);
  assert.match(next, /white-space\s*:\s*normal/);
  assert.doesNotMatch(now, /overflow\s*:\s*hidden/);
  assert.doesNotMatch(next, /overflow\s*:\s*hidden/);
  assert.doesNotMatch(now, /text-overflow\s*:\s*ellipsis/);
  assert.doesNotMatch(next, /text-overflow\s*:\s*ellipsis/);
  assert.doesNotMatch(nx, /max-width\s*:\s*50%/);
});

test("header subline is outdoor-readable and brand stays one row on a phone", () => {
  const sub = rule(".brand .s");
  const title = rule(".brand .k");
  const size = sub.match(/font-size\s*:\s*([\d.]+)px/);
  assert.ok(size, "brand subline font-size missing");
  assert.ok(Number(size[1]) >= 13, "brand subline is " + size[1] + "px, want ≥13");
  assert.match(title, /white-space\s*:\s*nowrap/);
  assert.match(html, /<span class="ver">v1\.19\.3<\/span>/);
});

test("tab labels are short and at least 12px, tap row stays ≥44px", () => {
  const labels = [...html.matchAll(/class="tab[^"]*"[^>]*>[\s\S]*?<span class="tl">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Pre-Crusade", "Now", "Specialists", "Post", "Resources"]);
  const tab = rule(".tab");
  const tl = rule(".tab .tl");
  const tabPx = Number((tab.match(/font-size\s*:\s*([\d.]+)px/) || [])[1]);
  const tlPx = Number((tl.match(/font-size\s*:\s*([\d.]+)px/) || [])[1]);
  assert.ok(tabPx >= 12, "tab font-size is " + tabPx);
  assert.ok(tlPx >= 12, "tab label font-size is " + tlPx);
  assert.match(tab, /min-height\s*:\s*44px/);
  assert.match(html, /\.tabbar\{[^}]*padding-bottom:env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(html, /--tab-h:64px/);
});

test("check-in prompt buttons and Day PIN Privacy link are ≥44px", () => {
  const btn = rule(".checkinprompt button,.checkinprompt a");
  assert.match(btn, /min-height\s*:\s*44px/);
  const priv = rule(".dgsheet .hint a,.dgsheet .dgpv");
  assert.match(priv, /min-height\s*:\s*44px/);
  assert.match(html, /id="dayGate"[\s\S]*class="dgpv"[\s\S]*href="privacy\.html"/);
  assert.match(rule(".dgsheet .ok"), /min-height\s*:\s*44px/);
});

test("Day PIN overlay can scroll the whole card when the viewport is short", () => {
  const gate = rule(".daygate");
  assert.match(gate, /align-items\s*:\s*flex-start/);
  assert.match(gate, /overflow\s*:\s*hidden/);
  assert.doesNotMatch(gate, /align-items\s*:\s*center/);
  const sheet = rule(".dgsheet");
  assert.match(sheet, /margin-top\s*:\s*auto/);
  assert.match(sheet, /margin-bottom\s*:\s*auto/);
  assert.match(sheet, /overflow-y\s*:\s*auto/);
  /* 100svh alone is the Chrome *window*, not a 390-tall #phone frame.
     min(100%, …) keeps the sheet inside the overlay on first paint. */
  assert.match(sheet, /min\(100%,calc\(100svh - 16px\)\)/);
  assert.match(sheet, /flex:\s*0 1 auto/);
});

test("short landscape Day PIN sheet is capped so Unlock is not only below a scroll", () => {
  assert.match(html, /@media \(max-height:500px\)\{[\s\S]*?\.dgsheet\{[^}]*max-height/);
});

function extract(re, label) {
  const m = html.match(re);
  assert.ok(m, label + " missing from index.html");
  return m[0];
}

function probeDocument(width, height) {
  const style = styleBlock().replace(/@font-face\{[^}]+\}/g, "");
  const topwrap = extract(/<div class="topwrap">[\s\S]*?<\/div>\s*<main>/, "topwrap");
  const prompts = extract(
    /<div class="checkinprompt"><span>📇[\s\S]*?id="tourPrompt"[\s\S]*?<\/div>/,
    "checkin prompts"
  );
  const gate = extract(/<div class="daygate" id="dayGate">[\s\S]*?<\/div>\s*<nav class="tabbar">/, "daygate");
  const tabs = extract(/<nav class="tabbar">[\s\S]*?<\/nav>/, "tabbar");
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<style>${style}
html,body{margin:0;padding:0;background:#ccc}
#phone{width:${width}px;height:${height}px;position:relative;overflow:auto;background:var(--cream)}
#phone .daygate{position:absolute;inset:0}
#phone .tabbar{position:absolute;left:0;right:0;bottom:0}
</style>
</head><body>
<div id="phone">
${topwrap.replace(/<main>$/, "")}
<main>
  <section class="page active" id="page-now">
    ${prompts}
  </section>
</main>
${gate.replace(/<nav class="tabbar">$/, "")}
${tabs}
</div>
<script>
(function () {
  var nowEl = document.getElementById("stripNow");
  var nextEl = document.getElementById("stripNext");
  nowEl.textContent = "General Setup";
  nextEl.textContent = "Program Run-Through · in 38m 12s";
  document.getElementById("tourPrompt").style.display = "flex";
  var gate = document.getElementById("dayGate");
  gate.classList.add("show");
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      top: Math.round(r.top * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
      cw: el.clientWidth,
      sw: el.scrollWidth,
      ch: el.clientHeight,
      sh: el.scrollHeight
    };
  }
  function fs(el) {
    return parseFloat(getComputedStyle(el).fontSize);
  }
  var phone = document.getElementById("phone");
  var report = {
    vw: phone.clientWidth,
    vh: phone.clientHeight,
    stripNow: box(nowEl),
    stripNext: box(nextEl),
    nowText: nowEl.textContent,
    nextText: nextEl.textContent,
    brandK: box(document.querySelector(".brand .k")),
    brandS: box(document.querySelector(".brand .s")),
    brandSFont: fs(document.querySelector(".brand .s")),
    clock: box(document.querySelector(".clock")),
    tabs: [].map.call(document.querySelectorAll(".tab"), function (t) {
      return { label: t.querySelector(".tl").textContent, h: box(t).h, font: fs(t.querySelector(".tl")) };
    }),
    promptBtns: [].map.call(document.querySelectorAll(".checkinprompt button, .checkinprompt a"), function (b) {
      return { text: b.textContent.trim(), h: box(b).h, w: box(b).w };
    }),
    unlock: box(document.getElementById("dayPinOk")),
    privacy: box(document.querySelector(".dgpv")),
    gate: box(gate),
    sheet: box(document.querySelector(".dgsheet")),
    titleTop: document.querySelector(".dgsheet h3").getBoundingClientRect().top,
    privBottom: document.querySelector(".dgpv").getBoundingClientRect().bottom,
    phoneTop: phone.getBoundingClientRect().top,
    phoneScroll: phone.scrollHeight,
    unlockBottomInPhone: Math.round((document.getElementById("dayPinOk").getBoundingClientRect().bottom - phone.getBoundingClientRect().top) * 10) / 10,
    privBottomInPhone: Math.round((document.querySelector(".dgpv").getBoundingClientRect().bottom - phone.getBoundingClientRect().top) * 10) / 10
  };
  document.title = JSON.stringify(report);
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

function measure(width, height) {
  const bin = chromeBin();
  assert.ok(bin, "Chromium/Chrome is required for the 390-wide layout measurement");
  const dir = mkdtempSync(join(tmpdir(), "k2c-phone-"));
  const file = join(dir, "probe.html");
  writeFileSync(file, probeDocument(width, height));
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

test("390-wide live layout: ticker, tabs, and 44px tap targets", { timeout: 70000 }, async () => {
  const r = await measure(390, 844);
  assert.ok(r.vw <= 390, "viewport width is " + r.vw);
  assert.ok(r.stripNow.sw <= r.stripNow.cw + 1, "NOW clips: clientWidth " + r.stripNow.cw + " scrollWidth " + r.stripNow.sw);
  assert.ok(r.stripNext.sw <= r.stripNext.cw + 1, "NEXT clips: clientWidth " + r.stripNext.cw + " scrollWidth " + r.stripNext.sw);
  assert.match(r.nextText, /Program Run-Through/);
  assert.ok(r.brandSFont >= 13, "subline computed size " + r.brandSFont);
  assert.ok(r.brandK.h <= 28, "brand title crushed into extra lines: height " + r.brandK.h);
  for (const t of r.tabs) {
    assert.ok(t.font >= 12, t.label + " tab label is " + t.font + "px");
    assert.ok(t.h >= 44, t.label + " tab hit height is " + t.h);
  }
  assert.deepEqual(r.tabs.map((t) => t.label), ["Pre-Crusade", "Now", "Specialists", "Post", "Resources"]);
  for (const b of r.promptBtns) {
    assert.ok(b.h >= 44, b.text + " is " + b.h + "px tall");
  }
  assert.ok(r.unlock.h >= 44, "Unlock is " + r.unlock.h + "px tall");
  assert.ok(r.privacy.h >= 44, "Privacy Policy hit area is " + r.privacy.h + "px tall");
});

test("landscape 390-tall Day PIN card stays fully reachable", { timeout: 70000 }, async () => {
  const r = await measure(844, 390);
  assert.ok(r.titleTop >= r.gate.top - 1, "Day PIN title is clipped at the top (" + r.titleTop + ")");
  assert.ok(r.sheet.h <= r.vh + 1, "sheet height " + r.sheet.h + " overflows the " + r.vh + " viewport");
  assert.ok(r.privacy.h >= 44, "Privacy hit area is " + r.privacy.h + "px in landscape");
  assert.ok(r.unlock.h >= 44, "Unlock is " + r.unlock.h + "px in landscape");
  /* First paint — not "reachable if you notice the overlay scrolls".
     Production 1.18.7 at 844×390 parked Unlock below the fold and Privacy
     fully off-screen. The hard wall stays; no skip/X. */
  assert.ok(r.unlockBottomInPhone <= r.vh + 1, "Unlock bottom " + r.unlockBottomInPhone + " is below the " + r.vh + " viewport on first paint");
  assert.ok(r.privBottomInPhone <= r.vh + 1, "Privacy bottom " + r.privBottomInPhone + " is below the " + r.vh + " viewport on first paint");
});
