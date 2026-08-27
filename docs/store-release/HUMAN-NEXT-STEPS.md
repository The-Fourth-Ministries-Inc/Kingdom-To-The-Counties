# Human next steps to reach Play internal testing and TestFlight

GitHub Actions can now **sign** Android and iOS builds on hosted runners.
It cannot mint Apple or Google accounts, and as of 2026-08-26 this repo had
**no** Actions secrets. That is the gate.

Production App Store / Play submit is **not** in CI. A human must click it.

## 0. Merge this PR (human)

Do not merge until unsigned `Mobile validation` is green on the PR.

## 1. Accounts and app records (human, outside GitHub)

### Apple

1. Enroll The Fourth Ministries, Inc. in the Apple Developer Program if it is
   not already enrolled.
2. In Certificates, Identifiers & Profiles, create App ID
   `com.thefourthministries.ambassadorcompanion`.
3. Create an Apple Distribution certificate. Export it as `.p12`.
4. Create an **App Store** distribution provisioning profile for that App ID.
5. In App Store Connect, create the app **Ambassador Companion** with that
   bundle id. Publisher: The Fourth Ministries, Inc.
6. Create an App Store Connect API key (Team / App Manager). Download the
   `.p8` once. Copy Key ID and Issuer ID.

### Google

1. Sign in to Play Console as `thefourthministries@gmail.com`.
2. Create the app **Ambassador Companion** with package
   `com.thefourthministries.ambassadorcompanion`.
3. Complete the draft listing, privacy URL, and content rating enough that
   Play allows an internal-testing release (Play will block uploads if the
   app declaration is incomplete).
4. Enroll in Play App Signing. Create an **upload** keystore locally, keep an
   offline copy, and register it if Play asks on first AAB.
5. In Google Cloud, create a service account, download its JSON key, and
   invite that account to the Play Console app with **Release to testing
   tracks** (not production).

## 2. Paste secrets into GitHub

Follow [SECRETS.md](SECRETS.md). Names must match exactly. No invented values.

## 3. Run signed CI without uploading

Actions → **Mobile signed internal** → Run workflow → platform `both`,
**upload_internal** off.

Expected: signed AAB + APK and signed IPA as artifacts. If the job fails on
`require-mobile-secrets`, a listed name is still empty.

## 4. Upload to internal testing / TestFlight

Re-run the same workflow with **upload_internal** on.

- Play: internal track, **draft** status. A human then reviews the draft in
  Play Console and can roll it out to internal testers.
- Apple: `altool` upload to App Store Connect. The build goes to TestFlight
  processing. A human adds testers. This is not Submit for Review.

## 5. Finish listings and screenshots

Use the DRAFT files in this folder. Capture screenshots from TestFlight / an
internal-testing device. Do not fabricate announcements or counts.

## 6. Production (explicit human approval only)

There is no GitHub workflow that submits to production. After internal testers
are happy, a human clicks Submit for Review / Production in the consoles.
