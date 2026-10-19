#!/bin/sh
set -eu
app_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$app_root"
sdk=.toolchain/flutter
commit=adc901062556672b4138e18a4dc62a4be8f4b3c2
if [ ! -d "$sdk/.git" ]; then
  git clone --depth 1 --branch 3.35.7 https://github.com/flutter/flutter.git "$sdk"
fi
if [ "$(git -C "$sdk" rev-parse HEAD)" != "$commit" ]; then
  echo 'Unexpected Flutter checkout: refusing to replace an existing SDK.' >&2
  exit 1
fi
CI=true FLUTTER_SUPPRESS_ANALYTICS=true "$sdk/bin/flutter" --version
CI=true "$sdk/bin/flutter" pub get --enforce-lockfile
