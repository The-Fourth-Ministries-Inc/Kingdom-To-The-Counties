# GitHub Actions secrets for signed store builds

This is a checklist for a human (or Log) to paste **real** Apple and Google
credentials into this repository's GitHub Actions secrets.

**Do not invent values. Do not commit keystores, `.p12`, `.p8`, or provisioning
profiles.** After they exist, run the `Mobile signed internal` workflow from
the Actions tab. That workflow never submits a production release.

As of 2026-08-26 this repository reported **zero** Actions secrets. A later
agent run could not list secrets (`gh secret list` returned HTTP 403). Treat
every name below as missing until a human confirms it in
Settings → Secrets and variables → Actions.

## How to add them

Repository → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Name must match exactly.

## Android signing (required to produce a Play-uploadable AAB)

| Secret name | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The Play **upload** keystore (`.jks` or `.p12`) encoded as a single base64 string. This is the upload key for Play App Signing, not Google's app-signing key. |
| `ANDROID_KEYSTORE_PASSWORD` | Password that opens that keystore. |
| `ANDROID_KEY_ALIAS` | Alias of the upload key inside the keystore. |
| `ANDROID_KEY_PASSWORD` | Password for that alias (often the same as the keystore password). |

Create the upload keystore once, keep a sealed offline copy, then:

```
base64 -i upload-keystore.jks | tr -d '\n'
```

Paste the output into `ANDROID_KEYSTORE_BASE64`. Do not generate this keystore
inside CI — the private key would only exist for one run.

## Google Play internal testing upload (optional until you tick "upload")

| Secret name | What it is |
| --- | --- |
| `PLAY_SERVICE_ACCOUNT_JSON` | Full JSON key of a Google Cloud service account that has been invited to the Play Console app with permission to **release to testing tracks**. Do not grant production-release permission unless a human later decides to. |

The Play app record for `com.thefourthministries.ambassadorcompanion` must
already exist. The first AAB also needs Play App Signing enrolled. The workflow
uploads to the **internal** track with `status: draft` only.

## iOS signing (required to produce a TestFlight IPA)

| Secret name | What it is |
| --- | --- |
| `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64` | Apple **Distribution** certificate exported as a `.p12`, encoded as a single base64 string. |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting that `.p12`. |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store distribution provisioning profile for bundle id `com.thefourthministries.ambassadorcompanion`, encoded as a single base64 string. |
| `IOS_TEAM_ID` | 10-character Apple Developer Team ID for The Fourth Ministries, Inc. |

Optional:

| Secret name | What it is |
| --- | --- |
| `IOS_PROVISIONING_PROFILE_NAME` | Exact `Name` inside the provisioning profile. If omitted, CI reads it from the profile. |

## TestFlight upload (optional until you tick "upload")

| Secret name | What it is |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | Key ID of an App Store Connect API key (the `AuthKey_XXXXXX` id). |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID shown on the App Store Connect API keys page. |
| `APP_STORE_CONNECT_API_KEY_P8` | Contents of the `AuthKey_XXXXXX.p8` file (the PEM text). |

The App Store Connect app record for `com.thefourthministries.ambassadorcompanion`
must already exist. Uploading a build sends it to TestFlight processing. It
does **not** submit the app for App Store review.

## What this repo will not store as a secret

- Apple ID password or app-specific passwords (use the API key instead)
- Google account password for `thefourthministries@gmail.com`
- Play production review / production-track credentials
- Any value invented by an agent

## After secrets exist

1. Actions → **Mobile signed internal** → Run workflow.
2. Leave **upload_internal** unchecked the first time. Confirm the signed AAB
   and IPA artifacts.
3. Re-run with **upload_internal** checked only after the Play app and App
   Store Connect app records exist.
4. Production submission is a separate, explicit human approval. There is no
   production-submit workflow on purpose.
