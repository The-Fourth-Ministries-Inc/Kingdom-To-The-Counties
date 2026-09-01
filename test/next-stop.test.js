/* LIVE / next-stop must name the upcoming county before the event.
   Laura's Play tester note on 2026-09-01: "Should it say something here?
   Next.. coos?" — the next event is Coös County Sat 9/5 Gorham Town Common.
   Same Monday-after schedule as the Day PIN / board. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentEvent } from "../netlify/functions/data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(join(root, "js/app-core.js"), "utf8");
const counties = readFileSync(join(root, "js/counties.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

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

function extractVarArray(src, name) {
  const start = src.search(new RegExp("var\\s+" + name + "\\s*="));
  assert.ok(start >= 0, "missing " + name);
  const open = src.indexOf("[", start);
  let i = open;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function seasonSrc() {
  return [
    extractVarArray(js, "SEASON_STOPS"),
    extractFunction(js, "seasonTodayISO"),
    extractFunction(js, "seasonAddDays"),
    extractFunction(js, "seasonCurrent"),
    extractFunction(js, "seasonEventDay"),
    extractFunction(js, "seasonStopLine"),
    extractFunction(js, "seasonStopWhen")
  ].join("\n");
}

function runSeason(expr, extra) {
  const ctx = createContext(Object.assign({
    Date,
    String,
    Math,
    Intl,
    COUNTIES: undefined,
    countyByKey: undefined
  }, extra || {}));
  return runInContext(seasonSrc() + "\nresult = " + expr + ";", ctx);
}

test("SEASON_STOPS stays in lockstep with COUNTIES and the server schedule", () => {
  const ctx = createContext({});
  const stops = runInContext(extractVarArray(js, "SEASON_STOPS") + "\nresult = SEASON_STOPS;", ctx);
  const cty = runInContext(counties.match(/var COUNTIES=\[[\s\S]*?\];/)[0] + "\nresult = COUNTIES;", createContext({}));
  assert.equal(stops.length, 8);
  assert.equal(cty.length, 8);
  for (let i = 0; i < stops.length; i++) {
    assert.equal(stops[i].key, cty[i].key, "key " + i);
    assert.equal(stops[i].date, cty[i].date, "date " + i);
    assert.equal(currentEvent(cty[i].date).key, cty[i].key);
  }
  assert.equal(stops.find((s) => s.key === "coos").place, "Gorham Town Common");
});

test("on 2026-09-01 the next stop is Coös / Sep 5 / Gorham", () => {
  const stop = runSeason('seasonCurrent("2026-09-01")');
  assert.equal(stop.key, "coos");
  const line = runSeason('seasonStopLine(seasonCurrent("2026-09-01"))');
  assert.match(line, /Coös County/);
  assert.match(line, /Sep 5/);
  assert.match(line, /Gorham Town Common/);
  assert.doesNotMatch(line, /^coos$/i);
  assert.doesNotMatch(line, /Next\.\./);
  assert.equal(runSeason('seasonEventDay(seasonCurrent("2026-09-01"),"2026-09-01")'), false);
});

test("the board still moves Monday after each event", () => {
  assert.equal(runSeason('seasonCurrent("2026-08-22").key'), "belknap");
  assert.equal(runSeason('seasonCurrent("2026-08-23").key'), "belknap");
  assert.equal(runSeason('seasonCurrent("2026-08-24").key'), "coos");
  assert.equal(runSeason('seasonCurrent("2026-09-05").key'), "coos");
  assert.equal(runSeason('seasonCurrent("2026-09-06").key'), "coos");
  assert.equal(runSeason('seasonCurrent("2026-09-07").key'), "rockingham");
  assert.equal(currentEvent("2026-09-01").key, "coos");
  assert.equal(currentEvent("2026-09-07").key, "rockingham");
});

test("event Saturday and Sunday keep clock segments, not the next-stop override", () => {
  assert.equal(runSeason('seasonEventDay(seasonCurrent("2026-09-05"),"2026-09-05")'), true);
  assert.equal(runSeason('seasonEventDay(seasonCurrent("2026-09-06"),"2026-09-06")'), true);
  assert.match(extractFunction(js, "renderNow"), /paintOffDayStop/);
  assert.match(extractFunction(js, "renderStrip"), /paintOffDayStrip/);
});

test("paintOffDayStop writes the full Coös line and never a blank Next", () => {
  function fakeEl(init) {
    return {
      textContent: init.textContent || "",
      innerHTML: "",
      style: { display: "", background: "" },
      classList: { add: () => {}, remove: () => {} }
    };
  }
  const els = {
    liveTag: fakeEl({}),
    liveTagText: fakeEl({}),
    nowName: fakeEl({ textContent: "—" }),
    nowWhen: fakeEl({}),
    nowBadge: fakeEl({}),
    nowProgWrap: fakeEl({}),
    nowCountdown: fakeEl({}),
    nextCard: fakeEl({}),
    nextName: fakeEl({ textContent: "—" }),
    nextWhen: fakeEl({}),
    stripNow: fakeEl({}),
    stripNext: fakeEl({ textContent: "—" }),
    stripBlip: fakeEl({})
  };
  const ctx = createContext({
    Date, String, Math, Intl,
    COUNTIES: undefined,
    countyByKey: undefined,
    document: { getElementById: (id) => els[id] || fakeEl({}) }
  });
  const src = seasonSrc()
    + "\n" + extractFunction(js, "paintOffDayStop")
    + "\n" + extractFunction(js, "paintOffDayStrip");
  const painted = runInContext(src + '\nresult = paintOffDayStop("2026-09-01"); paintOffDayStrip("2026-09-01");', ctx);
  assert.equal(painted, true);
  assert.match(els.nowName.textContent, /Coös County/);
  assert.match(els.nowWhen.textContent, /Gorham/);
  assert.match(els.nextName.textContent, /Coös County/);
  assert.match(els.stripNext.textContent, /Coös County/);
  assert.match(els.stripNext.textContent, /Sep 5/);
  assert.match(els.stripNext.textContent, /Gorham Town Common/);
  assert.notEqual(els.stripNext.textContent.trim(), "");
  assert.notEqual(els.stripNext.textContent, "—");
  assert.doesNotMatch(els.stripNext.textContent, /Next\.\.\s*coos/i);
});

test("LIVE first paint is not Loading… and the strip can wrap a county line", () => {
  const m = html.match(/<h2 id="nowName">([^<]*)<\/h2>/);
  assert.ok(m, "#nowName missing");
  assert.equal(/Loading/.test(m[1]), false);
  assert.notEqual(m[1].trim(), "");
  assert.match(html, /\.nowstrip #stripNext\{[^}]*overflow:\s*visible/);
  assert.match(html, /\.nowstrip #stripNext\{[^}]*white-space:\s*normal/);
});
