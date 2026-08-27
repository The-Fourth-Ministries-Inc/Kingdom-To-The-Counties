/* Leader PIN must fail closed when the Netlify env var is missing.
   An empty submitted PIN must not match an empty configured PIN. */
import { test } from "node:test";
import assert from "node:assert/strict";

function mockStore(){
  const data = new Map();
  let seq = 0;
  return {
    _data: data,
    async get(key, _o){ const r = data.get(key); return r ? JSON.parse(r.value) : null; },
    async getWithMetadata(key, _o){
      const r = data.get(key);
      return r ? { data: JSON.parse(r.value), etag: r.etag } : null;
    },
    async setJSON(key, value, opts){
      const cur = data.get(key);
      if(opts && opts.onlyIfNew && cur) return { modified:false };
      if(opts && opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified:false };
      data.set(key, { value: JSON.stringify(value), etag: "e" + (++seq) });
      return { modified:true };
    },
    async set(key, value){ data.set(key, { value: JSON.stringify(value), etag:"e"+(++seq) }); return { modified:true }; },
    async delete(key){ data.delete(key); },
    async list({ prefix }){ return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const store = mockStore();
process.env.LEADER_PIN = "999999";
const { default: handler, __setStoreFactory } = await import("../netlify/functions/data.mjs");
__setStoreFactory(() => store);

const post = (action, pin, extra = {}) => handler(new Request("https://x/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action, pin, ...extra })
}), {});

test("verifyLeaderPin fails closed when LEADER_PIN is unset, including empty PIN", async () => {
  const prev = process.env.LEADER_PIN;
  delete process.env.LEADER_PIN;
  try {
    const empty = await post("verifyLeaderPin", "");
    assert.equal(empty.status, 403);
    const emptyBody = await empty.json();
    assert.equal(emptyBody.ok, undefined);
    assert.doesNotMatch(JSON.stringify(emptyBody), /999999|LEADER_PIN/);
    const guess = await post("verifyLeaderPin", "999999");
    assert.equal(guess.status, 403);
  } finally {
    process.env.LEADER_PIN = prev;
  }
});

test("verifyLeaderPin fails closed when LEADER_PIN is an empty string", async () => {
  const prev = process.env.LEADER_PIN;
  process.env.LEADER_PIN = "";
  try {
    const empty = await post("verifyLeaderPin", "");
    assert.equal(empty.status, 403);
    const guess = await post("verifyLeaderPin", "0000");
    assert.equal(guess.status, 403);
  } finally {
    process.env.LEADER_PIN = prev;
  }
});

test("verifyLeaderPin still succeeds with the configured PIN", async () => {
  process.env.LEADER_PIN = "999999";
  const ok = await post("verifyLeaderPin", "999999");
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.token, "string");
  assert.ok(body.token.length >= 16);
});
