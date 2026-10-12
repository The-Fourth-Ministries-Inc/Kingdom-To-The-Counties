/* Deploy previews must never open the live Blobs store. CONTEXT is a build
   variable and is absent when a function runs, so the runtime signals —
   context.deploy.context and the "<deploy>--<site>" host — decide. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { storeName } from "../netlify/functions/data.mjs";

const req = url => ({ url });
const LIVE = "k2c-ambassador";

test("the real site keeps the live store", () => {
  assert.equal(storeName(req("https://ambassadorcompanion.netlify.app/api/data"), { deploy: { context: "production", id: "abc" } }, {}), LIVE);
  assert.equal(storeName(req("https://ambassadorcompanion.netlify.app/api/data"), undefined, {}), LIVE);
  assert.equal(storeName(undefined, undefined, { CONTEXT: "production" }), LIVE);
  assert.equal(storeName(undefined, undefined, {}), LIVE);
});

test("a deploy preview is isolated even with no CONTEXT env at runtime", () => {
  const name = storeName(req("https://deploy-preview-55--ambassadorcompanion.netlify.app/api/data"), { deploy: { context: "deploy-preview", id: "d1" } }, {});
  assert.equal(name, LIVE + "--deploy-preview--deploy-preview-55");
});

test("the preview host alone is enough", () => {
  assert.notEqual(storeName(req("https://deploy-preview-55--ambassadorcompanion.netlify.app/api/data"), undefined, {}), LIVE);
  assert.notEqual(storeName(req("https://68f1c0ffee--ambassadorcompanion.netlify.app/"), { deploy: { context: "production" } }, {}), LIVE);
});

test("the runtime context alone is enough", () => {
  assert.equal(storeName(req("https://example.org/api/data"), { deploy: { context: "branch-deploy", id: "x9" } }, { BRANCH: "Feature/Thing" }),
    LIVE + "--branch-deploy--feature-thing");
  assert.notEqual(storeName(undefined, undefined, { CONTEXT: "deploy-preview" }), LIVE);
  assert.notEqual(storeName(undefined, { deploy: { context: "dev" } }, {}), LIVE);
});

test("long branch names still fit Blobs' 64-byte store-name limit", () => {
  const name = storeName(undefined, { deploy: { context: "branch-deploy-with-a-long-context-name" } },
    { BRANCH: "cursor/a-very-long-feature-branch-name-that-keeps-going-2836" });
  assert.ok(name.startsWith(LIVE + "--"));
  assert.ok(new TextEncoder().encode(name).length <= 64, name);
});
