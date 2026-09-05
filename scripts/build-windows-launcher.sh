#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CC=${CC:-x86_64-w64-mingw32-gcc}
WINDRES=${WINDRES:-x86_64-w64-mingw32-windres}
RID=${RID:-win-x64}
NODE_ARCHIVE=${NODE_ARCHIVE:-}
NODE_EXE=${NODE_EXE:-}
ALLOW_SYSTEM_NODE=${ALLOW_SYSTEM_NODE:-0}
DIST_ROOT="$PROJECT_ROOT/dist"
NATIVE_ROOT="$PROJECT_ROOT/windows/TrainTimer.Native"
NATIVE_BUILD_ROOT="$DIST_ROOT/native-build"
OUTPUT_ROOT="$DIST_ROOT/TrainTimer-Windows"
ZIP_PATH="$DIST_ROOT/TrainTimer-Windows-$RID.zip"

if ! command -v "$CC" >/dev/null 2>&1 || ! command -v "$WINDRES" >/dev/null 2>&1; then
  echo "A MinGW-w64 cross compiler is required: $CC and $WINDRES" >&2
  exit 1
fi

mkdir -p "$NATIVE_BUILD_ROOT" "$DIST_ROOT"
(cd "$NATIVE_ROOT" && "$WINDRES" -O coff TrainTimer.rc "$NATIVE_BUILD_ROOT/TrainTimer.res.o")
"$CC" -std=c11 -Os -s -municode -mwindows -static \
  -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX \
  "$NATIVE_ROOT/launcher.c" "$NATIVE_BUILD_ROOT/TrainTimer.res.o" \
  -o "$NATIVE_BUILD_ROOT/TrainTimer.exe" \
  -ladvapi32 -lcomctl32 -ldwmapi -lshell32 -luxtheme -lwinhttp -lws2_32

if [ ! -s "$NATIVE_BUILD_ROOT/TrainTimer.exe" ]; then
  echo "Native launcher build failed" >&2
  exit 1
fi

STAGING_ROOT=$(mktemp -d "$DIST_ROOT/.TrainTimer-Windows.XXXXXX")
NODE_TEMP=
cleanup() {
  if [ -n "$STAGING_ROOT" ]; then rm -rf "$STAGING_ROOT"; fi
  if [ -n "$NODE_TEMP" ]; then rm -rf "$NODE_TEMP"; fi
}
trap cleanup EXIT INT TERM

RUNTIME_ROOT="$STAGING_ROOT/Resources/runtime"
mkdir -p "$RUNTIME_ROOT"
cp "$NATIVE_BUILD_ROOT/TrainTimer.exe" "$STAGING_ROOT/TrainTimer.exe"
cp "$PROJECT_ROOT/package.json" "$RUNTIME_ROOT/package.json"
cp -R "$PROJECT_ROOT/src" "$RUNTIME_ROOT/src"
cp -R "$PROJECT_ROOT/public" "$RUNTIME_ROOT/public"
cp -R "$PROJECT_ROOT/vendor" "$RUNTIME_ROOT/vendor"
cp "$PROJECT_ROOT/windows/README-Windows.md" "$STAGING_ROOT/README.md"
if [ -f "$PROJECT_ROOT/LICENSE" ]; then cp "$PROJECT_ROOT/LICENSE" "$STAGING_ROOT/LICENSE"; fi

RESOLVED_NODE=
if [ -n "$NODE_EXE" ]; then
  RESOLVED_NODE="$NODE_EXE"
elif [ -n "$NODE_ARCHIVE" ]; then
  NODE_TEMP=$(mktemp -d "${TMPDIR:-/tmp}/TrainTimerNode.XXXXXX")
  unzip -q "$NODE_ARCHIVE" -d "$NODE_TEMP"
  RESOLVED_NODE=$(find "$NODE_TEMP" -type f -name node.exe -print -quit)
elif [ -f "$OUTPUT_ROOT/Resources/node/node.exe" ]; then
  RESOLVED_NODE="$OUTPUT_ROOT/Resources/node/node.exe"
fi

if [ -n "$RESOLVED_NODE" ] && [ -f "$RESOLVED_NODE" ]; then
  mkdir -p "$STAGING_ROOT/Resources/node"
  cp "$RESOLVED_NODE" "$STAGING_ROOT/Resources/node/node.exe"
elif [ "$ALLOW_SYSTEM_NODE" != "1" ]; then
  echo "No portable node.exe found. Set NODE_ARCHIVE or NODE_EXE; set ALLOW_SYSTEM_NODE=1 only for a developer package." >&2
  exit 1
fi

rm -rf "$OUTPUT_ROOT"
mv "$STAGING_ROOT" "$OUTPUT_ROOT"
STAGING_ROOT=
rm -f "$ZIP_PATH"
(cd "$OUTPUT_ROOT" && /usr/bin/zip -9 -qr "$ZIP_PATH" .)

echo "Native launcher: $NATIVE_BUILD_ROOT/TrainTimer.exe"
echo "Portable package: $OUTPUT_ROOT"
echo "Portable archive: $ZIP_PATH"
echo "Run the PowerShell build on Windows to also create the Inno Setup installer."
