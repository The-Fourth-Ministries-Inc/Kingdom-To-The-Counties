# Ambassador Companion mobile-store release

This directory tracks the cloud-only release of **Ambassador Companion** to the Apple App Store and Google Play.

## Permanent identity

- Display name: Ambassador Companion
- iOS bundle identifier: `com.thefourthministries.ambassadorcompanion`
- Android application ID: `com.thefourthministries.ambassadorcompanion`
- Publisher: The Fourth Ministries, Inc.
- Google Play account owner: `thefourthministries@gmail.com`
- Public privacy and support contact: `info@thefourthministries.com`
- Production web and API origin: <https://ambassadorcompanion.netlify.app>
- Privacy policy: <https://ambassadorcompanion.netlify.app/privacy.html>
- Support page: <https://ambassadorcompanion.netlify.app/support.html>

These technical identifiers are intended to be permanent once store records are created.

Verified in-repo (this pass): `capacitor.config.json` uses the same `appId` and
`appName`; unsigned validation CI sets `MOBILE_API_ORIGIN` to the production
origin; `scripts/prepare-mobile.mjs` writes that origin into `mobile-runtime.js`
and bundles `privacy.html` plus `support.html`.

## Cloud-only release rule

GitHub is the source of truth. Mobile projects, signed artifacts, and store uploads are produced by hosted CI runners. Do not create release artifacts on a personal computer and upload them later.

Native `android/` and `ios/` folders are generated in CI with `npx cap add` and
are gitignored. After add/sync, `scripts/patch-native.mjs` writes camera/mic
usage strings, HTTPS-only flags, K2C icons/splash, and version numbers.

## Release gates

1. Web tests and syntax checks pass.
2. Android and iOS unsigned validation builds pass in GitHub Actions.
3. The privacy policy is public in the app and store metadata.
4. Netlify secrets are configured with no production credential fallback.
5. Signed builds reach Play internal testing and TestFlight.
6. Production submission requires an explicit final approval.

## Status (2026-08-27)

| Gate | Status |
| --- | --- |
| 1 Web tests | Passing on `main` (`npm test` in Mobile validation). |
| 2 Unsigned Android/iOS | Passing on `main` (workflow `mobile-validation.yml`). |
| 3 Privacy / support URLs | In-app privacy link exists; `privacy.html` and `support.html` ship in the mobile shell. Store listing URLs are still **DRAFT**. |
| 4 Netlify secrets | Code no longer has a public leader-PIN fallback. A human should still confirm `LEADER_PIN` is set in Netlify. |
| 5 Signed internal / TestFlight | **Blocked on GitHub Actions secrets.** Workflow `mobile-signed-internal.yml` is dispatch-only and will not submit production. See [SECRETS.md](SECRETS.md). |
| 6 Production submit | Not automated. No production-submit workflow on purpose. |

Hypothesis checked this pass: after the in-repo identity/privacy/unsigned-CI
work, the first remaining blocker is **missing Apple/Play signing secrets**,
not app code. `gh secret list` was 403 from this agent; treat secrets as
absent until a human confirms otherwise.

## Files in this folder

- [SECRETS.md](SECRETS.md) — GitHub Actions secret **names** and what each is for (no values).
- [HUMAN-NEXT-STEPS.md](HUMAN-NEXT-STEPS.md) — exact console clicks after secrets exist.
- [app-store-listing.DRAFT.md](app-store-listing.DRAFT.md) — App Store copy. **Not live.**
- [google-play-listing.DRAFT.md](google-play-listing.DRAFT.md) — Play copy. **Not live.**
- [reviewer-notes.DRAFT.md](reviewer-notes.DRAFT.md) — review Day PIN placeholder. **Not live.**
