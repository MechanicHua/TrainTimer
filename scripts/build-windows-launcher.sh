#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOTNET=${DOTNET:-dotnet}
RID=${RID:-win-x64}
NODE_ARCHIVE=${NODE_ARCHIVE:-}
OUTPUT_ROOT="$PROJECT_ROOT/dist/TrainTimer-Windows"
RUNTIME_ROOT="$OUTPUT_ROOT/Resources/runtime"
ZIP_PATH="$PROJECT_ROOT/dist/TrainTimer-Windows-$RID.zip"

rm -rf "$OUTPUT_ROOT"
mkdir -p "$RUNTIME_ROOT"

"$DOTNET" publish "$PROJECT_ROOT/windows/TrainTimer.Launcher/TrainTimer.Launcher.csproj" \
  --configuration Release \
  --runtime "$RID" \
  --self-contained true \
  --output "$OUTPUT_ROOT" \
  -p:EnableWindowsTargeting=true

cp "$PROJECT_ROOT/package.json" "$RUNTIME_ROOT/package.json"
cp -R "$PROJECT_ROOT/src" "$RUNTIME_ROOT/src"
cp -R "$PROJECT_ROOT/public" "$RUNTIME_ROOT/public"
cp -R "$PROJECT_ROOT/vendor" "$RUNTIME_ROOT/vendor"
mkdir -p "$RUNTIME_ROOT/node_modules"
cp -R "$PROJECT_ROOT/node_modules/three" "$RUNTIME_ROOT/node_modules/three"
cp "$PROJECT_ROOT/windows/README-Windows.md" "$OUTPUT_ROOT/README.md"

if [ -n "$NODE_ARCHIVE" ]; then
  NODE_TEMP=$(mktemp -d "${TMPDIR:-/tmp}/TrainTimerNode.XXXXXX")
  trap 'rm -rf "$NODE_TEMP"' EXIT INT TERM
  unzip -q "$NODE_ARCHIVE" -d "$NODE_TEMP"
  NODE_EXE=$(find "$NODE_TEMP" -type f -name node.exe -print -quit)
  if [ -z "$NODE_EXE" ]; then
    echo "node.exe was not found in $NODE_ARCHIVE" >&2
    exit 1
  fi
  mkdir -p "$OUTPUT_ROOT/Resources/node"
  cp "$NODE_EXE" "$OUTPUT_ROOT/Resources/node/node.exe"
fi

rm -f "$ZIP_PATH"
(cd "$OUTPUT_ROOT" && /usr/bin/zip -qr "$ZIP_PATH" .)

echo "Windows launcher: $OUTPUT_ROOT"
echo "Archive: $ZIP_PATH"
