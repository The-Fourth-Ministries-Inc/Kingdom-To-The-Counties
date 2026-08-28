/* First-paint QA: the LIVE card must not flash "Loading…" when the schedule
   is local, and the check-in nudge must not be visible or tappable while the
   Day PIN gate is up. These failed on the live website (v1.18.2). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const html = read("index.html");
const js = read("js/app-core.js");

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

function fakeEl(init) {
  const classes = new Set(init.classes || []);
  return {
    textContent: init.textContent || "",
    innerHTML: init.innerHTML || "",
    value: init.value || "",
    className: "",
    style: Object.assign({ display: "", width: "", background: "" }, init.style || {}),
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on === false) classes.delete(c); else if (on === true) classes.add(c); else if (classes.has(c)) classes.delete(c); else classes.add(c); }
    },
    focus: () => {}
  };
}

function expectedNowName(t, segments) {
  const ci = segments.findIndex((s) => t >= s.s && t < s.e);
  const ni = segments.findIndex((s) => s.s > t);
  if (ci >= 0) return (segments[ci].altar ? "🙏 " : "") + segments[ci].name;
  if (t < segments[0].s) return "Not started yet";
  if (ni >= 0) return "Between segments";
  return "Program complete 🎉";
}

function scheduleContext(nowNameStart, minutes) {
  const els = {
    nowName: fakeEl({ textContent: nowNameStart }),
    nowWhen: fakeEl({}),
    liveTag: fakeEl({}),
    liveTagText: fakeEl({}),
    nowBadge: fakeEl({}),
    nowProgWrap: fakeEl({}),
    nowProg: fakeEl({}),
    nowCountdown: fakeEl({}),
    nextCard: fakeEl({}),
    nextName: fakeEl({}),
    nextWhen: fakeEl({})
  };
  const end = js.indexOf("/* ===== Tech I/O");
  assert.ok(end > 0, "schedule block boundary missing");
  const src = js.slice(0, end);
  const ctx = createContext({
    document: {
      getElementById: (id) => els[id] || fakeEl({})
    },
    Date: function FakeDate() {
      return {
        getHours: () => Math.floor(minutes / 60),
        getMinutes: () => Math.floor(minutes % 60),
        getSeconds: () => 0
      };
    },
    Math,
    String,
    console
  });
  runInContext(src + "\nrenderNow();", ctx);
  const segments = runInContext("SEGMENTS", ctx);
  return { els, segments };
}

test("LIVE card HTML first paint is not Loading…", () => {
  const m = html.match(/<h2 id="nowName">([^<]*)<\/h2>/);
  assert.ok(m, "#nowName missing");
  assert.equal(/Loading/.test(m[1]), false, "HTML #nowName must not say Loading");
  assert.notEqual(m[1].trim(), "");
});

test("boot paints the local schedule before apiGet", () => {
  const bootAt = js.indexOf("function boot(){");
  const apiAt = js.indexOf("apiGet()", bootAt);
  const refreshAt = js.indexOf("refreshAll()", bootAt);
  assert.ok(bootAt >= 0 && apiAt > bootAt, "boot() must call apiGet()");
  assert.ok(refreshAt > bootAt && refreshAt < apiAt, "refreshAll() must run in boot() before apiGet()");
});

test("renderNow writes a real schedule label, never Loading…, when SEGMENTS is present", () => {
  for (const minutes of [2 * 60 + 45, 8 * 60 + 10, 8 * 60 + 45, 14 * 60 + 5, 17 * 60 + 30]) {
    const { els, segments } = scheduleContext("Loading…", minutes);
    assert.ok(Array.isArray(segments) && segments.length > 0, "SEGMENTS missing");
    assert.notEqual(els.nowName.textContent, "Loading…");
    assert.equal(/Loading/.test(els.nowName.textContent), false, "renderNow must not write Loading");
    assert.equal(els.nowName.textContent, expectedNowName(minutes, segments));
  }
});

test("dayGateOpen is true only while live, a Day PIN is set, and the session is locked", () => {
  const src = [
    extractFunction(js, "dayPinStored"),
    extractFunction(js, "dayOK"),
    extractFunction(js, "dayUnlocked"),
    extractFunction(js, "dayGateOpen")
  ].join("\n");
  function run(overrides) {
    const store = { k2c_daypin: overrides.pin || "" };
    const ctx = createContext({
      LIVE: overrides.LIVE,
      LEADER: overrides.LEADER || false,
      LEADERPIN: overrides.LEADERPIN || "",
      STATE: { dayPinSet: overrides.dayPinSet },
      sessionStorage: {
        getItem: (k) => store[k] || "",
        setItem: (k, v) => { store[k] = v; }
      }
    });
    runInContext(src + "\nresult = dayGateOpen();", ctx);
    return ctx.result;
  }
  assert.equal(run({ LIVE: true, dayPinSet: true, pin: "" }), true);
  assert.equal(run({ LIVE: true, dayPinSet: true, pin: "0822" }), false);
  assert.equal(run({ LIVE: true, dayPinSet: true, LEADER: true }), false);
  assert.equal(run({ LIVE: false, dayPinSet: true, pin: "" }), false);
  assert.equal(run({ LIVE: true, dayPinSet: false, pin: "" }), false);
});

test("check-in nudge is not visible or interactive while #dayGate is shown", () => {
  assert.match(
    html,
    /body:has\(#dayGate\.show\)\s+\.annbar[\s\S]*?display:\s*none/
  );

  const renderAnn = extractFunction(js, "renderAnnouncements");
  assert.match(renderAnn, /dayGateOpen\(\)/);
  assert.match(renderAnn, /gateUp/);
  assert.match(renderAnn, /classList\.remove\("show"\)/);
  assert.match(renderAnn, /checkedIn\|\|gateUp/);

  const bar = fakeEl({ classes: ["show"] });
  const gate = fakeEl({});
  const dayName = fakeEl({});
  const dayPin = fakeEl({});
  const els = { annBar: bar, dayGate: gate, dayNameInput: dayName, dayPinInput: dayPin };
  const store = { k2c_daypin: "" };
  const src = [
    extractFunction(js, "dayPinStored"),
    extractFunction(js, "dayOK"),
    extractFunction(js, "dayUnlocked"),
    extractFunction(js, "dayGateOpen"),
    extractFunction(js, "maybeDayGate")
  ].join("\n");
  const ctx = createContext({
    LIVE: true,
    LEADER: false,
    LEADERPIN: "",
    STATE: { dayPinSet: true },
    MY: { name: "" },
    sessionStorage: { getItem: (k) => store[k] || "", setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: (id) => els[id] || null },
    setTimeout: () => 0
  });
  runInContext(src + "\nmaybeDayGate();", ctx);
  assert.equal(gate.classList.contains("show"), true, "gate should be showing");
  assert.equal(bar.classList.contains("show"), false, "nudge must lose .show while gated");
  assert.equal(
    bar.classList.contains("show") && !gate.classList.contains("show"),
    false,
    "nudge must not be interactive while the gate is up"
  );
});

test("check-in nudge can still show after the Day PIN gate is cleared", () => {
  const renderAnn = extractFunction(js, "renderAnnouncements");
  assert.match(renderAnn, /Did you check in\?/);
  assert.match(renderAnn, /annBarMode="checkin"/);
  assert.match(js, /function dayGateCheckin\(/);
});
