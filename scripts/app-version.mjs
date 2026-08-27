import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function readAppVersion(html) {
  const match = String(html).match(/<span class="ver">v?([\d.]+)<\/span>/);
  if (!match) throw new Error("version badge not found in index.html");
  return match[1];
}

export function readAppVersionFromRepo() {
  return readAppVersion(readFileSync(join(root, "index.html"), "utf8"));
}

export function versionCodeFromName(name) {
  const parts = String(name).split(".").map((n) => parseInt(n, 10) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}

export function mobileVersionCode(versionName, runNumber) {
  const base = versionCodeFromName(versionName);
  const run = parseInt(runNumber, 10);
  if (Number.isFinite(run) && run > 0) return run;
  return base;
}
