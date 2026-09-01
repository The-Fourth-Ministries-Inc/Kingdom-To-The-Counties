/* Event-photo upload must not dump ambassadors on an in-app Microsoft
   "account access" wall. SharePoint (bit.ly/uploadk2c) opens in the system
   browser. Quick Capture card photos stay in-app and never ask for a
   Microsoft login. */
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

test("SharePoint upload is opened via Capacitor Browser / App / _system", () => {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(deps["@capacitor/browser"]);
  assert.ok(deps["@capacitor/app"]);
  assert.match(js, /function openSystemUrl\(/);
  assert.match(js, /function openUploadMedia\(/);
  assert.match(js, /function isSharePointUpload\(/);
  assert.match(js, /P\.Browser&&P\.Browser\.open/);
  assert.match(js, /P\.App&&P\.App\.openUrl/);
  assert.match(js, /_system/);
  assert.match(extractFunction(js, "boot"), /bindUploadLinks\(\)/);
  assert.match(html, /onclick="return openUploadMedia\(event\)"/);
  assert.match(html, /https:\/\/bit\.ly\/uploadk2c/);
});

test("isSharePointUpload matches the dump link and SharePoint hosts", () => {
  const ctx = createContext({});
  runInContext(extractFunction(js, "isSharePointUpload"), ctx);
  const check = (href) => runInContext("isSharePointUpload(" + JSON.stringify(href) + ")", ctx);
  assert.equal(check("https://bit.ly/uploadk2c"), true);
  assert.equal(check("https://thefourthministries.sharepoint.com/sites/k2c"), true);
  assert.equal(check("privacy.html"), false);
  assert.equal(check("https://kingdomtothecounties.com"), false);
});

test("openSystemUrl prefers Browser.open, then App.openUrl, then _system", () => {
  const calls = [];
  const ctx = createContext({
    window: {
      Capacitor: {
        Plugins: {
          Browser: { open: (opts) => { calls.push(["browser", opts.url]); return Promise.resolve(); } }
        }
      },
      open: (url, target) => { calls.push(["window", url, target]); return {}; }
    },
    capNative: () => true
  });
  runInContext(
    extractFunction(js, "openSystemUrl") + "\n" + extractFunction(js, "fallbackOpen"),
    ctx
  );
  runInContext('openSystemUrl("https://bit.ly/uploadk2c");', ctx);
  assert.deepEqual(calls, [["browser", "https://bit.ly/uploadk2c"]]);

  calls.length = 0;
  ctx.window.Capacitor.Plugins = {
    App: { openUrl: (opts) => { calls.push(["app", opts.url]); return Promise.resolve(); } }
  };
  runInContext('openSystemUrl("https://bit.ly/uploadk2c");', ctx);
  assert.deepEqual(calls, [["app", "https://bit.ly/uploadk2c"]]);

  calls.length = 0;
  ctx.window.Capacitor.Plugins = {};
  runInContext('openSystemUrl("https://bit.ly/uploadk2c");', ctx);
  assert.equal(calls[0][0], "window");
  assert.equal(calls[0][1], "https://bit.ly/uploadk2c");
  assert.equal(calls[0][2], "_system");
});

test("Quick Capture photo does not require a Microsoft account", () => {
  assert.match(html, /id="capPhotoPerm"/);
  assert.match(html, /id="capPhotoInput"/);
  assert.match(html, /capture="environment"/);
  const perm = html.match(/id="capPhotoPerm"[^>]*>([\s\S]*?)<\/p>/)[1];
  assert.match(perm, /Camera/);
  assert.match(perm, /Allow/);
  assert.match(perm, /do not need a Microsoft or Google login/i);
  assert.doesNotMatch(perm, /account access/i);
  assert.doesNotMatch(perm, /bit\.ly\/uploadk2c/);
});
