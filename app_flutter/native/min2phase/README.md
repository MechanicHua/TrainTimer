# TrainTimer min2phase native module

Fixed upstream commit `db0ee5f431178f2153f9aa60581bd6ca59e89391` with the existing
portability patch. The library links only the solver and coordinate tables:
there is no Java, server, network, filesystem cache or external runtime process.
Source and licensing provenance are in `SOURCE.json`, `NOTICE`, `LICENSE`, and
`vendor/README.md`.

## Build and verify

From the repository root, run:

```sh
sh app_flutter/native/min2phase/build_and_test.sh
SANITIZE=1 sh app_flutter/native/min2phase/build_and_test.sh build-sanitize
```

The first command compiles a dynamic library with the system C++ compiler,
tests ABI edge cases and 160 concurrent calls, and runs all 1506 current-to-target
fixtures through the actual exported ABI. It writes raw TSV and a percentile
report under `build/`. The second runs the ABI tests and all 1506 samples under
AddressSanitizer and UndefinedBehaviorSanitizer, writing raw TSV under
`build-sanitize/`. It does not load an instrumented library into Python.

Standalone CMake (3.16+) is also supported:

```sh
cmake -S app_flutter/native/min2phase -B app_flutter/native/min2phase/build-cmake -DCMAKE_BUILD_TYPE=Release
cmake --build app_flutter/native/min2phase/build-cmake --config Release
ctest --test-dir app_flutter/native/min2phase/build-cmake -C Release --output-on-failure
```

For MSVC pass `-A x64` or `-A ARM64` when configuring. The Flutter path dependency
uses CocoaPods on macOS and a CMake bundled DLL on Windows. Windows architectures
and packaged app loading still require their own toolchain and runtime checks;
the shell build on macOS does not validate them.

## Dart FFI contract

`include/traintimer_min2phase.h` is the complete ABI. Version is 1; library name is
`traintimer_min2phase`. Standalone macOS is `libtraintimer_min2phase.dylib`, the
CocoaPods framework is `traintimer_min2phase.framework/traintimer_min2phase`, and
Windows is `traintimer_min2phase.dll`.

```dart
typedef SolveNative = Int32 Function(
  Pointer<Char>, Size, Pointer<Char>, Size, Int32,
  Pointer<Char>, Size, Pointer<Int32>, Pointer<Double>);
typedef SolveDart = int Function(
  Pointer<Char>, int, Pointer<Char>, int, int,
  Pointer<Char>, int, Pointer<Int32>, Pointer<Double>);
```

Inputs are exactly 54 ASCII bytes in URFDLB order with canonical centers; there
is no requirement for an input NUL terminator. Allocate 64 output bytes and pass
`probe_max = 100000000` for the validated default. All buffers belong to the
caller and must remain valid until return; none are retained. `steps` and
`elapsed_ms` may be null. Successful output is NUL terminated, normalized,
independently verified against all 54 target stickers, and at most 20 HTM
(`R2` is one move). Already equal states return an empty formula and zero steps.

Return codes: 0 success, 1 bad ABI argument, 2 invalid current state, 3 invalid
target state, 4 exhausted search budget, 5 failed output verification, 6 internal
exception. Failure always leaves output empty and steps zero. Validation rejects
bad colors/centers, impossible pieces, orientation sums and permutation parity.

Call initialize and solve from a background isolate; neither is a leaf FFI call.
Native locking serializes all search and table initialization even if multiple
isolates call the library. A fresh Search owns mutable state for each call.
The budget counts search probes; it is not a hard wall-clock timeout and there
is no unsafe interruption of a running native call. The Dart queue must be
bounded, keep the newest pending request, and compare its request/state revision
before publishing a returned result. Expired results are discarded. Budget
exhaustion never falls back to an over-20-move formula.

`elapsed_ms` includes this call's validation, lock wait, optional initialization,
search, and independent verification. It excludes Dart scheduling, Bluetooth,
rendering, and display latency. Current/target conversion computes `T⁻¹C`;
validation applies the formula to the original current state using a geometric
sticker permutation engine independent of the solver's cubie multiplication.

## Recorded prototype checks

`results/` retains the actual local release regression, sanitizer stderr/stdout
and raw sanitized regression. `results/report.json` gives exact configuration
and measurements. These are native ABI prototype results on the current host;
they do not establish packaged app, Windows, Bluetooth or UI acceptance.
