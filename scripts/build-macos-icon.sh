#!/bin/sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE="$PROJECT_ROOT/assets/TrainTimerIcon.png"
OUTPUT="$PROJECT_ROOT/TrainTimer.app/Contents/Resources/TrainTimerIcon.icns"

if ! python3 -c 'import PIL' >/dev/null 2>&1; then
  echo "Python Pillow is required to package the macOS icon." >&2
  exit 1
fi

python3 - "$SOURCE" "$OUTPUT" <<'PY'
from pathlib import Path
import sys

from PIL import Image

source = Path(sys.argv[1])
output = Path(sys.argv[2])
sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)]

with Image.open(source) as image:
    image.convert("RGBA").save(output, format="ICNS", sizes=sizes)
PY

echo "Built $OUTPUT"
