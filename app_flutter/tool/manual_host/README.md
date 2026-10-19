# Command Line Tools experimental macOS host

This host assembles and packages Release Flutter assets without Xcode or
CocoaPods. It compiles the actual Runner window and application delegates,
registers the locked `path_provider_foundation` Swift source directly, links
system SQLite, and builds the pinned min2phase framework. The entry point creates
the AppKit window and menus programmatically; it needs no compiled storyboard or
nib. Existing Runner source files and the old application are unchanged.

Run from the repository root:

```sh
sh app_flutter/tool/build-macos-prototype.sh
```

The script requires Command Line Tools, Python 3 and the resolved `.dart_tool`
package configuration. By default it uses `.toolchain/flutter/bin/flutter` to
assemble current Dart sources in Release arm64 mode before packaging; `FLUTTER`
can override the executable. It copies only `App.framework` and
`FlutterMacOS.framework`, never their dSYMs, and does not launch the app.
`PROTOTYPE_ASSETS` can select another assemble output directory.

`PROTOTYPE_SKIP_ASSEMBLE=1` explicitly packages existing assets. The report marks
this skip and leaves their source fingerprint unverified. Normal builds record
the Flutter version and a SHA-256 manifest of project-relative Dart, lockfile,
native, Runner and host sources. Source changes during the build fail packaging
before replacing the previous app, preventing mixed source revisions.

Output: `app_flutter/build/prototype/TrainTimer Flutter Prototype.app`.
The bundle identifier is `dev.traintimer.flutter.prototype`; path_provider uses
its independent sandbox application-support directory. No old data is scanned
or imported. Build configuration, hashes, signatures and known limitations are
written to `app_flutter/build/prototype/build-report.json`.

This is an experimental local package signed ad hoc, without notarization. A
successful CLT compilation and signature check does not establish a complete
Xcode build, distribution readiness, Bluetooth interoperability, packaged app
startup performance, or macOS 12 runtime acceptance. Those checks remain separate.
The caller can launch the generated app when ready for an interactive test.
