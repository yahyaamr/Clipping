# Clipping

A Claude Code skill (`.claude/skills/clipper`) that turns long videos into viral vertical shorts
for YouTube Shorts and TikTok: 9:16, under 60 seconds, opening on a hook.

Ported from [gta6-clipper-windows](https://github.com/vossashtonai/gta6-clipper-windows) (MIT, Ashton Voss AI):
runs on Linux/macOS/cloud sessions, works on any video (podcasts, interviews, streams, local files), and adds
hook teasers, transitions, punch-in zooms, animated captions, a progress bar and a hard 60 s cap.

## Use it (in Claude Code, from this repo)

- "set up the clipper"
- "clip this video https://youtu.be/..."  (or give it a video file path)
- "give me 5 clips", "make clip 2 longer", "watermark @mychannel"

## Each clip

1. **Teaser**: the punchiest 2-4 s line of the moment, punched in, with a hook title card popping in on top
2. **White flash + whoosh** into the moment itself
3. **Punch-in zooms** on alternating sentences, **animated word-by-word captions** (active word pops + highlights)
4. **Progress bar** along the bottom, optional watermark, loudness -14 LUFS
5. Auto layout: stream facecam stacked over gameplay / face-centred crop / full frame on blurred fill
6. A `.txt` with the post title, caption and hashtags

## Manual CLI

```bash
bash .claude/skills/clipper/scripts/setup.sh
python3 .claude/skills/clipper/scripts/clipper.py prep "https://youtu.be/VIDEO" # or a local .mp4
# write runs/<run>/picks/chunk_NN.json (see references/picking.md)
python3 .claude/skills/clipper/scripts/clipper.py render runs/<run> --top 3 --watermark @me
```

Fonts: Inter (OFL-1.1). Only clip creators who allow it, and add something of your own before monetising.
