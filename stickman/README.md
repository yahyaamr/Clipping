# Stickman Shorts

Code-animated stickman motivation videos (1080×1920, 30 fps, ~30 s). Everything is generated:
figures, backgrounds and sound effects. There are no image or audio assets apart from two OFL fonts.

```bash
cd stickman && npm install
node render.js episodes/001-the-weight.js               # -> out/001-the-weight.mp4  (~45 s)
node render.js episodes/001-the-weight.js --stills 3,16  # quick PNG previews
```

## Channel identity
- **YOU**: the hero. Warm white with a **red headband** (signature), red label. Turns **red** when they refuse to quit.
- **Obstacles**: faceless grey figures named after the topic (COMFORT, EXCUSES, DOUBT…), new cast per episode.
- **Red** = pressure / transformation. **Green** = growth / the win.
- Quiet procedural backgrounds: grid crosses, halftone pressure dots, rings, focus lines, grain.
- **Sign-off**: `+1%  BETTER THAN YESTERDAY` with the hero running. It's the same on every video.

## Layout
- `engine/figure.js`: the rig (FK + two-bone IK, labels, faces, headband)
- `engine/poses.js`, `engine/actions.js`: pose library, push-ups, sitting on figures, throws, lying KO
- `engine/stage.js`: camera, backgrounds, text
- `engine/audio.js`: synthesized SFX (whoosh, thud, impact, riser, heartbeat, ticks, "HA", ding)
- `episodes/NNN-*.js`: one file per video (beats, camera, text, SFX cues, post caption)
