/* The real @netlify/blobs client against its bundled local server, not the
   in-memory mock. Blobs 8.x silently ignored onlyIfNew/onlyIfMatch, so every
   compare-and-swap was a blind write followed by a re-read; on a brand-new
   store the re-read lagged and the very first roster read failed with
   "write conflict: churches" (seen on the first isolated deploy preview). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
import { getStore } from "@netlify/blobs";
import handler, { __setStoreFactory } from "../netlify/functions/data.mjs";

const dir = mkdtempSync(join(tmpdir(), "k2c-blobs-"));
const server = new BlobsServer({ directory: dir, token: "t", port: 0 });
const { port } = await server.start();
const url = "http://localhost:" + port;
const store = getStore({ name: "k2c-test", siteID: "site", token: "t", edgeURL: url, uncachedEdgeURL: url, consistency: "strong" });
__setStoreFactory(() => store);
after(async () => { await server.stop(); rmSync(dir, { recursive: true, force: true }); });

test("conditional writes are honoured by the installed client", async () => {
  assert.equal((await store.setJSON("probe", { a: 1 }, { onlyIfNew: true })).modified, true);
  assert.equal((await store.setJSON("probe", { a: 2 }, { onlyIfNew: true })).modified, false);
  assert.deepEqual(await store.get("probe", { type: "json" }), { a: 1 });
});

test("the first roster read on an empty store succeeds and seeds it", async () => {
  const t0 = Date.now();
  const res = await handler(new Request("https://ambassadorcompanion.netlify.app/.netlify/functions/data?part=churches&dp=1010"), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.list.some(c => c.id === "zeal-movement-manchester"));
  assert.ok(Date.now() - t0 < 3000, "no retry storm");
  const again = await (await handler(new Request("https://ambassadorcompanion.netlify.app/.netlify/functions/data?part=churches&dp=1010"), {})).json();
  assert.equal(again.rev, body.rev);
});
