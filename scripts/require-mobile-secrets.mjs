/* Prints which GitHub Actions secrets are set (names only) and exits 1 if
   any required name for the requested group is missing. Never prints values. */

const GROUPS = {
  android: [
    "ANDROID_KEYSTORE_BASE64",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD"
  ],
  play: [
    "PLAY_SERVICE_ACCOUNT_JSON"
  ],
  ios: [
    "IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64",
    "IOS_DISTRIBUTION_CERTIFICATE_PASSWORD",
    "IOS_PROVISIONING_PROFILE_BASE64",
    "IOS_TEAM_ID"
  ],
  testflight: [
    "APP_STORE_CONNECT_KEY_ID",
    "APP_STORE_CONNECT_ISSUER_ID",
    "APP_STORE_CONNECT_API_KEY_P8"
  ]
};

const requested = process.argv.slice(2);
if (!requested.length || requested.includes("help") || requested.includes("--help")) {
  console.log("Usage: node scripts/require-mobile-secrets.mjs <android|play|ios|testflight>...");
  process.exit(2);
}

const names = [];
for (const group of requested) {
  const list = GROUPS[group];
  if (!list) {
    console.error("Unknown secret group: " + group);
    process.exit(2);
  }
  for (const name of list) {
    if (!names.includes(name)) names.push(name);
  }
}

let missing = 0;
for (const name of names) {
  const present = !!(process.env[name] && String(process.env[name]).length);
  console.log(name + ": " + (present ? "set" : "MISSING"));
  if (!present) missing++;
}

if (missing) {
  console.error("");
  console.error(missing + " required GitHub Actions secret(s) missing.");
  console.error("Paste real values at Settings → Secrets and variables → Actions.");
  console.error("Checklist: docs/store-release/SECRETS.md");
  console.error("This workflow does not submit to production.");
  process.exit(1);
}

console.log("All requested secrets are present (values not shown).");
