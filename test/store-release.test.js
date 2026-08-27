import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ID,
  APP_NAME,
  USAGE,
  setPlistString,
  setPlistFalse,
  ensureAndroidPermission,
  ensureAndroidFeature,
  setUsesCleartextTrafficFalse,
  patchGradleVersionsAndSigning,
  patchPbxVersions
} from "../scripts/patch-native.mjs";
import { mobileVersionCode, readAppVersion, versionCodeFromName } from "../scripts/app-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("permanent identity is consistent across config and docs", () => {
  const cap = JSON.parse(read("capacitor.config.json"));
  assert.equal(cap.appId, APP_ID);
  assert.equal(cap.appName, APP_NAME);
  assert.equal(cap.webDir, "dist");
  assert.equal(cap.server.androidScheme, "https");
  assert.equal(cap.android.allowMixedContent, false);
  assert.equal(cap.ios.contentInset, "never");
  assert.equal(cap.ios.infoPlist.UIStatusBarStyle, "UIStatusBarStyleLightContent");
  assert.equal(cap.plugins.SystemBars.insetsHandling, "css");
  assert.equal(cap.plugins.SystemBars.style, "LIGHT");

  const storeReadme = read("docs/store-release/README.md");
  assert.match(storeReadme, /com\.thefourthministries\.ambassadorcompanion/);
  assert.match(storeReadme, /Ambassador Companion/);
  assert.match(storeReadme, /https:\/\/ambassadorcompanion\.netlify\.app/);
  assert.match(storeReadme, /info@thefourthministries\.com/);
});

test("privacy and support pages exist and name the publisher", () => {
  for (const file of ["privacy.html", "support.html"]) {
    const html = read(file);
    assert.match(html, /The Fourth Ministries, Inc\./);
    assert.match(html, /info@thefourthministries\.com/);
  }
  assert.match(read("index.html"), /href="privacy.html"/);
});

test("draft listings are marked DRAFT NOT LIVE and stay within field limits", () => {
  const ios = read("docs/store-release/app-store-listing.DRAFT.md");
  const play = read("docs/store-release/google-play-listing.DRAFT.md");
  assert.match(ios, /DRAFT NOT LIVE/);
  assert.match(play, /DRAFT NOT LIVE/);
  const short = play.match(/```\n([^\n]+)\n```/)[1];
  assert.ok(short.length <= 80, "Play short description is " + short.length);
  const keywords = ios.match(/```\n([^\n]+)\n```/)[1];
  assert.ok(keywords.length <= 100, "iOS keywords are " + keywords.length);
  assert.match(ios, /https:\/\/ambassadorcompanion\.netlify\.app\/privacy\.html/);
  assert.match(play, /https:\/\/ambassadorcompanion\.netlify\.app\/privacy\.html/);
  assert.match(ios, /Support:\*\* https:\/\/ambassadorcompanion\.netlify\.app\/privacy\.html/);
  assert.match(play, /thefourthministries@gmail\.com/);
  assert.match(ios, /Productivity/);
  assert.match(play, /Productivity/);
});

test("capacitor.config.json holds camera, mic, and photo library usage strings", () => {
  const cap = JSON.parse(read("capacitor.config.json"));
  const plist = cap.ios.infoPlist;
  for (const key of [
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSPhotoLibraryAddUsageDescription"
  ]) {
    assert.equal(typeof plist[key], "string");
    assert.ok(plist[key].length > 20);
    assert.match(plist[key], /Ambassador Companion/);
  }
  assert.ok(cap.android.permissions.includes("android.permission.CAMERA"));
  assert.ok(cap.android.permissions.includes("android.permission.RECORD_AUDIO"));
  assert.equal(USAGE.NSCameraUsageDescription, plist.NSCameraUsageDescription);
});

test("data.mjs has no leftover hardcoded Day PIN fallback", () => {
  const src = read("netlify/functions/data.mjs");
  assert.doesNotMatch(src, /DEFAULT_DAY_PIN/);
  assert.doesNotMatch(src, /retire the old 0627/);
  assert.match(src, /pinMatchesLeader/);
  assert.match(src, /fails closed/);
});

test("secrets checklist names required GitHub Actions secrets without values", () => {
  const secrets = read("docs/store-release/SECRETS.md");
  for (const name of [
    "ANDROID_KEYSTORE_BASE64",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
    "PLAY_SERVICE_ACCOUNT_JSON",
    "IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64",
    "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD",
    "IOS_PROVISIONING_PROFILE_BASE64",
    "IOS_TEAM_ID",
    "APP_STORE_CONNECT_KEY_ID",
    "APP_STORE_CONNECT_ISSUER_ID",
    "APP_STORE_CONNECT_API_KEY_P8"
  ]) {
    assert.match(secrets, new RegExp("`" + name + "`"));
  }
  assert.doesNotMatch(secrets, /BEGIN (PRIVATE KEY|CERTIFICATE)/);
  assert.doesNotMatch(secrets, /"private_key"/);
});

test("signed workflow is dispatch-only and never mentions production submit", () => {
  const wf = read(".github/workflows/mobile-signed-internal.yml");
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /\n  push:/);
  assert.doesNotMatch(wf, /\n  pull_request:/);
  assert.match(wf, /track: internal/);
  assert.match(wf, /status: draft/);
  assert.match(wf, /altool --upload-app/);
  assert.doesNotMatch(wf, /submitForReview|production\s*track|track: production|halt-track/i);
});

test("iOS jobs use macos-26 so App Store Connect gets the iOS 26 SDK", () => {
  const signed = read(".github/workflows/mobile-signed-internal.yml");
  const validation = read(".github/workflows/mobile-validation.yml");
  assert.match(signed, /ios-signed:[\s\S]*runs-on: macos-26/);
  assert.match(validation, /name: iOS unsigned simulator build[\s\S]*runs-on: macos-26/);
  assert.doesNotMatch(signed, /runs-on: macos-15/);
  assert.doesNotMatch(validation, /runs-on: macos-15/);
  assert.match(signed, /xcode-select -s \/Applications\/Xcode\.app/);
  assert.match(signed, /--sdk iphoneos --show-sdk-version/);
});

test("store 1024 icon is opaque RGB", () => {
  const icon = readFileSync(join(root, "resources/icon.png"));
  assert.equal(icon[0], 0x89);
  const header = icon.toString("ascii", 1, 4);
  assert.equal(header, "PNG");
  const colorType = icon[25];
  assert.equal(colorType, 2, "PNG color type should be 2 (RGB, no alpha)");
  const width = icon.readUInt32BE(16);
  const height = icon.readUInt32BE(20);
  assert.equal(width, 1024);
  assert.equal(height, 1024);
  assert.ok(existsSync(join(root, "resources/ios/AppIcon-1024.png")));
  assert.ok(existsSync(join(root, "resources/splash.png")));
});

test("native patcher writes usage strings, HTTPS flag, versions, and signing hooks", () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>My App</string>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
</dict>
</plist>`;
  let next = setPlistString(plist, "CFBundleDisplayName", APP_NAME);
  next = setPlistString(next, "NSCameraUsageDescription", "camera reason");
  next = setPlistFalse(next, "ITSAppUsesNonExemptEncryption");
  assert.match(next, /Ambassador Companion/);
  assert.match(next, /NSCameraUsageDescription/);
  assert.match(next, /ITSAppUsesNonExemptEncryption/);
  assert.match(next, /<false\/>/);
  next = setPlistString(next, "NSCameraUsageDescription", "camera reason again");
  assert.equal((next.match(/NSCameraUsageDescription/g) || []).length, 1);

  let manifest = `<manifest><application android:label="@string/app_name"></application>\n</manifest>`;
  manifest = setUsesCleartextTrafficFalse(manifest);
  manifest = ensureAndroidPermission(manifest, "android.permission.CAMERA");
  manifest = ensureAndroidFeature(manifest, "android.hardware.camera", false);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(manifest, /android.permission.CAMERA/);
  assert.match(manifest, /android.hardware.camera/);
  const again = ensureAndroidPermission(manifest, "android.permission.CAMERA");
  assert.equal((again.match(/android.permission.CAMERA/g) || []).length, 1);

  const gradle = `android {
    defaultConfig {
        applicationId "com.getcapacitor.app"
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}`;
  const patched = patchGradleVersionsAndSigning(gradle, 42, "1.18.0");
  assert.match(patched, /versionCode 42/);
  assert.match(patched, /versionName "1.18.0"/);
  assert.match(patched, /signingConfigs/);
  assert.match(patched, /signingConfig signingConfigs.release/);

  const pbx = "MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\n";
  const pbxPatched = patchPbxVersions(pbx, 42, "1.18.0");
  assert.match(pbxPatched, /MARKETING_VERSION = 1.18.0;/);
  assert.match(pbxPatched, /CURRENT_PROJECT_VERSION = 42;/);
});

test("app version helpers read the badge and prefer the CI run number", () => {
  const version = readAppVersion(read("index.html"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(versionCodeFromName("1.18.0"), 11800);
  assert.equal(mobileVersionCode("1.18.0", "77"), 77);
  assert.equal(mobileVersionCode("1.18.0", ""), 11800);
});

test("require-mobile-secrets fails closed when names are empty", () => {
  const missing = spawnSync(process.execPath, ["scripts/require-mobile-secrets.mjs", "android"], {
    cwd: root,
    env: { ...process.env, ANDROID_KEYSTORE_BASE64: "", ANDROID_KEYSTORE_PASSWORD: "", ANDROID_KEY_ALIAS: "", ANDROID_KEY_PASSWORD: "" },
    encoding: "utf8"
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout + missing.stderr, /ANDROID_KEYSTORE_BASE64: MISSING/);
  assert.doesNotMatch(missing.stdout + missing.stderr, /MII/);

  const present = spawnSync(process.execPath, ["scripts/require-mobile-secrets.mjs", "android"], {
    cwd: root,
    env: {
      ...process.env,
      ANDROID_KEYSTORE_BASE64: "x",
      ANDROID_KEYSTORE_PASSWORD: "x",
      ANDROID_KEY_ALIAS: "x",
      ANDROID_KEY_PASSWORD: "x"
    },
    encoding: "utf8"
  });
  assert.equal(present.status, 0);
});
