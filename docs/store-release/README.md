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

These technical identifiers are intended to be permanent once store records are created.

## Cloud-only release rule

GitHub is the source of truth. Mobile projects, signed artifacts, and store uploads are produced by hosted CI runners. Do not create release artifacts on a personal computer and upload them later.

## Release gates

1. Web tests and syntax checks pass.
2. Android and iOS unsigned validation builds pass in GitHub Actions.
3. The privacy policy is public in the app and store metadata.
4. Netlify secrets are configured with no production credential fallback.
5. Signed builds reach Play internal testing and TestFlight.
6. Production submission requires an explicit final approval.
