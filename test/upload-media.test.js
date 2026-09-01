/* Event-photo upload must not dump ambassadors on an in-app Microsoft
   "account access" wall. bit.ly/uploadk2c 301s to SharePoint and 403s
   without a work login. The primary path is Share / save on this phone
   (OS share sheet or a local download). Team dump still opens SharePoint
   in the system browser. Quick Capture card photos stay in-app. */
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
  assert.match(html, />Team dump</);
});

test("Share / save path does not require a Microsoft account", () => {
  assert.match(js, /function pickShareMedia\(/);
  assert.match(js, /function shareEventMedia\(/);
  assert.match(js, /function saveMediaToPhone\(/);
  assert.match(js, /navigator\.share/);
  assert.match(extractFunction(js, "shareEventMedia"), /files/);
  assert.doesNotMatch(extractFunction(js, "shareEventMedia"), /bit\.ly|sharepoint|openSystemUrl|openUploadMedia/);
  assert.doesNotMatch(extractFunction(js, "saveMediaToPhone"), /bit\.ly|sharepoint|openSystemUrl/);
  assert.match(html, /id="shareMediaInput"/);
  assert.match(html, /onclick="pickShareMedia\(\)"/);
  assert.match(html, /Share \/ save/);
  assert.match(html, /no Microsoft login/);
  const shareCard = html.match(/<div class="checkinprompt"><span>📸[\s\S]*?<\/div>/);
  assert.ok(shareCard, "Share / save card missing");
  assert.doesNotMatch(shareCard[0], /bit\.ly\/uploadk2c/);
  assert.doesNotMatch(shareCard[0], /openUploadMedia/);
});

test("shareEventMedia uses the OS share sheet and never opens SharePoint", () => {
  const calls = [];
  const files = [{ name: "field.jpg", type: "image/jpeg" }];
  const ctx = createContext({
    navigator: {
      share: (payload) => { calls.push(["share", payload]); return Promise.resolve(); },
      canShare: () => true
    },
    toast: (msg) => { calls.push(["toast", msg]); }
  });
  runInContext(extractFunction(js, "shareEventMedia"), ctx);
  runInContext("shareEventMedia(files)", Object.assign(ctx, { files }));
  assert.equal(calls[0][0], "share");
  assert.equal(calls[0][1].files.length, 1);
  assert.equal(calls[0][1].files[0].name, "field.jpg");
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
