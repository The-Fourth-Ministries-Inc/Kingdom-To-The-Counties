import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppVersion, versionCodeFromName } from "./app-version.mjs";

// Reuse the exact tested mobile content/API packaging. Native macOS resources
// are separate and never change the no-build-step public web deployment.
await import("./prepare-mobile.mjs");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "build", "macos", "Ambassador Companion.app", "Contents");
await mkdir(join(output, "Resources"), { recursive: true });
await rm(join(output, "Resources", "www"), { recursive: true, force: true });
await cp(join(root, "dist"), join(output, "Resources", "www"), { recursive: true, force: true });
for (const name of ["desktop.css", "desktop.js"]) {
  await cp(join(root, "macos", "AmbassadorCompanion", name), join(output, "Resources", name));
}
const version = readAppVersion(await readFile(join(root, "index.html"), "utf8"));
const build = process.env.MACOS_BUILD_NUMBER || String(versionCodeFromName(version));
if (!/^\d+(\.\d+){0,2}$/.test(build)) throw new Error("MACOS_BUILD_NUMBER must be a numeric bundle version");
const template = await readFile(join(root, "macos", "AmbassadorCompanion", "Info.plist"), "utf8");
await writeFile(join(output, "Info.plist"), template.replace("__APP_VERSION__", version).replace("__BUILD_NUMBER__", build));
console.log(`Prepared native macOS resources ${version} (${build})`);
