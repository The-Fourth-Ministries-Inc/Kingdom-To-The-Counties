/* Parses every shipped script so a typo can't reach a phone in a field.
   The app has no build step, so nothing else would catch a syntax error
   before deploy — this is the cheapest possible safety net.
   Run via `npm test` (or on its own with `npm run check:syntax`). */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function fail(where, msg){
  failures++;
  console.error("✗ " + where + "\n  " + String(msg).split("\n")[0]);
}

// 1. Every standalone .js / .mjs file must parse.
const files = [
  ...readdirSync(join(root, "js")).filter(f => f.endsWith(".js")).map(f => join("js", f)),
  ...readdirSync(join(root, "netlify/functions")).filter(f => f.endsWith(".mjs")).map(f => join("netlify/functions", f)),
  ...readdirSync(join(root, "scripts")).filter(f => f.endsWith(".mjs")).map(f => join("scripts", f)),
  "sw.js"
];
for(const rel of files){
  try {
    execFileSync(process.execPath, ["--check", join(root, rel)], { stdio: "pipe" });
    console.log("✓ " + rel);
  } catch(e){
    fail(rel, (e.stderr && e.stderr.toString()) || e.message);
  }
}

// 2. Inline <script> blocks in index.html must parse too.
const html = readFileSync(join(root, "index.html"), "utf8");
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0;
while((m = re.exec(html))){
  i++;
  try { new Function(m[1]); console.log("✓ index.html inline block " + i); }
  catch(e){ fail("index.html inline block " + i, e.message); }
}

// 3. Every script the page references must actually exist.
const srcRe = /<script[^>]*\bsrc="([^"]+)"/g;
while((m = srcRe.exec(html))){
  const src = m[1];
  if(/^https?:/i.test(src)) continue;
  try { readFileSync(join(root, src)); console.log("✓ index.html references " + src); }
  catch(_){ fail("index.html references " + src, "file not found"); }
}

if(failures){
  console.error("\n" + failures + " syntax problem(s) found.");
  process.exit(1);
}
console.log("\nAll scripts parse.");
