#!/usr/bin/env bash
# One-time setup for the clipper skill (Linux / macOS / cloud sessions).
set -e
python3 -m pip install -q -U "yt-dlp[default]" faster-whisper "opencv-python-headless<5" pillow numpy
command -v ffmpeg >/dev/null || { echo "MISSING: ffmpeg (apt install ffmpeg / brew install ffmpeg)"; exit 1; }
ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " || { echo "MISSING: ffmpeg built with libass"; exit 1; }
python3 -c "import cv2; assert hasattr(cv2, 'CascadeClassifier')" || { echo "MISSING: OpenCV 4 face detector"; exit 1; }
echo "Downloading Whisper '${CLIPPER_WHISPER_MODEL:-small}' model (~480 MB, needs huggingface.co)..."
python3 -c "from faster_whisper import WhisperModel; import os; WhisperModel(os.environ.get('CLIPPER_WHISPER_MODEL','small'), device='cpu', compute_type='int8')" \
  || { echo "MISSING: Whisper model (is huggingface.co reachable?)"; exit 1; }
echo READY
