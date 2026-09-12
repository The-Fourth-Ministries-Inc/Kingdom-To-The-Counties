/* Pre-Crusade church list (v1.19.10): homepage boot must not fetch or
   render 400+ churches; opening the tab paginates the first page. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const mobilize = read("js/mobilize.js");
const core = read("js/app-core.js");

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

function bootTail() {
  const mark = srcBootMark();
  return mobilize.slice(mark);
}

function srcBootMark() {
  const mark = mobilize.lastIndexOf("/* ---- boot");
  assert.ok(mark >= 0, "boot marker missing in mobilize.js");
  return mark;
}

test("mobilize.js boot does not fetch or render the church roster", () => {
  const tail = bootTail();
  assert.doesNotMatch(tail, /\brenderMobilize\s*\(/);
  assert.doesNotMatch(tail, /\bchFetch\s*\(/);
  assert.match(tail, /renderNameBars\s*\(\)/);
});

test("show() fetches churches only when Pre-Crusade or a church card opens", () => {
  const showSrc = extractFunction(core, "show");
  assert.match(showSrc, /id==="mobilize"[\s\S]*chFetch\s*\(\)/);
  assert.match(showSrc, /id==="church"[\s\S]*chFetch\s*\(\)/);
  assert.doesNotMatch(showSrc, /chFetch\s*\(\s*true\s*\)/);
});

test("chRenderList paints a first page and a Load more control", () => {
  const list = [];
  for (var i = 0; i < 120; i++) {
    list.push({
      id: "c" + i,
      name: "Church " + String(i).padStart(3, "0"),
      town: "Town",
      county: "Carroll",
      state: "NH",
      leader: "",
      contact: "",
      notes: "",
      kind: "church",
      flag: null,
      align: "unverified",
      interest: 0,
      connections: []
    });
  }
  const mount = { innerHTML: "" };
  const src = [
    "var CH={rev:1,list:list,log:[]};",
    "var CH_PAGE=50,chShown=50,chView='all',chQ='',chCounty='';",
    "var CH_ENGAGE={convo:1};",
    "function esc(s){return String(s);}",
    "function chId(id){return id;}",
    "function chFmtD(d){return d||'';}",
    "function chLastEngage(){return null;}",
    extractFunction(mobilize, "chMatches"),
    extractFunction(mobilize, "chStarsTxt"),
    extractFunction(mobilize, "chRowHtml"),
    extractFunction(mobilize, "chLoadMore"),
    extractFunction(mobilize, "chRenderList")
  ].join("\n");
  const ctx = createContext({
    list: list,
    document: { getElementById: function (id) { return id === "chList" ? mount : null; } }
  });
  runInContext(src + "\nchRenderList();", ctx);
  const first = (mount.innerHTML.match(/class="chrow/g) || []).length;
  assert.equal(first, 50, "first paint must be 50 rows, got " + first);
  assert.match(mount.innerHTML, /Load more · 70 more/);
  runInContext("chLoadMore();", ctx);
  const second = (mount.innerHTML.match(/class="chrow/g) || []).length;
  assert.equal(second, 100, "Load more must add another page, got " + second);
  assert.match(mount.innerHTML, /Load more · 20 more/);
});
