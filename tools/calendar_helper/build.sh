#!/usr/bin/env bash
# Build the Septena calendar helper as a proper .app bundle.
# macOS 14+ requires bundled Info.plist + designated path for TCC prompts.
set -euo pipefail
cd "$(dirname "$0")"

APP=CalendarHelper.app
BIN_NAME=calendar_helper
mkdir -p "$APP/Contents/MacOS"
cp Info.plist "$APP/Contents/Info.plist"

clang -fobjc-arc -O2 -framework Foundation -framework EventKit \
    main.m -o "$APP/Contents/MacOS/$BIN_NAME"

# Ad-hoc sign the bundle — gives TCC a stable designated-requirement.
codesign --force --deep --sign - "$APP"

# Convenience symlink at the old path so callers can invoke a single file.
ln -sf "$APP/Contents/MacOS/$BIN_NAME" "$BIN_NAME"

echo "Built $(pwd)/$APP"
