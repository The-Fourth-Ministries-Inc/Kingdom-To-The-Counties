/* Android system/gesture back must pop show() pages, not the whole app.
   Testers on Play internal 15 / v1.19.0 had to use in-app ‹ links because
   the WebView treated every back swipe as exit. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(join(root, "js/app-core.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

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

test("native shell depends on Capacitor App for backButton", () => {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(deps["@capacitor/app"], "@capacitor/app must be a dependency");
  assert.match(js, /App\.addListener\(["']backButton["']/);
  assert.match(js, /function handleAppBack\(/);
  assert.match(js, /function bindNativeBack\(/);
  assert.match(js, /function rememberPage\(/);
  assert.match(js, /PAGE_STACK/);
  assert.match(js, /ROOT_PAGE="now"/);
  assert.match(extractFunction(js, "boot"), /bindNativeBack\(\)/);
  assert.match(extractFunction(js, "show"), /rememberPage\(/);
  assert.match(extractFunction(js, "show"), /fromBack/);
});

test("handleAppBack pops an inner page and stays in the app", () => {
  const shown = [];
  const ctx = createContext({
    PAGE_STACK: ["now"],
    PARENT: { capture: "guides" },
    ROOT_PAGE: "now",
    show: (id, opts) => { shown.push({ id, fromBack: !!(opts && opts.fromBack) }); },
    document: { querySelector: () => ({ id: "page-capture" }) }
  });
  const src = [
    extractFunction(js, "pageId"),
    extractFunction(js, "popPage"),
    extractFunction(js, "handleAppBack")
  ].join("\n");
  const stayed = runInContext(src + "\nresult = handleAppBack();", ctx);
  assert.equal(stayed, true);
  assert.deepEqual(shown, [{ id: "now", fromBack: true }]);
  assert.equal(ctx.PAGE_STACK.length, 0);
});

test("handleAppBack at Event Day root leaves the app", () => {
  const shown = [];
  const ctx = createContext({
    PAGE_STACK: [],
    PARENT: { capture: "guides" },
    ROOT_PAGE: "now",
    show: (id) => { shown.push(id); },
    document: { querySelector: () => ({ id: "page-now" }) }
  });
  const src = [
    extractFunction(js, "pageId"),
    extractFunction(js, "popPage"),
    extractFunction(js, "handleAppBack")
  ].join("\n");
  const stayed = runInContext(src + "\nresult = handleAppBack();", ctx);
  assert.equal(stayed, false, "root back must not consume the event");
  assert.deepEqual(shown, []);
});

test("handleAppBack from another tab with an empty stack goes home, not exit", () => {
  const shown = [];
  const ctx = createContext({
    PAGE_STACK: [],
    PARENT: { capture: "guides" },
    ROOT_PAGE: "now",
    show: (id, opts) => { shown.push({ id, fromBack: !!(opts && opts.fromBack) }); },
    document: { querySelector: () => ({ id: "page-guides" }) }
  });
  const src = [
    extractFunction(js, "pageId"),
    extractFunction(js, "popPage"),
    extractFunction(js, "handleAppBack")
  ].join("\n");
  const stayed = runInContext(src + "\nresult = handleAppBack();", ctx);
  assert.equal(stayed, true);
  assert.deepEqual(shown, [{ id: "now", fromBack: true }]);
});

test("rememberPage records a leave and ignores same-page / fromBack", () => {
  const ctx = createContext({ PAGE_STACK: [] });
  runInContext(extractFunction(js, "rememberPage") + "\nrememberPage('now','capture',false);", ctx);
  assert.deepEqual(ctx.PAGE_STACK, ["now"]);
  runInContext("rememberPage('capture','capture',false);", ctx);
  assert.deepEqual(ctx.PAGE_STACK, ["now"]);
  runInContext("rememberPage('capture','guides',true);", ctx);
  assert.deepEqual(ctx.PAGE_STACK, ["now"]);
});

test("Day PIN wall is still in the shell and is not skippable", () => {
  assert.match(html, /id="dayGate"/);
  assert.match(html, /id="dayPinOk"/);
  assert.match(js, /function maybeDayGate\(/);
  assert.match(js, /function dayGateOpen\(/);
  assert.doesNotMatch(js, /skipDayPin|bypassDay|dayPinSkip/);
  assert.match(html, /Unlock app &amp; check in/);
});
