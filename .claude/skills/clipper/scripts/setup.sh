#!/usr/bin/env bash
# One-time setup for the clipper skill (Linux / macOS / cloud sessions).
set -e
python3 -m pip install -q -U "yt-dlp[default]" faster-whisper "opencv-python-headless<5" pillow numpy
command -v ffmpeg >/dev/null || { echo "MISSING: ffmpeg (apt install ffmpeg / brew install ffmpeg)"; exit 1; }
ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " || { echo "MISSING: ffmpeg built with libass"; exit 1; }
python3 -c "import cv2; assert hasattr(cv2, 'CascadeClassifier')" || { echo "MISSING: OpenCV 4 face detector"; exit 1; }

# Whisper "small" (CTranslate2 int8) from the npm registry, so huggingface.co is not needed.
# Data files only (weights + tokenizer), checked against the published sha256.
M="$HOME/.cache/clipper/whisper-small"
EXPECTED=ca732cb1379efc49417d028465f543d83a39de2c61f3027678de103dc404ce73
if [ ! -f "$M/model.bin" ] || [ "$(sha256sum "$M/model.bin" | cut -d' ' -f1)" != "$EXPECTED" ]; then
  echo "Downloading Whisper small model (~250 MB from registry.npmjs.org)..."
  T=$(mktemp -d); mkdir -p "$M"
  for i in 0 1 2 3; do
    curl -fsS -o "$T/p$i.tgz" "https://registry.npmjs.org/@skillninja/shortmovie-telop-model-p$i/-/shortmovie-telop-model-p$i-1.0.0.tgz"
    mkdir "$T/p$i" && tar -xzf "$T/p$i.tgz" -C "$T/p$i"
  done
  cat "$T"/p0/package/model.bin.part0 "$T"/p1/package/model.bin.part1 "$T"/p2/package/model.bin.part2 "$T"/p3/package/model.bin.part3 > "$M/model.bin"
  cp "$T"/p0/package/{config.json,tokenizer.json,vocabulary.json,preprocessor_config.json} "$M/"
  rm -rf "$T"
  [ "$(sha256sum "$M/model.bin" | cut -d' ' -f1)" = "$EXPECTED" ] || { rm -f "$M/model.bin"; echo "MISSING: Whisper model (checksum mismatch)"; exit 1; }
fi
echo READY
