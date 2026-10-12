/* Look for earlier Tech I/O lineups in the production Blobs store. READ-ONLY.
 *
 *   NETLIFY_SITE_ID=<site id> NETLIFY_AUTH_TOKEN=<personal access token> \
 *     node scripts/recover-techio.mjs [--county rockingham] [--dump ~/k2c-io-dump]
 *
 * Prints every place a lineup survives — the live io~<county> blob (including
 * the legacy pre-v1.21 `list` an old app may have left there), io-history,
 * backup-*-reset / backup-*-io-restore snapshots, the nightly bak-day-*-io
 * copies, the bak-pre-v1.25.0-io copy and (v1.26.0+) the iosnap-* copy taken
 * before every write — with rev, who saved it, when, and
 * who is on it. --dump writes each one as JSON to a folder OUTSIDE the repo
 * (it holds names). Nothing is written to the store: to put a version back,
 * a leader uses Tech I/O → ↺ Restore… → "An earlier saved version" in the app.
 */
import { getStore } from "@netlify/blobs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ""; };
const county = (opt("--county") || "").toLowerCase();
const dump = opt("--dump");
const siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_AUTH_TOKEN;
if(!siteID || !token){
 console.error("Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (a personal access token) first.");
 process.exit(2);
}
const s = getStore({ name: process.env.K2C_STORE || "k2c-ambassador", siteID, token });

const keysWith = async prefix => ((await s.list({ prefix })).blobs || []).map(b => b.key).sort();
const found = [];
function note(where, rig, extra){
 if(!rig || !Array.isArray(rig.positions)) return;
 const people = [...new Set(rig.positions.map(p => p.person).filter(Boolean))];
 found.push({ where, rev: rig.rev || 0, savedAt: rig.savedAt || "", savedBy: rig.savedBy || "",
  from: (rig.from && rig.from.kind) || "", positions: rig.positions.length, people, rig, ...extra });
}
function noteList(where, list){
 if(!Array.isArray(list) || !list.length) return;
 const people = [...new Set(list.map(p => p && (p.name || p.person)).filter(Boolean))];
 found.push({ where, legacy: true, rows: list.reduce((n, p) => n + ((p && p.rows) || []).length, 0), people, list });
}
const wantKey = k => !county || k === "io~" + county || (k === "io" && !county);

for(const k of await keysWith("io")){
 if(k !== "io" && !/^io[~-]/.test(k)) continue;
 const v = await s.get(k, { type: "json" });
 if(k.startsWith("io-history")){
  if(county && k !== "io-history~" + county) continue;
  (v && v.list || []).forEach((e, i) => note(k + "[" + i + "]", e.rig, { why: e.why, at: e.at }));
  continue;
 }
 if(k === "io-template"){ note(k, v && v.rig); continue; }
 if(!wantKey(k)) continue;
 note(k + " (live)", v && v.rig);
 noteList(k + " legacy list", v && v.list);
}
for(const k of await keysWith("backup-")){
 if(!/-(reset|io-restore)$/.test(k)) continue;
 const b = await s.get(k, { type: "json" });
 const d = b && b.data;
 if(!d || (county && d.county && d.county !== county)) continue;
 note(k, d.io && d.io.rig, { at: b.at });
 noteList(k + " legacy list", d.io && d.io.list);
}
/* v1.26.0+: a copy of the blob taken before every single write. */
for(const k of await keysWith("iosnap-")){
 const m = /^iosnap-(.+)-(\d{13})-[a-z0-9]+-([A-Za-z]+)$/.exec(k);
 if(!m || (!wantKey(m[1]) && m[1] !== "io-template")) continue;
 const b = await s.get(k, { type: "json" });
 note(k, b && b.data && b.data.rig, { at: b && b.at, why: m[3] });
}
for(const k of [...await keysWith("bak-day-"), ...await keysWith("bak-pre-")]){
 if(!k.endsWith("-io")) continue;
 const b = await s.get(k, { type: "json" });
 for(const [ik, io] of Object.entries((b && b.keys) || {})){
  if(!/^io(~|$)/.test(ik) || !wantKey(ik)) continue;
  note(k + " → " + ik, io && io.rig, { at: b.at });
 }
}

if(!found.length) console.log("No Tech I/O lineups found" + (county ? " for " + county : "") + ".");
for(const f of found){
 console.log("\n" + f.where);
 if(f.legacy) console.log("  legacy roster · " + f.rows + " rows · " + f.people.join(", "));
 else console.log("  rev " + f.rev + " · saved " + (f.savedAt || "?") + (f.savedBy ? " by " + f.savedBy : "") +
  (f.from ? " · started from " + f.from : "") + (f.why ? " · replaced by a " + f.why : "") +
  "\n  " + f.positions + " positions · " + (f.people.join(", ") || "no names"));
}
if(dump){
 const dir = resolve(dump.replace(/^~(?=\/|$)/, process.env.HOME || "~"));
 if(dir.startsWith(resolve("."))){ console.error("\n--dump must point outside the repo (the files contain names)."); process.exit(2); }
 mkdirSync(dir, { recursive: true });
 found.forEach((f, i) => writeFileSync(join(dir, String(i).padStart(3, "0") + "-" + f.where.replace(/[^a-zA-Z0-9~._-]+/g, "_") + ".json"),
  JSON.stringify(f.rig || f.list, null, 1)));
 console.log("\nWrote " + found.length + " files to " + dir);
}
