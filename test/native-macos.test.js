import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const app = read("js/app-core.js");

function functionSource(name) {
  const start = app.indexOf("function " + name + "(");
  const end = app.indexOf("\n}", start);
  assert.ok(start >= 0 && end > start, name + " exists");
  return app.slice(start, end + 2);
}

test("macOS packaged localhost cannot seed fabricated offline data", () => {
  const run = (desktop, host, protocol) => vm.runInNewContext(functionSource("isLocalDev") + ";isLocalDev()", {
    window: { K2C_DESKTOP: desktop }, location: { hostname: host, protocol }
  });
  assert.equal(run(true, "localhost", "capacitor:"), false);
  assert.equal(run(false, "localhost", "http:"), true);
  assert.equal(run(false, "ambassadorcompanion.netlify.app", "https:"), false);
});

test("native Mac sharing resolves to the public app", () => {
  const run = (desktop, origin, pathname) => vm.runInNewContext(functionSource("appShareUrl") + ";appShareUrl()", {
    window: { K2C_DESKTOP: desktop }, location: { origin, pathname }
  });
  assert.equal(run(true, "capacitor://localhost", "/index.html"), "https://ambassadorcompanion.netlify.app/");
  assert.equal(run(false, "https://example.com", "/index.html"), "https://example.com/");
});

test("desktop bridge only calls real pages and repeated selections do not add history", () => {
  const messages = [], visits = [];
  let current = "now";
  const sandbox = {
    window: { webkit: { messageHandlers: { workspace: { postMessage: (message) => messages.push(message) } } } },
    document: {
      documentElement: { classList: { add() {} } },
      querySelector: () => ({ id: "page-" + current }),
      querySelectorAll: () => [],
      getElementById: (id) => ["page-now", "page-crew", "page-guides"].includes(id) ? {} : null
    },
    MutationObserver: class { observe() {} },
    show(id) { current = id; visits.push(id); }, pageId: () => current,
    PARENT: { crew: "crew" }, history: { forward() {}, back() {} }
  };
  vm.runInNewContext(read("macos/AmbassadorCompanion/desktop.js"), sandbox);
  assert.equal(sandbox.window.K2CMac.navigate("crew"), true);
  assert.equal(sandbox.window.K2CMac.navigate("crew"), true);
  assert.equal(sandbox.window.K2CMac.navigate("not-a-page"), false);
  assert.deepEqual(visits, ["crew"]);
  assert.equal(messages.at(-1).page, "crew");
  sandbox.window.print();
  assert.equal(messages.at(-1).type, "print");
});

test("Mac target is AppKit, resizable, and has standard keyboard commands", () => {
  const source = read("macos/AmbassadorCompanion/App.swift");
  assert.match(source, /import AppKit/);
  assert.match(source, /\.resizable/);
  assert.match(source, /setFrameAutosaveName/);
  for (const title of ["Find in Page", "Print", "Toggle Sidebar", "Back", "Forward", "Close Window", "Quit Ambassador Companion"]) {
    assert.ok(source.includes(title), title);
  }
  assert.doesNotMatch(source, /import UIKit|MacCatalyst/);
});

test("Mac content uses pane breakpoints without duplicate phone navigation", () => {
  const css = read("macos/AmbassadorCompanion/desktop.css");
  assert.match(css, /html\.k2c-macos \.tabbar\{display:none\}/);
  assert.match(css, /html\.k2c-macos main\{width:100%;max-width:1480px/);
  assert.match(css, /min-width:1000px/);
  assert.match(css, /minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.doesNotMatch(read("index.html"), /desktop\.css|desktop\.js/);
});

test("Mac shell preserves strict transport, scoped files and permission prompts", () => {
  const source = read("macos/AmbassadorCompanion/WorkspaceController.swift");
  assert.match(source, /message\.frameInfo\.isMainFrame/);
  assert.match(source, /WorkspacePolicy\.isBundled\(url\)/);
  assert.match(source, /trusted && !smokeTest \? \.prompt : \.deny/);
  assert.match(source, /NSSavePanel\(\)/);
  assert.match(source, /NSOpenPanel\(\)/);
  assert.doesNotMatch(source, /allowUniversalAccessFromFileURLs|_registerURLSchemeAsSecure|\.grant/);
  assert.match(read("macos/AmbassadorCompanion/Info.plist"), /NSAllowsArbitraryLoads<\/key><false\/>/);
  const entitlements = read("macos/AmbassadorCompanion/AmbassadorCompanion.entitlements");
  assert.match(entitlements, /com\.apple\.security\.app-sandbox/);
  assert.match(entitlements, /files\.user-selected\.read-write/);
  assert.doesNotMatch(entitlements, /network\.server|files\.all|disable-library-validation/);
});

test("hosted Mac validation builds both architectures and exercises desktop UI", () => {
  const workflow = read(".github/workflows/macos-validation.yml");
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /npm run build:macos/);
  assert.match(workflow, /--smoke-test/);
  const build = read("scripts/build-macos.sh");
  assert.match(build, /for ARCH in arm64 x86_64/);
  assert.match(build, /-apple-macos13\.0/);
  assert.match(build, /lipo -verify_arch arm64 x86_64/);
  assert.match(build, /codesign --verify --deep --strict/);
  assert.doesNotMatch(workflow, /secrets\.|notarytool|altool|app-store-connect/);
});


test("bundled Mac fetches return success and downloads use scoped native saves", () => {
  const handler = read("macos/AmbassadorCompanion/BundleSchemeHandler.swift");
  assert.match(handler, /HTTPURLResponse\(url: url, statusCode: 200/);
  assert.match(handler, /Content-Type/);
  const controller = read("macos/AmbassadorCompanion/WorkspaceController.swift");
  assert.match(controller, /shouldPerformDownload, WorkspacePolicy.isBundled\(url\)/);
  assert.match(controller, /presentBundledDownload\(url\)/);
  assert.match(controller, /func saveBundledResource/);
  assert.match(controller, /WorkspacePolicy.resourceURL\(for: url, root: root\)/);
  assert.match(controller, /startAccessingSecurityScopedResource/);
  const smoke = read("macos/AmbassadorCompanion/NativeSmokeTests.swift");
  assert.match(smoke, /response.ok/);
  assert.match(smoke, /saveBundledResource/);
});


test("Mac Command-P preserves the current Tech I/O print sheets", () => {
  assert.match(read("macos/AmbassadorCompanion/WorkspaceController.swift"), /id==='techio'&&typeof ioPrint==='function'\)\{ioPrint\(\)/);
});
