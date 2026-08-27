/* Capture DRAFT App Store iPhone screenshots (6.7-inch / 1290x2796).
 *
 * Apple's current required iPhone slot is labeled "6.9-inch Display" and
 * accepts portrait 1260x2736, 1290x2796, and 1320x2868. 1290x2796 is the
 * classic 6.7-inch size (iPhone 14 Pro Max / 15 Plus) and still uploads.
 *
 * Playwright is NOT a production dependency. Install it wherever you run this:
 *
 *   npm i playwright
 *   python3 -m http.server 8766   # optional; this script starts its own
 *   node scripts/capture-store-screenshots.mjs
 *
 * Hard rules:
 * - Never type a Day PIN or Leader PIN.
 * - Never use seedDemo() content. Local inner pages stub an empty API.
 * - Output PNGs are opaque RGB (no alpha), as App Store Connect requires.
 *
 * This does not upload or submit anything to App Store Connect.
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/store-release/screenshots");
const PORT = Number(process.env.K2C_SHOT_PORT || 8766);
const LOCAL = "http://127.0.0.1:" + PORT;
const LIVE = process.env.K2C_LIVE_URL || "https://ambassadorcompanion.netlify.app";
const WIDTH = 430;
const HEIGHT = 932;
const SCALE = 3;
const PX_W = WIDTH * SCALE; // 1290
const PX_H = HEIGHT * SCALE; // 2796

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const FORBIDDEN = [
  "Stay clear of the crane",
  "Parking sign blew over",
  "First salvation of the day",
  "North entrance arrow"
];

const EMPTY_STATE = {
  dayPinSet: false,
  locked: false,
  checklist: {},
  announcements: [],
  checkins: [],
  feedback: [],
  praises: [],
  miracles: [],
  radios: [],
  count: 0,
  event: { name: "", date: "" }
};

function pngInfo(buf) {
  if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("not a PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

function flattenRgb(srcPath, destPath) {
  const before = pngInfo(readFileSync(srcPath));
  if (before.width !== PX_W || before.height !== PX_H) {
    throw new Error("unexpected size " + before.width + "x" + before.height + " (want " + PX_W + "x" + PX_H + ")");
  }
  const ff = spawnSync(
    "ffmpeg",
    ["-y", "-i", srcPath, "-vf", "format=rgb24", "-frames:v", "1", destPath],
    { encoding: "utf8" }
  );
  if (ff.status !== 0) {
    throw new Error("ffmpeg flatten failed: " + (ff.stderr || ff.stdout || ff.status));
  }
  const after = pngInfo(readFileSync(destPath));
  if (after.width !== PX_W || after.height !== PX_H) {
    throw new Error("flattened size " + after.width + "x" + after.height);
  }
  if (after.colorType !== 2) {
    throw new Error("flattened PNG color type " + after.colorType + " (want 2 = RGB, no alpha)");
  }
  return after;
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = join(root, rel.replace(/^\/+/, ""));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    } catch (_) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (_) {
    console.error("Playwright is not installed. This script is optional and is not part of npm test.");
    console.error("  npm i playwright");
    console.error("  node scripts/capture-store-screenshots.mjs");
    process.exit(1);
  }
}

function chromePath() {
  return (
    process.env.K2C_CHROMIUM ||
    ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/opt/pw-browsers/chromium"].find(existsSync) ||
    undefined
  );
}

async function launchBrowser(chromium) {
  const executablePath = chromePath();
  return chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"]
  });
}

function device() {
  return {
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
  };
}

async function stubApi(page, payload) {
  await page.route("**/*netlify/functions/**", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ locked: true })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });
  });
  await page.route("**/sw.js", (route) => route.abort());
  await page.route("**/{youtube,youtu.be,googlevideo,doubleclick}.**", (route) => route.abort());
}

async function prepare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("k2c_tour", "1");
      localStorage.removeItem("k2c_cache");
      sessionStorage.clear();
    } catch (_) {}
  });
}

async function ready(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.addStyleTag({
    content: "html,body{overflow:hidden !important} *{caret-color:transparent !important} ::-webkit-scrollbar{display:none !important}"
  });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await page.evaluate(() => {
    var a = document.activeElement;
    if (a && a.blur) a.blur();
  });
}

async function assertHonest(page, label) {
  const text = await page.evaluate(() => document.body && document.body.innerText ? document.body.innerText : "");
  for (const needle of FORBIDDEN) {
    if (text.indexOf(needle) !== -1) {
      throw new Error(label + " contains forbidden demo text: " + needle);
    }
  }
  const pinFilled = await page.evaluate(() => {
    var el = document.getElementById("dayPinInput");
    return !!(el && String(el.value || "").trim());
  });
  if (pinFilled) throw new Error(label + " has a Day PIN typed in — aborting");
}

async function snap(page, destName) {
  await page.waitForTimeout(400);
  const tmp = join(tmpdir(), "k2c-shot-" + destName);
  await page.screenshot({
    path: tmp,
    type: "png",
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    omitBackground: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
  });
  const dest = join(outDir, destName);
  const info = flattenRgb(tmp, dest);
  try { unlinkSync(tmp); } catch (_) {}
  console.log("wrote " + destName + "  " + info.width + "x" + info.height + "  colorType=" + info.colorType);
  return dest;
}

async function captureLock(browser) {
  const name = "iphone-6.7-1290x2796-01-day-pin.png";
  const ctx = await browser.newContext(device());
  const page = await ctx.newPage();
  let used = "live";
  try {
    await prepare(page);
    await page.goto(LIVE + "/index.html", { waitUntil: "load", timeout: 30000 });
    await ready(page);
    const shown = await page.waitForFunction(
      () => {
        var g = document.getElementById("dayGate");
        return !!(g && g.classList.contains("show"));
      },
      null,
      { timeout: 12000 }
    ).then(() => true).catch(() => false);
    if (!shown) throw new Error("live gate not shown");
    await assertHonest(page, "live lock");
    await snap(page, name);
  } catch (err) {
    used = "local";
    console.warn("live lock capture fell back to local stub: " + err.message);
    await ctx.close();
    const ctx2 = await browser.newContext(device());
    const page2 = await ctx2.newPage();
    await stubApi(page2, { dayPinSet: true, locked: true });
    await prepare(page2);
    await page2.goto(LOCAL + "/index.html", { waitUntil: "load", timeout: 30000 });
    await ready(page2);
    await page2.waitForFunction(() => {
      var g = document.getElementById("dayGate");
      return !!(g && g.classList.contains("show"));
    }, null, { timeout: 10000 });
    await assertHonest(page2, "local lock");
    await snap(page2, name);
    await ctx2.close();
    return used;
  }
  await ctx.close();
  return used;
}

async function capturePrivacy(browser) {
  const name = "iphone-6.7-1290x2796-02-privacy.png";
  const ctx = await browser.newContext(device());
  const page = await ctx.newPage();
  let used = "live";
  try {
    await prepare(page);
    await page.goto(LIVE + "/privacy.html", { waitUntil: "load", timeout: 30000 });
    await ready(page);
    const ok = await page.locator("h1").textContent();
    if (!ok || ok.indexOf("Privacy") === -1) throw new Error("live privacy missing heading");
    await assertHonest(page, "live privacy");
    await snap(page, name);
  } catch (err) {
    used = "local";
    console.warn("live privacy capture fell back to local: " + err.message);
    await ctx.close();
    const ctx2 = await browser.newContext(device());
    const page2 = await ctx2.newPage();
    await prepare(page2);
    await page2.goto(LOCAL + "/privacy.html", { waitUntil: "load", timeout: 20000 });
    await ready(page2);
    await assertHonest(page2, "local privacy");
    await snap(page2, name);
    await ctx2.close();
    return used;
  }
  await ctx.close();
  return used;
}

async function openEmptyApp(browser) {
  const ctx = await browser.newContext(device());
  const page = await ctx.newPage();
  await stubApi(page, EMPTY_STATE);
  await prepare(page);
  await page.goto(LOCAL + "/index.html", { waitUntil: "load", timeout: 30000 });
  await ready(page);
  await page.waitForFunction(() => {
    var g = document.getElementById("dayGate");
    return g && !g.classList.contains("show");
  }, null, { timeout: 10000 });
  await assertHonest(page, "empty app");
  return { ctx, page };
}

async function captureResources(browser) {
  const { ctx, page } = await openEmptyApp(browser);
  await page.evaluate(() => { show("guides"); window.scrollTo(0, 0); });
  await page.waitForSelector("#page-guides.page.active");
  await assertHonest(page, "resources");
  await snap(page, "iphone-6.7-1290x2796-03-resources.png");
  await ctx.close();
}

async function captureGraphics(browser) {
  const { ctx, page } = await openEmptyApp(browser);
  await page.evaluate(() => { show("graphics"); window.scrollTo(0, 0); });
  await page.waitForSelector("#page-graphics.page.active");
  await page.waitForFunction(() => {
    var img = document.querySelector("#page-graphics img");
    return img && img.complete && img.naturalWidth > 40;
  }, null, { timeout: 20000 });
  await assertHonest(page, "graphics");
  await snap(page, "iphone-6.7-1290x2796-04-graphics.png");
  await ctx.close();
}

const server = await startServer();
mkdirSync(outDir, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await launchBrowser(chromium);
const sources = {};
try {
  sources.lock = await captureLock(browser);
  sources.privacy = await capturePrivacy(browser);
  await captureResources(browser);
  await captureGraphics(browser);
  console.log("sources", JSON.stringify(sources));
} finally {
  await browser.close();
  server.close();
}
