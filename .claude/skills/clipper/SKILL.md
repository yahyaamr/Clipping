---
name: clipper
description: Viral Clipper. Turns any long video (YouTube / Twitch / Kick link, or an uploaded/local video file) into ready-to-post vertical 9:16 Shorts/TikToks under 60 seconds that open on a hook. Each clip gets a hook teaser, white-flash transition, punch-in zooms, animated word-by-word captions, a hook title card, a progress bar, whoosh SFX, plus a post title, caption and hashtags. Activates on "clip this video <link>", "make shorts from <link or file>", "set up the clipper", /clipper, or any request to clip a podcast, interview, stream or video into shorts.
---

# Viral Clipper

Video link or file -> 3 (or more) ready-to-post 1080x1920 clips, each <= 59.5 s.
Everything except the picking runs locally. The picking is done by YOU (this Claude Code session): no API keys.

`S` = this skill's folder (`.claude/skills/clipper` in this repo). Run:
`python3 "$S/scripts/clipper.py" <command>`. Runs are written to `./runs/` (override with `CLIPPER_RUNS_DIR`).

## 0. Setup ("set up the clipper", or any command fails on an import / missing model)

`bash "$S/scripts/setup.sh"` (timeout 600000). Installs yt-dlp, faster-whisper, OpenCV 4, Pillow and downloads
the Whisper model. Prints READY or what's missing.
Network needed: youtube.com + googlevideo.com (or the stream site) for links, huggingface.co for the Whisper
model. In a cloud session where a host is blocked, tell the user which host and that they can allow it in the
environment's network settings, or upload the video file and pass its path instead of a URL.

## 1+2. Prep

`prep <url-or-file> [...]` (add `--cookies firefox|path/to/cookies.txt` for age-restricted / login-only videos).
Downloads audio only (or reads the local file), transcribes it, marks where the speaker got loud and
(YouTube replays) where chat sped up, and writes `chunks/chunk_NN.md`: 12-minute transcript pieces with
`<<LOUD(+12dB)>>` and `<<CHAT x4.1>>` markers. Prints the run folder. Run long videos in the background.

## 3. Pick the moments (you do this)

Read `references/picking.md` first, every time. Then for each run folder:
1. Read every `chunks/chunk_NN.md`, in order.
2. Write `picks/chunk_NN.json` for each chunk (a JSON array, `[]` if nothing qualifies; always write the file).
3. `status <run>` shows chunks still without picks. Keep going until `chunks_left` is empty.

For several videos, give each one its own subagent with the run folder path and "read references/picking.md,
then do step 3 of SKILL.md for this run folder".

## 4. Render

`render <run>` (defaults `--top 3 --min-score 7`; add `--watermark @handle`). For each pick it:
fetches only the needed minutes (or cuts the local file), detects the layout (stream facecam -> facecam on top,
gameplay below; talking head / podcast -> crop centred on the face; otherwise full frame over a blurred fill),
plays the **teaser** (punched in) -> **white-flash transition + whoosh** -> the moment with **punch-in zooms on
alternating sentences**, burns in **animated captions** (2-3 words, active word pops + colour highlight),
a **hook title card** that pops in for 3 s and a **progress bar**, normalises audio to -14 LUFS, and writes
`clips/clip_NN_<title>.mp4` + `.txt` (title, caption, hashtags) + `summary.json`.
Clips over 59.5 s are trimmed at the last sentence end that fits.

- Fewer clips than asked because scores were low: say so and offer `--min-score 6`; don't lower it silently.
- After render, grab one frame per clip (`ffmpeg -ss 5 -i clip.mp4 -frames:v 1 f.png`) and look at it. If the
  framing is wrong add `"layout": "gameplay"` (blurred full frame) or `"cam"` (face crop) to that pick,
  delete its mp4, and re-render.

## 5. Report

Per video: length -> moments found -> clips kept; each clip's title, timestamp, length, layout and path.
Remind the user: watch every clip before posting, only clip creators who allow it (or have permission), and
add something of their own; YouTube can refuse monetisation for reused content.

## Other requests

- "Make clip 2 longer / different hook / different teaser": edit that pick in `picks/*.json`, delete the old
  mp4, re-run render (selection is deterministic).
- "Give me 5 clips": `render <run> --top 5`.
- Non-English video: works as-is (language is auto-detected); write hooks/captions in the video's language
  unless the user asks otherwise.
- Env: `CLIPPER_WHISPER_MODEL` (default `small`; `medium` is better but slower), `CLIPPER_WHISPER_DEVICE=cuda`.
