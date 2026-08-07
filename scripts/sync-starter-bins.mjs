/* Regenerates netlify/functions/starter-bins.mjs from data/bins.json (the
   single source of truth for the trailer roster, transcribed from the team's
   inventory Google Sheet).
   Run after editing data/bins.json:  node scripts/sync-starter-bins.mjs

   Validates as it goes, because a duplicate or missing bin id would silently
   break the self-seeding merge on the server (ids are how a leader's edit and
   a starter row are matched up). */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const src = JSON.parse(readFileSync(new URL("../data/bins.json", import.meta.url), "utf8"));
const bins = src.bins || [];
const secKeys = new Set((src.sections || []).map(s => s.key));
const trailerKeys = new Set((src.trailers || []).map(t => t.key));

const seen = new Set();
const problems = [];
for(const b of bins){
  if(!b.id) problems.push("a bin has no id: " + JSON.stringify(b).slice(0, 80));
  else if(seen.has(b.id)) problems.push("duplicate bin id: " + b.id);
  else seen.add(b.id);
  if(!secKeys.has(b.sec)) problems.push(b.id + ": unknown section '" + b.sec + "'");
  if(!Array.isArray(b.items)) problems.push(b.id + ": items must be an array");
}
for(const s of (src.sections || [])){
  if(!trailerKeys.has(s.trailer)) problems.push("section " + s.key + ": unknown trailer '" + s.trailer + "'");
}
/* A photo path that doesn't exist would render as a broken image on a phone in
   a field, so it fails the build here instead. */
for(const ph of (src.photos || [])){
  if(!ph.file || !existsSync(new URL("../" + ph.file, import.meta.url))) problems.push("photo file missing: " + ph.file);
  if(!Array.isArray(ph.match) || !ph.match.length) problems.push("photo " + ph.file + " has no match rules");
}
if(problems.length){
  console.error("data/bins.json has problems:\n - " + problems.join("\n - "));
  process.exit(1);
}

const payload = { trailers: src.trailers, sections: src.sections, photos: src.photos || [], bins };
const out = "/* AUTO-GENERATED from data/bins.json — do not edit by hand.\n"
  + "   Regenerate with: node scripts/sync-starter-bins.mjs\n\n"
  + "   The trailer roster as the team recorded it in their inventory sheet.\n"
  + "   Missing bins are merged into the live board on read (same self-seeding\n"
  + "   pattern as the starter scripts and churches); a bin a leader deletes is\n"
  + "   tombstoned and stays deleted, and leader edits are never overwritten. */\n"
  + "export default " + JSON.stringify(payload, null, 1) + ";\n";
writeFileSync(new URL("../netlify/functions/starter-bins.mjs", import.meta.url), out);

const counts = {};
for(const b of bins) counts[b.sec] = (counts[b.sec] || 0) + 1;
const located = bins.filter(b => (b.loc || "").trim());
const shot = located.filter(b => (src.photos || []).some(p => p.match.some(m => b.loc.toLowerCase().includes(m))));
console.log("starter-bins.mjs regenerated:", bins.length, "entries",
  "(" + Object.entries(counts).map(([k, v]) => k + " " + v).join(", ") + ")");
console.log("photos:", (src.photos || []).length, "— covering", shot.length + "/" + located.length, "located entries");
