#!/bin/sh
set -eu
app_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$app_root"
flutter="${FLUTTER:-$app_root/.toolchain/flutter/bin/flutter}"
dart="$(dirname "$flutter")/dart"
./native/min2phase/build_and_test.sh
CI=true "$dart" format --output=none --set-exit-if-changed lib test
CI=true "$flutter" analyze --fatal-infos
CI=true "$flutter" test --reporter expanded
