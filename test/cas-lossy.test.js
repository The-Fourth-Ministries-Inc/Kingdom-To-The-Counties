/* Netlify Blobs' onlyIfMatch is not atomic under contention: on a deploy
   preview, 20 parallel conditional writes all reported modified:true and only
   6–11 of the changes survived. This stand-in reproduces that — the etag check
   and the commit are separated by an await — and every concurrent write must
   still land, because compareAndSwap only trusts a write it has seen survive. */
import { test } from "node:test";
import assert from "node:assert/strict";

function lossyStore(){
  const data = new Map();
  let seq = 0;
  const tick = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 4)));
  const meta = r => ({ etag: r.etag, metadata: r.metadata || {} });
  return {
    async get(key){ await tick(); const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(key){ await tick(); const r = data.get(key); return r ? { data: JSON.parse(r.value), ...meta(r) } : null; },
    async getMetadata(key){ await tick(); const r = data.get(key); return r ? meta(r) : null; },
    async setJSON(key, value, opts = {}){
      const cur = data.get(key);
      if(opts.onlyIfNew && cur) return { modified: false };
      if(opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      await tick();
      data.set(key, { value: JSON.stringify(value), etag: "e" + (++seq), metadata: opts.metadata });
      return { modified: true };
    },
    async delete(key){ data.delete(key); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

process.env.LEADER_PIN = "999999";
const store = lossyStore();
const { default: handler, __setStoreFactory } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);
const roster = async () => (await handler(new Request("https://x/api?part=churches", { headers: { "x-leader-pin": "999999" } }), {})).json();

test("20 simultaneous church log writes all land on a store with non-atomic conditional writes", async () => {
  await roster();
  const run = "t" + Date.now().toString(36);
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => handler(new Request("https://x/api", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "churchLog", pin: "999999", payload: { id: run + "-" + i, ch: "zeal-movement-manchester", type: "note", by: "W" + i, note: "n" + i, t: "9:00 AM", d: "2026-10-12" } })
  }), {})));
  assert.ok(res.every(r => r.status === 200));
  const c = await roster();
  const got = c.log.filter(e => e.id.startsWith(run + "-")).map(e => e.id);
  assert.equal(new Set(got).size, 20, "every write survives, none duplicated");
  assert.equal(got.length, 20);
});
