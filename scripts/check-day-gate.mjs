/* Day PIN gate regression check.
 *
 * Guards the bug where the gate re-appeared immediately after a volunteer
 * unlocked it *with their name filled in*: tryDayPin() queued the check-in
 * write before setDayOK() had stored the PIN, so the write went out with an
 * empty dayPin, the server 403'd it as locked, and that handler wiped the PIN
 * and re-showed the gate the volunteer had just cleared.
 *
 * This lives outside `npm test` on purpose. The suite is `node --test` over
 * pure functions in netlify/functions/data.mjs; this code is DOM- and
 * sessionStorage-bound, so it needs a real browser. Playwright is NOT a repo
 * dependency — install it wherever you're running from:
 *
 *   npm i playwright            # or have it available on NODE_PATH
 *   python3 -m http.server 8765 # from the repo root, in another shell
 *   node scripts/check-day-gate.mjs
 *
 * Exits non-zero if any case fails.
 */
import { chromium } from "playwright";

const PIN = "4821";
const URL = process.env.K2C_URL || "http://127.0.0.1:8765/index.html";

/* Stands in for netlify/functions/data.mjs, honouring the one contract that
 * matters here: any POST without a valid dayPin is 403 {locked:true}.
 * `slowLockMs` delays that rejection so we can land it after a fresh unlock. */
function stub(pin) {
  window.__posts = [];
  window.__server = { checkins: [] };
  const real = window.fetch;
  window.fetch = function (url, opt) {
    if (String(url).indexOf("/.netlify/functions/data") < 0) return real.apply(this, arguments);
    const body = opt && opt.body ? JSON.parse(opt.body) : null;
    const J = (o, s, delay) =>
      new Promise((res) =>
        setTimeout(
          () => res(new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } })),
          delay || 0
        )
      );
    if (!opt || opt.method !== "POST") {
      return J({ dayPinSet: true, checklist: {}, announcements: [], checkins: window.__server.checkins, praises: [], feedback: [], count: 0 });
    }
    window.__posts.push({ action: body.action, dayPin: body.dayPin });
    if (body.action === "verifyDayPin") return body.pin === pin ? J({ ok: true }) : J({}, 403);
    if (body.action === "verifyLeaderPin") return J({}, 403);
    if (!body.dayPin || body.dayPin !== pin) return J({ locked: true }, 403, window.__slowLockMs || 0);
    if (body.action === "addCheckin") window.__server.checkins.push(body.payload);
    return J({ ok: true });
  };
}

const browser = await chromium.launch({ executablePath: process.env.K2C_CHROMIUM || "/opt/pw-browsers/chromium" });
const results = [];

async function open(seed) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.addInitScript(stub, PIN);
  await page.addInitScript(seed || (() => {}));
  await page.addInitScript(() => localStorage.setItem("k2c_tour", "1"));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  return { page, errs };
}
const gateShown = (page) => page.evaluate(() => document.getElementById("dayGate").classList.contains("show"));
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? "✓" : "✗") + " " + name + (detail ? "  " + JSON.stringify(detail) : ""));
}

/* 1. The reported bug: unlock with a name, gate must stay down. */
{
  const { page, errs } = await open();
  const up = await gateShown(page);
  await page.fill("#dayNameInput", "Test Volunteer");
  await page.fill("#dayPinInput", PIN);
  await page.click("#dayPinOk");
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    back: document.getElementById("dayGate").classList.contains("show"),
    pin: sessionStorage.getItem("k2c_daypin"),
    checkinPin: (window.__posts.find((p) => p.action === "addCheckin") || {}).dayPin,
    onRoster: (window.STATE && STATE.checkins || []).some((c) => c.name === "Test Volunteer")
  }));
  check("gate engages on boot", up === true);
  check("gate stays down after unlocking with a name", r.back === false, r);
  check("check-in is sent WITH the day PIN", r.checkinPin === PIN, { sent: r.checkinPin });
  check("volunteer lands on the roster", r.onRoster === true);
  check("no page errors", errs.length === 0, errs);
  await page.close();
}

/* 2. A write already in flight when the unlock happens: its late 403 must not
      wipe the PIN the volunteer just entered. */
{
  const { page, errs } = await open(() => { window.__slowLockMs = 1500; });
  await page.evaluate(() => queueWrite("addPraise", { id: "p1", name: "X", body: "y", t: "1:00 PM" }, function () {}, function () {}));
  await page.waitForTimeout(150);
  await page.fill("#dayNameInput", "Racer");
  await page.fill("#dayPinInput", PIN);
  await page.click("#dayPinOk");
  await page.waitForTimeout(2600); // let the stale 403 land
  const r = await page.evaluate(() => ({ back: document.getElementById("dayGate").classList.contains("show"), pin: sessionStorage.getItem("k2c_daypin") }));
  check("a stale 403 does not undo a fresh unlock", r.back === false && r.pin === PIN, r);
  check("no page errors (stale race)", errs.length === 0, errs);
  await page.close();
}

/* 3. The guard above must NOT swallow a real lockout — a session holding a
      PIN the server has since rolled over still has to be sent back to the gate. */
{
  const { page, errs } = await open(() => {
    sessionStorage.setItem("k2c_daypin", "0000");
    sessionStorage.setItem("k2c_dayok", "1");
  });
  const before = await gateShown(page);
  await page.evaluate(() => queueWrite("addPraise", { id: "p2", name: "X", body: "y", t: "1:00 PM" }, function () {}, function () {}));
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ shown: document.getElementById("dayGate").classList.contains("show"), pin: sessionStorage.getItem("k2c_daypin") }));
  check("a rolled-over PIN still re-gates the session", before === false && r.shown === true && r.pin === null, r);
  check("no page errors (real lockout)", errs.length === 0, errs);
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log("\n" + (results.length - failed.length) + " / " + results.length + " passed");
process.exit(failed.length ? 1 : 0);
