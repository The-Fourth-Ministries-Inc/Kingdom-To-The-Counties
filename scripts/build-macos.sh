#!/bin/bash
# A real AppKit executable, not an iOS simulator, Catalyst or Electron app.
# Run on a GitHub-hosted Mac; signing/distribution is a separate release gate.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Native macOS compilation requires Apple's macOS SDK on a Mac runner." >&2
  exit 1
fi
npm run prepare:macos
APP="build/macos/Ambassador Companion.app"
CONTENTS="$APP/Contents"
mkdir -p "$CONTENTS/MacOS" build/macos/objects build/macos/test-results
SDK="$(xcrun --sdk macosx --show-sdk-path)"
for ARCH in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -O -sdk "$SDK" -target "$ARCH-apple-macos13.0" \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    macos/AmbassadorCompanion/*.swift -o "build/macos/objects/AmbassadorCompanion-$ARCH"
done
xcrun lipo -create build/macos/objects/AmbassadorCompanion-arm64 \
  build/macos/objects/AmbassadorCompanion-x86_64 -output "$CONTENTS/MacOS/AmbassadorCompanion"
ICONSET="build/macos/AppIcon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" icon-512.png --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" icon-512.png --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"
plutil -lint "$CONTENTS/Info.plist" macos/AmbassadorCompanion/AmbassadorCompanion.entitlements
# Ad-hoc signing validates the sandbox locally; this is NOT Developer ID or
# Mac App Store signing, notarization, or a production-distributable artifact.
codesign --force --sign - --entitlements macos/AmbassadorCompanion/AmbassadorCompanion.entitlements "$APP"
codesign --verify --deep --strict "$APP"
xcrun lipo -verify_arch arm64 x86_64 "$CONTENTS/MacOS/AmbassadorCompanion"
xcrun swiftc -swift-version 5 macos/AmbassadorCompanion/WorkspacePolicy.swift \
  macos/Tests/PolicyTests.swift -o build/macos/policy-tests
build/macos/policy-tests
printf '\nBuilt universal native macOS validation app: %s\n' "$APP"
