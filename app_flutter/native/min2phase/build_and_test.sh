#!/bin/sh
set -eu
cd "$(dirname "$0")"
build_directory="${1:-build}"
compiler="${CXX:-clang++}"
mkdir -p "$build_directory"
case "$(uname -s)" in
  Darwin) library="$build_directory/libtraintimer_min2phase.dylib"; shared_flag=-dynamiclib ;;
  *) library="$build_directory/libtraintimer_min2phase.so"; shared_flag=-shared ;;
esac
sanitize_flags=""
if [ "${SANITIZE:-0}" = 1 ]; then sanitize_flags="-fsanitize=address,undefined -fno-omit-frame-pointer"; fi
# Intentional splitting only for the controlled compiler flag list.
"$compiler" -std=c++14 -O3 -fPIC -fvisibility=hidden -pthread $sanitize_flags \
  -DTT_M2P_BUILD -Iinclude -Ivendor/include -Ivendor/src "$shared_flag" \
  src/traintimer_min2phase.cpp vendor/src/CubieCube.cpp vendor/src/Search.cpp \
  vendor/src/coords.cpp vendor/src/info.cpp -o "$library"
"$compiler" -std=c++14 -O3 -pthread $sanitize_flags -Iinclude tests/native_test.cpp \
  "$library" -o "$build_directory/min2phase_tests"
if [ "${SANITIZE:-0}" = 1 ]; then
  "$build_directory/min2phase_tests" fixtures/cases.tsv "$build_directory/regression.tsv"
else
  "$build_directory/min2phase_tests"
  python3 tests/regression.py "$library" "$build_directory"
fi
