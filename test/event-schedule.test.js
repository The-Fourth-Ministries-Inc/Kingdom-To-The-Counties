import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { normalizeSegments } from "../netlify/functions/event-schedule.mjs";

const defaults = [
 {s:480,e:510,name:"Early call",group:"setup",music:"setup",meta:"Radios"},
 {s:840,e:850,name:"Welcome",group:"program",music:"soft"},
 {s:850,e:865,name:"Worship Set 1",group:"program",music:"fullband"}
];
const copy = x => JSON.parse(JSON.stringify(x));
function mockStore(){
 const data = new Map(); let seq = 0;
 return {
  async get(k){ const r=data.get(k); return r?JSON.parse(r.value):null; },
  async getWithMetadata(k){ const r=data.get(k); return r?{data:JSON.parse(r.value),etag:r.etag}:null; },
  async setJSON(k,v,o){const r=data.get(k);
   if(o&&o.onlyIfNew&&r)return {modified:false};
   if(o&&o.onlyIfMatch&&(!r||r.etag!==o.onlyIfMatch))return {modified:false};
   data.set(k,{value:JSON.stringify(v),etag:"e"+(++seq)});return {modified:true};},
  async set(k,v){return this.setJSON(k,v);},
  async delete(k){data.delete(k);},
  async list({prefix}){return {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
 };
}
process.env.LEADER_PIN="999999";
const { default:handler, __setStoreFactory } = await import("../netlify/functions/data.mjs");
const store=mockStore();__setStoreFactory(()=>store);
const post=(action,payload={},pin="999999")=>handler(new Request("https://x/api",{
 method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload,pin})
}),{});
const get=(headers={"x-leader-pin":"999999"})=>handler(new Request("https://x/api",{headers}),{});
const save=(segments,baseRev,saveId,county="rockingham",pin="999999")=>post("setSchedule",{county,segments,baseRev,saveId,by:"Leader"},pin);

test("schedule validation refuses broken clocks and strips unrelated data",()=>{
 assert.deepEqual(normalizeSegments(defaults).map(s=>[s.s,s.e]),[[480,510],[840,850],[850,865]]);
 for(const bad of [null,[],Array(61).fill(defaults[0])])assert.equal(normalizeSegments(bad),null);
 for(const fields of [{s:null},{s:"480"},{s:480.5},{s:-1},{e:480},{e:1440},{name:" "},{group:"bad"},{music:"bad"}]){
  assert.equal(normalizeSegments([{...defaults[0],...fields}]),null,JSON.stringify(fields));
 }
 assert.equal(normalizeSegments([defaults[1],defaults[0]]),null);
 assert.equal(normalizeSegments([defaults[0],{...defaults[1],s:500}]),null);
 assert.equal("private" in normalizeSegments([{...defaults[0],private:"discard"}])[0],false);
});

test("leader saves sync through the real handler; volunteers cannot change them",async()=>{
 await post("setCounty",{county:"rockingham"});
 const locked=await get({});const lock=await locked.json();assert.equal(lock.locked,true);assert.equal(lock.schedule,undefined);
 const refused=await save(defaults,0,"no-permission","rockingham","1010");assert.equal(refused.status,403);
 const first=await save(defaults,0,"first-save");assert.equal(first.status,200);
 const body=await first.json();assert.equal(body.schedule.rev,1);
 const reader=await get({"x-day-pin":"1010"});const etag=reader.headers.get("etag");
 assert.deepEqual((await reader.json()).schedule.segments.map(s=>s.s),[480,840,850]);
 const same=await save(defaults,0,"first-save");assert.equal((await same.json()).schedule.rev,1,"retry is idempotent");
 const changed=copy(defaults);changed[1].s+=5;changed[1].e+=5;changed[2].s+=5;changed[2].e+=5;
 assert.equal((await save(changed,1,"second-save")).status,200);
 const refreshed=await get({"x-day-pin":"1010","if-none-match":etag});assert.equal(refreshed.status,200);
 assert.equal((await refreshed.json()).schedule.segments[1].s,845,"poll discovers the schedule change");
 assert.equal((await save(defaults,1,"stale-leader")).status,409);
 const unchanged=await get();assert.equal((await unchanged.json()).schedule.rev,2);
});

test("event changes, concurrent leaders, legacy board writes, and reset preserve schedules",async()=>{
 await post("setCounty",{county:"cheshire"});
 assert.equal((await save(defaults,2,"wrong-county")).status,409);
 assert.equal((await (await get()).json()).schedule,null,"different county has its own schedule");
 const attempts=await Promise.all([save(defaults,0,"leader-a","cheshire"),save(defaults,0,"leader-b","cheshire")]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
 await post("setEvent",{name:"Cheshire County",date:"2026-08-15"});
 await post("reset");
 assert.equal((await (await get()).json()).schedule.rev,1,"board reset and old-client event edits do not erase times");
 await post("setCounty",{county:"rockingham"});
 assert.equal((await (await get()).json()).schedule.segments[1].s,845,"switching back restores that event's times");
 const restore=await save(null,2,"restore-original");assert.equal(restore.status,200);
 assert.equal((await restore.json()).schedule.segments,null);
 assert.equal((await (await get()).json()).schedule.rev,3,"restore keeps conflict protection");
 const invalid=copy(defaults);invalid[2].s=840;
 assert.equal((await save(invalid,3,"overlap")).status,400);
 assert.equal((await (await get()).json()).schedule.rev,3);
});

const root=new URL("../",import.meta.url);
const client=readFileSync(new URL("js/schedule.js",root),"utf8");
const app=readFileSync(new URL("js/app-core.js",root),"utf8");
function functionSource(name){
 const start=app.indexOf("function "+name+"("),body=app.indexOf("{",start);let depth=0;
 for(let i=body;i<app.length;i++){if(app[i]==="{")depth++;else if(app[i]==="}"&&!--depth)return app.slice(start,i+1);}
 throw new Error("missing "+name);
}
function clientContext(){
 const nodes={};
 const context={SEGMENTS:copy(defaults),STATE:{county:"rockingham",schedule:null,event:{name:"Rockingham"}},LEADER:true,LIVE:true,inflight:0,
  document:{getElementById:id=>nodes[id]||(nodes[id]={innerHTML:"",textContent:"",querySelectorAll:()=>[]})},
  uid:()=>"request-id",esc:s=>String(s||"").replace(/</g,"&lt;"),myTag:()=>"Leader",confirm:()=>true,
  saveCache:s=>{context.cached=copy(s);},renderSpine:()=>context.scApply(),renderNow:()=>{},renderStrip:()=>{},toast:()=>{},askPin:()=>{}};
 vm.createContext(context);vm.runInContext(client,context);
 return {context,nodes};
}
test("offline cache uses live times and returns to defaults when switching events",()=>{
 const {context:c}=clientContext();c.scApply();
 c.STATE.schedule={segments:[{...defaults[0],s:490,e:520}]};c.scApply();assert.equal(c.SEGMENTS[0].s,490);
 c.STATE.schedule=null;c.STATE.county="cheshire";c.scApply();assert.equal(c.SEGMENTS.length,3);assert.equal(c.SEGMENTS[0].s,480);
 c.STATE.schedule={segments:[]};c.scApply();assert.equal(c.SEGMENTS.length,3,"bad cache cannot empty the schedule");
 c.STATE.schedule={segments:[{...defaults[0],s:490,e:520}]};c.STATE.locked=true;c.scApply();assert.equal(c.SEGMENTS[0].s,480);
 vm.runInContext(functionSource("normalize"),c);
 const normalized=c.normalize({schedule:{rev:5,segments:defaults}});assert.equal(normalized.schedule.rev,5);
});

test("editor retains a draft through polls, shifts from a chosen row, and reports offline/conflict failures",async()=>{
 const {context:c,nodes}=clientContext();c.scEdit();
 const html=nodes.scheduleBar.innerHTML;c.STATE.schedule={rev:1,segments:defaults};c.scRenderBar();assert.equal(nodes.scheduleBar.innerHTML,html);
 c.scShift(1,5);assert.equal(c.scDraft[0].s,480);assert.equal(c.scDraft[1].s,845);assert.equal(c.scDraft[2].e,870);
 c.scSetTime(1,"s","14:10");assert.equal(c.scDraft[1].s,850);
 c.LIVE=false;let requests=0;c.apiPost=()=>{requests++;return Promise.resolve({});};c.scSave();
 assert.equal(requests,0);assert.match(nodes.scheduleError.textContent,/offline/);assert.ok(c.scDraft);
 c.LIVE=true;c.apiPost=()=>Promise.reject(409);c.scSave();await new Promise(r=>setImmediate(r));
 assert.match(nodes.scheduleError.textContent,/schedule changed/);assert.ok(c.scDraft);assert.equal(c.inflight,0);
 c.STATE.county="cheshire";c.scSave();assert.match(nodes.scheduleError.textContent,/event changed/);
});

test("successful save waits for server confirmation and caches the shared schedule",async()=>{
 const {context:c}=clientContext();c.scEdit();c.scShift(1,5);
 let payload,resolve;c.apiPost=(_action,p)=>{payload=p;return new Promise(r=>{resolve=r;});};
 c.scSave();assert.equal(c.STATE.schedule,null,"do not announce local edits as shared before confirmation");
 resolve({county:"rockingham",schedule:{rev:1,segments:payload.segments}});await new Promise(r=>setImmediate(r));
 assert.equal(c.SEGMENTS[1].s,845);assert.equal(c.cached.schedule.rev,1);assert.equal(c.scDraft,null);assert.equal(c.inflight,0);
});
