/* Pre-Crusade must not paint all ~400 churches into the DOM on one tick.
   A live GET ?part=churches (~240KB, 417 rows) plus boot-time chFetch +
   renderMobilize OOM-killed Chrome when the tab (or even Event Day) opened. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(join(root, "js/mobilize.js"), "utf8");
const core = readFileSync(join(root, "js/app-core.js"), "utf8");

test("mobilize.js does not prefetch or paint the church list at parse time", () => {
  const boot = js.slice(js.lastIndexOf("/* ---- boot"));
  assert.doesNotMatch(boot, /chFetch\(/);
  assert.doesNotMatch(boot, /renderMobilize\(/);
  assert.match(core, /if\(id==="mobilize"[\s\S]*chFetch\(\)/);
});

test("church list is paged — first paint is CH_PAGE rows, not the full roster", () => {
  assert.match(js, /var CH_PAGE=40/);
  assert.match(js, /function chLoadMore\(/);
  assert.match(js, /rows\.slice\(0,\s*chShown\)|slice=rows\.slice\(0,chShown\)/);
  assert.doesNotMatch(js, /rows\.map\(chRowHtml\)/);

  const churches = [];
  for (let i = 0; i < 80; i++) {
    churches.push({
      id: "c" + i,
      name: "Church " + String(i).padStart(3, "0"),
      kind: "church",
      town: "Town",
      county: "Merrimack",
      state: "NH",
      leader: "",
      contact: "",
      notes: "",
      flag: null,
      interest: 0,
      connections: [],
      align: "strong"
    });
  }
  let listHTML = "";
  const ctx = createContext({
    CH: { rev: 1, list: churches, log: [], tpl: {} },
    CH_ENGAGE: { convo: 1 },
    CH_PAGE: 40,
    chShown: 40,
    chView: "all",
    chQ: "",
    chCounty: "",
    chEngageById: null,
    chMatchCache: null,
    chMatchKey: "",
    chMoreLock: 0,
    chFetching: false,
    document: {
      getElementById: (id) => {
        if (id === "chList") {
          return {
            innerHTML: "",
            set innerHTML(v) { listHTML = v; },
            get innerHTML() { return listHTML; }
          };
        }
        return { innerHTML: "", style: {}, options: { length: 1 } };
      },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    Date,
    String,
    Math
  });
  const start = js.indexOf("function chEngageIndex(");
  const end = js.indexOf("function chAddOpen(");
  runInContext(
    js.slice(start, end) +
      "\nfunction esc(s){return String(s||\"\");}\nfunction chId(id){return id;}\nfunction chOnMob(){return true;}\nchRenderList();\nresult = { html: document.getElementById(\"chList\").innerHTML, page: CH_PAGE };",
    ctx
  );
  const html = ctx.result.html;
  const cards = html.split("onclick=\"chOpen(").length - 1;
  assert.equal(cards, 40, "first paint must be 40 rows, got " + cards);
  assert.match(html, /Load more/);
  assert.match(html, /40 left/);
});
