# Native macOS workspace (v1.23.0)

## What this is

Ambassador Companion now has a **separate macOS AppKit application**, targeting
macOS 13 or newer with a universal Apple Silicon / Intel executable. It is not
the iOS app running on a Mac, Mac Catalyst, or an Electron distribution.

The desktop window, sidebar, toolbar, menu bar, file panels, printing, and
keyboard commands are native AppKit. Feature views (event schedule, church
CRM, checklists, Tech I/O, captures and resources) reuse the existing HTML/JS
inside WebKit. This preserves one set of business rules and the same backend.
It does **not** claim that every feature was rewritten in SwiftUI/AppKit.

- Resizable window; remembers size/position, supports full screen and a
  collapsible, draggable native sidebar.
- Dedicated Event Day, Pre-Crusade, Specialists, Post, Resources, Trailer,
  Tech I/O, Quick Capture, Playbook and Counselor Booklet destinations.
- Content fills the detail pane. Two-column layouts are based on available
  pane width and collapse before a narrow window would clip them.
- Native menu and toolbar navigation: Command-1 through Command-9, Back /
  Forward, Command-F / Command-G find, Command-P print, zoom and standard edit
  commands. Control-Command-S toggles the sidebar.
- Save/Open panels for downloads and uploads. External HTTPS, email and phone
  links open in their default app, never replace the workspace.

## Content, privacy and authentication

The hosted build bundles the same resources as the mobile app; it can open
without a network connection. It uses a stable `capacitor://localhost` origin,
which is already on the backend's narrow mobile CORS allowlist. No new backend
origin, native HTTP proxy, credentials, or access exceptions are introduced.

WebKit's persistent data store retains the existing cached payload and outbox.
The desktop flag prevents this packaged `localhost` origin from being mistaken
for local development and showing fabricated demo announcements. Share links
always use the public HTTPS app address.

The existing Day PIN / leader authorization and queued writes remain unchanged.
Offline access follows the existing app's behavior; this is not a new offline
identity or bypass. Camera/mic access uses the normal system/WebKit prompt,
only for the app's bundled main frame. The app is sandboxed and has only
outbound network, camera/mic, and user-selected-file capabilities. It does not
listen on a local port or use private WebKit security APIs.

## Cloud build and validation

The `Native macOS validation` workflow (`.github/workflows/macos-validation.yml`)
compiles the Swift AppKit sources with Apple's SDK, creates a universal `.app`,
checks its sandbox/ad-hoc signature, runs native policy tests, and launches a
native WebKit smoke test on a GitHub-hosted macOS runner. No personal Mac is
needed to build release candidates.

Commands used by hosted CI:

```sh
npm ci --no-audit --no-fund
npm test
npm run build:macos
"build/macos/Ambassador Companion.app/Contents/MacOS/AmbassadorCompanion" --smoke-test
```

The smoke test uses a **nonpersistent data store with network fetch disabled**.
It checks the genuine native window and sidebar, the shared gate using a local
test fixture, no demo seeding, valid public share links, media API availability,
six pages at 800×600 / 1024×768 / 1440×900, hidden mobile tabs, pane width and
horizontal overflow, repeated navigation, Back/Forward, sidebar collapse and
zoom. It saves WebKit workspace screenshots in its sandbox temporary directory; CI
copies them and the test log into downloadable artifacts.
It never writes production data or requests a camera/mic permission.

Artifacts:

- `ambassador-companion-macos-universal-validation`: zipped universal `.app`
- `ambassador-companion-macos-test-evidence`: smoke log and screenshots

## Release gates still required

An **ad-hoc validation build is not a signed public release**. Before calling
the Mac app production-ready:

1. Confirm the exact commit's native macOS workflow and existing mobile/web
   validations pass; review the screenshots at all three sizes.
2. Run hardware/manual QA on a Mac: keyboard-only and VoiceOver navigation;
   close/reopen and offline relaunch with a cached payload and pending outbox;
   camera/mic grant, denial and cancellation; file-save cancellation/overwrite;
   CSV/photo/video download and upload; print/PDF; full-screen; interrupted PIN
   and leader flows; real backend sync across devices.
3. Add/verify the macOS platform in the existing App Store Connect app record
   if distributing through the Mac App Store. Bundle identity remains
   `com.thefourthministries.ambassadorcompanion`; no store record is created by
   this code. Confirm universal-purchase/platform choices before submission.
4. Provision appropriate **Mac** signing/distribution assets using a secure
   flow. Existing iOS provisioning profiles do not sign macOS applications.
   A Mac App Store release needs the Mac distribution/app and installer setup;
   a direct distribution needs Developer ID signing and Apple notarization.
5. Add a separately authorized signed macOS release workflow using those
   verified assets; complete macOS screenshots/review metadata and obtain
   production-submission approval. This PR does not submit or publish a Mac
   release and never disables Gatekeeper.

At implementation time, Linux can validate JS/contracts and prepare resources.
Only a passing hosted macOS run establishes successful native compilation and
smoke-test execution. Do not describe unrun checks as passed.
