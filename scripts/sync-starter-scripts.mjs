/* Regenerates netlify/functions/starter-scripts.mjs from data/scripts.json
   (the single source of truth for the Recording Studio starter scripts).
   Run after editing data/scripts.json:  node scripts/sync-starter-scripts.mjs */
import { readFileSync, writeFileSync } from "node:fs";
const scripts = JSON.parse(readFileSync(new URL("../data/scripts.json", import.meta.url), "utf8"));
const out = "/* AUTO-GENERATED from data/scripts.json — do not edit by hand.\n   Regenerate with: node scripts/sync-starter-scripts.mjs */\nexport default " + JSON.stringify(scripts, null, 1) + ";\n";
writeFileSync(new URL("../netlify/functions/starter-scripts.mjs", import.meta.url), out);
console.log("starter-scripts.mjs regenerated:", scripts.length, "scripts");
