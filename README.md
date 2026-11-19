# Clipping

Turns a long YouTube video into vertical 9:16 Shorts/TikToks (≤ 60 s) that open with a hook.

Each short gets: a hook teaser (the punchiest line) → white-flash / zoom / slide transitions → the story,
word-by-word animated captions (active word pops + highlights), a hook title card, a progress bar,
whoosh SFX on cuts, and loudness normalised to -14 LUFS.

## Usage
```bash
pip install yt-dlp faster-whisper          # ffmpeg with libass also required
python clip.py fetch "https://youtu.be/VIDEO_ID"
python clip.py transcribe --model small    # -> work/transcript.txt (timestamps)
# pick moments in clips.json (see format below)
python clip.py render clips.json           # -> out/<id>.mp4
```

## clips.json
```json
{
  "watermark": "@yourchannel",
  "layout": "crop",
  "clips": [{
    "id": "01-the-mistake",
    "title": "He lost everything in 30 days",
    "hook":     {"start": 412.3, "end": 415.8},
    "segments": [{"start": 380.0, "end": 425.0}],
    "crop_x": 0.5
  }]
}
```
- `layout`: `crop` (fills screen, `crop_x` 0=left…1=right picks where the speaker is) or `blur` (whole frame over blurred background — good for two-person shots). Can be set per segment.
- `transitions`: optional list of ffmpeg xfade names (default `fadewhite, zoomin, slideup, smoothleft`).
- Avoid emojis in `title` — libass can't render colour emoji.
