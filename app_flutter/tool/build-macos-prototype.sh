#!/bin/sh
set -eu

app_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
assets="${PROTOTYPE_ASSETS:-$app_root/build/prototype-assets}"
case "$assets" in /*) ;; *) assets="$app_root/$assets" ;; esac
flutter="${FLUTTER:-$app_root/.toolchain/flutter/bin/flutter}"
skip_assemble="${PROTOTYPE_SKIP_ASSEMBLE:-0}"
output_root="$app_root/build/prototype"
host_sources="$app_root/tool/manual_host"
native_sources="$app_root/native/min2phase"
application_name="TrainTimer Flutter Prototype"
bundle_identifier="dev.traintimer.flutter.prototype"

if [ "$(uname -s)" != Darwin ]; then
  echo 'This experimental host requires macOS Command Line Tools.' >&2
  exit 1
fi
case "$skip_assemble" in 0|1) ;; *) echo 'PROTOTYPE_SKIP_ASSEMBLE must be 0 or 1.' >&2; exit 1 ;; esac
if ! command -v "$flutter" >/dev/null 2>&1; then
  echo "Flutter executable unavailable: $flutter (override with FLUTTER)." >&2
  exit 1
fi
mkdir -p "$output_root"
work="$(mktemp -d "$output_root/.host-build.XXXXXX")"
trap 'rm -rf "$work"' EXIT HUP INT TERM
python3 "$host_sources/source_fingerprint.py" "$app_root" "$work/source-before.json"
"$flutter" --version --machine > "$work/flutter-version.json"
if [ "$skip_assemble" = 0 ]; then
  (
    cd "$app_root"
    "$flutter" assemble -dTargetPlatform=darwin -dBuildMode=release -dDarwinArchs=arm64 \
      --output="$assets" release_macos_bundle_flutter_assets
  )
else
  echo 'PROTOTYPE_SKIP_ASSEMBLE=1: packaging existing assets; their source provenance is unverified.' >&2
fi
for framework in App FlutterMacOS; do
  if [ ! -f "$assets/$framework.framework/$framework" ]; then
    echo "Missing assembled Release asset: $assets/$framework.framework/$framework" >&2
    exit 1
  fi
  xcrun lipo -verify_arch arm64 "$assets/$framework.framework/$framework"
done

# Resolve the exact locked package through pub's actual configuration, without
# scanning unrelated caches or assuming a user-specific home path.
path_provider_sources="$(python3 - "$app_root/.dart_tool/package_config.json" <<'PY'
import json, pathlib, sys, urllib.parse
configuration = pathlib.Path(sys.argv[1]).resolve()
packages = json.loads(configuration.read_text())['packages']
package = next(item for item in packages if item['name'] == 'path_provider_foundation')
uri = urllib.parse.urljoin(configuration.as_uri(), package['rootUri'])
parsed = urllib.parse.urlparse(uri)
if parsed.scheme != 'file':
    raise SystemExit('path_provider_foundation is not available as local source')
root = pathlib.Path(urllib.parse.unquote(parsed.path))
source = root / 'darwin/path_provider_foundation/Sources/path_provider_foundation'
for name in ['PathProviderPlugin.swift', 'messages.g.swift']:
    if not (source / name).is_file():
        raise SystemExit(f'Missing locked plugin source: {source / name}')
print(source)
PY
)"

application="$work/$application_name.app"
contents="$application/Contents"
frameworks="$contents/Frameworks"
resources="$contents/Resources"
mkdir -p "$contents/MacOS" "$frameworks" "$resources/Licenses"
for framework in App FlutterMacOS; do
  /usr/bin/ditto --norsrc --noextattr "$assets/$framework.framework" "$frameworks/$framework.framework"
done

solver="$frameworks/traintimer_min2phase.framework"
mkdir -p "$solver/Versions/A/Resources" "$solver/Versions/A/Headers"
ln -s A "$solver/Versions/Current"
ln -s Versions/Current/traintimer_min2phase "$solver/traintimer_min2phase"
ln -s Versions/Current/Resources "$solver/Resources"
ln -s Versions/Current/Headers "$solver/Headers"
cp "$native_sources/include/traintimer_min2phase.h" "$solver/Versions/A/Headers/"
xcrun clang++ -std=c++14 -O3 -arch arm64 -mmacosx-version-min=12.0 \
  -dynamiclib -fvisibility=hidden -pthread -DTT_M2P_BUILD \
  -I"$native_sources/include" -I"$native_sources/vendor/include" -I"$native_sources/vendor/src" \
  -install_name @rpath/traintimer_min2phase.framework/traintimer_min2phase \
  "$native_sources/src/traintimer_min2phase.cpp" "$native_sources/vendor/src/CubieCube.cpp" \
  "$native_sources/vendor/src/Search.cpp" "$native_sources/vendor/src/coords.cpp" \
  "$native_sources/vendor/src/info.cpp" -o "$solver/Versions/A/traintimer_min2phase"

# Strip only @main in a disposable copy. The production AppDelegate remains intact.
python3 - "$app_root/macos/Runner/AppDelegate.swift" "$work/AppDelegate.swift" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
if source.count('@main') != 1:
    raise SystemExit('Expected one @main attribute in the production AppDelegate')
pathlib.Path(sys.argv[2]).write_text(source.replace('@main', '', 1))
PY

xcrun swiftc -O -whole-module-optimization -target arm64-apple-macos12.0 \
  -module-name TrainTimerPrototype -module-cache-path "$output_root/swift-module-cache" \
  -F "$frameworks" -framework Cocoa -framework FlutterMacOS -framework CoreBluetooth \
  -framework IOKit -framework traintimer_min2phase -lsqlite3 \
  -import-objc-header "$native_sources/include/traintimer_min2phase.h" \
  -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
  "$host_sources/main.swift" "$work/AppDelegate.swift" "$app_root/macos/Runner/MainFlutterWindow.swift" \
  "$path_provider_sources/PathProviderPlugin.swift" "$path_provider_sources/messages.g.swift" \
  -o "$contents/MacOS/TrainTimerPrototype"

python3 - "$app_root" "$contents" "$bundle_identifier" "$solver/Versions/A/Resources" <<'PY'
import pathlib, plistlib, sys
root, contents, bundle_id, solver_resources = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], pathlib.Path(sys.argv[4])
info = plistlib.loads((root / 'macos/Runner/Info.plist').read_bytes())
info.update(CFBundleDevelopmentRegion='en', CFBundleExecutable='TrainTimerPrototype',
    CFBundleIdentifier=bundle_id, CFBundleName='TrainTimer Flutter Prototype',
    CFBundleDisplayName='TrainTimer Flutter Prototype', CFBundleShortVersionString='0.1.0',
    CFBundleVersion='1', LSMinimumSystemVersion='12.0', NSHighResolutionCapable=True,
    NSHumanReadableCopyright='TrainTimer experimental local Flutter prototype')
info.pop('NSMainNibFile', None)
info.pop('CFBundleIconFile', None)
(contents / 'Info.plist').write_bytes(plistlib.dumps(info))
(contents / 'PkgInfo').write_bytes(b'APPL????')
solver_info = dict(CFBundleDevelopmentRegion='en', CFBundleExecutable='traintimer_min2phase',
    CFBundleIdentifier=bundle_id + '.min2phase', CFBundleInfoDictionaryVersion='6.0',
    CFBundleName='traintimer_min2phase', CFBundlePackageType='FMWK', CFBundleShortVersionString='0.1.0',
    CFBundleVersion='1', LSMinimumSystemVersion='12.0')
(solver_resources / 'Info.plist').write_bytes(plistlib.dumps(solver_info))
PY

cp "$native_sources/LICENSE" "$resources/Licenses/min2phase-GPL-3.0.txt"
cp "$native_sources/NOTICE" "$resources/Licenses/min2phase-NOTICE.txt"
cp "$path_provider_sources/../../../../LICENSE" "$resources/Licenses/path_provider_foundation-LICENSE.txt"
cp "$host_sources/README.md" "$resources/EXPERIMENTAL-BUILD.md"
cp "$path_provider_sources/Resources/PrivacyInfo.xcprivacy" "$resources/PrivacyInfo.xcprivacy"
tar -czf "$resources/Licenses/min2phase-source.tar.gz" -C "$native_sources" \
  src include vendor CMakeLists.txt SOURCE.json NOTICE LICENSE min2phase-cxx-portability.patch

# Check the exact relative dlopen path used by Dart and the AOT image without
# launching NSApplication, Flutter, the app executable, or Bluetooth scanning.
cat > "$work/loader-check.c" <<'C'
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
extern uint32_t tt_m2p_abi_version(void);
int main(void) {
  if (tt_m2p_abi_version() != 1) return 1;
  if (!dlopen("traintimer_min2phase.framework/traintimer_min2phase", RTLD_NOW)) {
    fprintf(stderr, "Solver load failed: %s\n", dlerror()); return 2;
  }
  if (!dlopen("@rpath/App.framework/App", RTLD_NOW)) {
    fprintf(stderr, "AOT load failed: %s\n", dlerror()); return 3;
  }
  return 0;
}
C
xcrun clang -arch arm64 -mmacosx-version-min=12.0 "$work/loader-check.c" \
  -F "$frameworks" -framework traintimer_min2phase \
  -Wl,-rpath,@executable_path/../Frameworks -o "$contents/MacOS/loader-check"
"$contents/MacOS/loader-check"
rm "$contents/MacOS/loader-check"

for framework in App FlutterMacOS traintimer_min2phase; do
  /usr/bin/codesign --force --sign - "$frameworks/$framework.framework"
done
/usr/bin/codesign --force --sign - --entitlements "$host_sources/Prototype.entitlements" "$application"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$application"
/usr/bin/plutil -lint "$contents/Info.plist" "$solver/Resources/Info.plist"
for binary in "$contents/MacOS/TrainTimerPrototype" "$solver/traintimer_min2phase"; do
  xcrun lipo -verify_arch arm64 "$binary"
done
python3 "$host_sources/source_fingerprint.py" "$app_root" "$work/source-after.json"
if ! cmp -s "$work/source-before.json" "$work/source-after.json"; then
  echo 'Project sources changed during packaging. Existing app retained; rerun after edits finish.' >&2
  exit 1
fi

destination="$output_root/$application_name.app"
# Only this script's experimental output is replaced, after successful signing.
rm -rf "$destination"
mv "$application" "$destination"
python3 - "$destination" "$assets" "$path_provider_sources" "$output_root/build-report.json" \
  "$work/source-before.json" "$work/flutter-version.json" "$skip_assemble" <<'PY'
import hashlib, json, pathlib, platform, subprocess, sys
app, assets, plugin = [pathlib.Path(value).resolve() for value in sys.argv[1:4]]
contents = app / 'Contents'
source_fingerprint = json.loads(pathlib.Path(sys.argv[5]).read_text())
flutter_version = json.loads(pathlib.Path(sys.argv[6]).read_text())
assemble_skipped = sys.argv[7] == '1'
binaries = [contents / 'MacOS/TrainTimerPrototype'] + [contents / f'Frameworks/{name}.framework/{name}' for name in ['App','FlutterMacOS','traintimer_min2phase']]
report = dict(build='Experimental macOS CLT host with Flutter Release assets',
    app=str(app), bundle_identifier='dev.traintimer.flutter.prototype', architecture='arm64', minimum_macos='12.0',
    signing='ad hoc, not notarized; codesign --verify --deep --strict passed',
    dart_assets_source=str(assets), path_provider_source=str(plugin),
    flutter_assemble_skipped=assemble_skipped,
    flutter_version={key:flutter_version.get(key) for key in ['frameworkVersion','frameworkRevision','engineRevision','dartSdkVersion','channel']},
    flutter_version_scope='Current toolchain only; assets were not assembled in this run' if assemble_skipped else 'Toolchain used for assemble in this run',
    source_fingerprint=source_fingerprint,
    dart_assets_source_fingerprint=None if assemble_skipped else source_fingerprint['sha256'],
    sources_unchanged_during_build=True,
    sqlite='macOS system libsqlite3.dylib',
    toolchain=subprocess.check_output(['xcrun','swiftc','--version'],text=True).strip(),
    host=platform.platform(),
    binaries={str(file.relative_to(contents)):hashlib.sha256(file.read_bytes()).hexdigest() for file in binaries},
    dsym_copied=False, launched=False,
    limitations=['Not a complete Xcode build','Startup and Bluetooth require interactive verification',
        'Ad hoc signing and no notarization: experimental local use only','macOS 12 minimum is a compile target; macOS 12 device acceptance remains pending'])
pathlib.Path(sys.argv[4]).write_text(json.dumps(report, indent=2) + '\n')
print(str(app))
PY
