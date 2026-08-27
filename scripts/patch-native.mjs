import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mobileVersionCode, readAppVersionFromRepo } from "./app-version.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const APP_ID = "com.thefourthministries.ambassadorcompanion";
export const APP_NAME = "Ambassador Companion";
const CREAM = "#F5F2E9";
const capConfig = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8"));

export const USAGE = capConfig.ios && capConfig.ios.infoPlist
  ? capConfig.ios.infoPlist
  : {};

const ANDROID_PERMISSIONS = (capConfig.android && capConfig.android.permissions) || [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS"
];

const ANDROID_FEATURES = [
  { name: "android.hardware.camera", required: false },
  { name: "android.hardware.microphone", required: false }
];

export function setPlistString(xml, key, value) {
  const block = "<key>" + key + "</key>\n\t<string>" + value + "</string>";
  const re = new RegExp("<key>" + key + "</key>\\s*<string>[^<]*</string>");
  if (re.test(xml)) return xml.replace(re, block);
  return insertBeforePlistClose(xml, block);
}

export function setPlistFalse(xml, key) {
  const block = "<key>" + key + "</key>\n\t<false/>";
  const re = new RegExp("<key>" + key + "</key>\\s*<(true|false)/>");
  if (re.test(xml)) return xml.replace(re, block);
  return insertBeforePlistClose(xml, block);
}

function insertBeforePlistClose(xml, block) {
  const needle = "</dict>\n</plist>";
  const idx = xml.lastIndexOf(needle);
  if (idx === -1) throw new Error("Info.plist is missing a closing dict");
  return xml.slice(0, idx) + "\t" + block + "\n" + xml.slice(idx);
}

export function ensureAndroidPermission(xml, name) {
  if (xml.includes(`android:name="${name}"`)) return xml;
  return xml.replace(
    "</manifest>",
    `    <uses-permission android:name="${name}" />\n</manifest>`
  );
}

export function ensureAndroidFeature(xml, name, required) {
  if (xml.includes(`android:name="${name}"`)) return xml;
  return xml.replace(
    "</manifest>",
    `    <uses-feature android:name="${name}" android:required="${required}" />\n</manifest>`
  );
}

export function setUsesCleartextTrafficFalse(xml) {
  if (/android:usesCleartextTraffic=/.test(xml)) {
    return xml.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="false"');
  }
  return xml.replace("<application", '<application\n        android:usesCleartextTraffic="false"');
}

export function patchGradleVersionsAndSigning(gradle, versionCode, versionName) {
  let out = gradle.replace(/versionCode\s+\d+/, "versionCode " + versionCode);
  out = out.replace(/versionName\s+"[^"]+"/, 'versionName "' + versionName + '"');
  if (!/signingConfigs\s*\{/.test(out)) {
    out = out.replace(
      "    buildTypes {",
      `    signingConfigs {
        release {
            def ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (ksPath != null && ksPath.length() > 0) {
                storeFile file(ksPath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`
    );
  }
  if (!/signingConfig\s+signingConfigs\.release/.test(out)) {
    out = out.replace(
      /release\s*\{\s*\n\s*minifyEnabled/,
      "release {\n            signingConfig signingConfigs.release\n            minifyEnabled"
    );
  }
  return out;
}

export function patchPbxVersions(pbx, versionCode, versionName) {
  return pbx
    .replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = " + versionName + ";")
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + versionCode + ";");
}

async function copyIfPresent(from, to) {
  if (!existsSync(from)) throw new Error("missing store asset: " + from);
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
}

async function patchIos(versionCode, versionName) {
  const plistPath = join(root, "ios/App/App/Info.plist");
  if (!existsSync(plistPath)) {
    console.log("skip iOS patch: ios/App/App/Info.plist not found");
    return;
  }
  let plist = await readFile(plistPath, "utf8");
  plist = setPlistString(plist, "CFBundleDisplayName", APP_NAME);
  for (const [key, value] of Object.entries(USAGE)) {
    plist = setPlistString(plist, key, value);
  }
  plist = setPlistFalse(plist, "ITSAppUsesNonExemptEncryption");
  await writeFile(plistPath, plist);

  const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
  if (existsSync(pbxPath)) {
    let pbx = await readFile(pbxPath, "utf8");
    pbx = patchPbxVersions(pbx, versionCode, versionName);
    pbx = pbx.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, "PRODUCT_BUNDLE_IDENTIFIER = " + APP_ID + ";");
    await writeFile(pbxPath, pbx);
  }

  await copyIfPresent(
    join(root, "resources/ios/AppIcon-1024.png"),
    join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
  );
  const splashSrc = join(root, "resources/splash.png");
  const splashDir = join(root, "ios/App/App/Assets.xcassets/Splash.imageset");
  await copyIfPresent(splashSrc, join(splashDir, "splash-2732x2732.png"));
  await copyIfPresent(splashSrc, join(splashDir, "splash-2732x2732-1.png"));
  await copyIfPresent(splashSrc, join(splashDir, "splash-2732x2732-2.png"));
  console.log("patched iOS native project (" + APP_ID + " " + versionName + " +" + versionCode + ")");
}

async function patchAndroid(versionCode, versionName) {
  const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");
  if (!existsSync(manifestPath)) {
    console.log("skip Android patch: android/app/src/main/AndroidManifest.xml not found");
    return;
  }
  let manifest = await readFile(manifestPath, "utf8");
  manifest = setUsesCleartextTrafficFalse(manifest);
  for (const name of ANDROID_PERMISSIONS) manifest = ensureAndroidPermission(manifest, name);
  for (const feature of ANDROID_FEATURES) {
    manifest = ensureAndroidFeature(manifest, feature.name, feature.required);
  }
  await writeFile(manifestPath, manifest);

  const gradlePath = join(root, "android/app/build.gradle");
  let gradle = await readFile(gradlePath, "utf8");
  gradle = patchGradleVersionsAndSigning(gradle, versionCode, versionName);
  await writeFile(gradlePath, gradle);

  const bgPath = join(root, "android/app/src/main/res/values/ic_launcher_background.xml");
  if (existsSync(bgPath)) {
    let bg = await readFile(bgPath, "utf8");
    bg = bg.replace(/<color name="ic_launcher_background">[^<]+<\/color>/, `<color name="ic_launcher_background">${CREAM}</color>`);
    await writeFile(bgPath, bg);
  }

  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  for (const density of densities) {
    const srcDir = join(root, "resources/android/mipmap-" + density);
    const destDir = join(root, "android/app/src/main/res/mipmap-" + density);
    for (const file of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      await copyIfPresent(join(srcDir, file), join(destDir, file));
    }
  }

  const splashSrc = join(root, "resources/splash.png");
  const splashTargets = [
    "drawable/splash.png",
    "drawable-land-hdpi/splash.png",
    "drawable-land-mdpi/splash.png",
    "drawable-land-xhdpi/splash.png",
    "drawable-land-xxhdpi/splash.png",
    "drawable-land-xxxhdpi/splash.png",
    "drawable-port-hdpi/splash.png",
    "drawable-port-mdpi/splash.png",
    "drawable-port-xhdpi/splash.png",
    "drawable-port-xxhdpi/splash.png",
    "drawable-port-xxxhdpi/splash.png"
  ];
  for (const rel of splashTargets) {
    const dest = join(root, "android/app/src/main/res", rel);
    if (existsSync(dirname(dest))) await copyIfPresent(splashSrc, dest);
  }
  console.log("patched Android native project (" + APP_ID + " " + versionName + " +" + versionCode + ")");
}

export async function patchNativeProjects(platforms) {
  const versionName = readAppVersionFromRepo();
  const versionCode = mobileVersionCode(versionName, process.env.GITHUB_RUN_NUMBER || process.env.MOBILE_VERSION_CODE);
  const wanted = platforms && platforms.length ? platforms : [];
  const doAndroid = !wanted.length || wanted.includes("android");
  const doIos = !wanted.length || wanted.includes("ios");
  if (doAndroid) await patchAndroid(versionCode, versionName);
  if (doIos) await patchIos(versionCode, versionName);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) await patchNativeProjects(process.argv.slice(2));
