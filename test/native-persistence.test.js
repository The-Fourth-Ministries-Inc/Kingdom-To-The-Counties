/* Capacitor uses localhost in production. Native offline boots must restore
   real cached state, and Share App must never distribute a device-local URL.
   These isolated VM cases make no requests and write no production data. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const src = readFileSync(new URL("../js/app-core.js", import.meta.url), "utf8");
function extract(name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " missing");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(name + " unclosed");
}
function context(native, protocol = "https:", hostname = "localhost") {
  const Capacitor = { isNativePlatform: () => native };
  return createContext({ window: { Capacitor }, Capacitor,
    location: { hostname, protocol, origin: protocol + "//" + hostname, pathname: "/index.html" } });
}
const helpers = ["capNative", "isLocalDev", "appShareUrl"].map(extract).join("\n");

for (const [platform, protocol] of [["iPhone", "capacitor:"], ["Android", "https:"]]) {
  test(platform + " localhost is production and shares the public app", () => {
    const c = context(true, protocol);
    runInContext(helpers + "\nresult={dev:isLocalDev(),share:appShareUrl()};", c);
    assert.equal(c.result.dev, false);
    assert.equal(c.result.share, "https://ambassadorcompanion.netlify.app/");
  });
  for (const cached of [true, false]) {
    test(platform + " offline boot " + (cached ? "restores saved real lineup and sets" : "uses empty state without fabricated data"), async () => {
      const c = context(true, protocol);
      const state = { rig: { positions: [{ id: "lead", person: "Saved leader" }] }, sets: { source: "manual", sets: { "Worship Set 1": [{ title: "Saved song" }] } } };
      const storage = new Map();
      let demoCalls = 0, finishes = 0;
      Object.assign(c, {
        LEADERPIN: "", LIVE: true, STATE: null,
        apiGet: () => Promise.reject(new Error("offline")),
        seedDemo: () => { demoCalls++; return { fabricated: true }; },
        cacheAge: 0,
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        finishBoot: () => { finishes++; }
      });
      for (const name of ["refreshAll", "bindPageHistory", "bindNativeBack", "bindUploadLinks", "bindPlaybookToc", "renderIOList", "renderLeaders"]) c[name] = () => {};
      runInContext(helpers + "\n" + ["normalize", "saveCache", "loadCache"].map(extract).join("\n"), c);
      if (cached) c.saveCache(state);
      runInContext(extract("boot") + "\nboot();", c);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(demoCalls, 0, "a production native app must never seed demo content");
      assert.deepEqual(JSON.parse(JSON.stringify(c.STATE.rig)), cached ? state.rig : null);
      assert.deepEqual(JSON.parse(JSON.stringify(c.STATE.sets)), cached ? state.sets : null);
      assert.equal(c.cacheAge > 0, cached);
      assert.equal(c.LIVE, false);
      assert.equal(finishes, 1);
    });
  }
}

test("browser development and deployed-web share behavior are unchanged", () => {
  for (const host of ["localhost", "127.0.0.1", "::1"]) {
    const c = context(false, "http:", host);
    runInContext(helpers + "\nresult=isLocalDev();", c);
    assert.equal(c.result, true);
  }
  const c = context(false, "https:", "ambassadorcompanion.netlify.app");
  runInContext(helpers + "\nresult={dev:isLocalDev(),share:appShareUrl()};", c);
  assert.equal(c.result.dev, false);
  assert.equal(c.result.share, "https://ambassadorcompanion.netlify.app/");
});
