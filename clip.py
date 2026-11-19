#!/usr/bin/env python3
"""Viral clip pipeline: download -> transcribe -> render vertical 9:16 shorts.

  python clip.py fetch URL                       # downloads to work/source.mp4
  python clip.py transcribe [--model small]      # work/transcript.json + transcript.txt
  python clip.py render clips.json [--only ID]   # renders out/<id>.mp4

Every short = HOOK teaser (punchiest line) -> transition -> body segment(s),
with word-by-word animated captions, a hook title card, a progress bar,
whoosh SFX on transitions, and a hard 60 s cap.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(ROOT, "work")
OUT = os.path.join(ROOT, "out")
FONTS = os.path.join(ROOT, "fonts")
W, H, FPS = 1080, 1920, 30
TRANS = 0.35          # transition length (s)
MAX_LEN = 59.5        # hard cap so platforms always treat it as a Short


def run(cmd):
    print("+", " ".join(cmd[:6]), "..." if len(cmd) > 6 else "")
    subprocess.run(cmd, check=True)


# ---------------------------------------------------------------- fetch
def cmd_fetch(a):
    os.makedirs(WORK, exist_ok=True)
    run(["yt-dlp", "-f", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4",
         "-o", os.path.join(WORK, "source.%(ext)s"), a.url])


# ---------------------------------------------------------------- transcribe
def cmd_transcribe(a):
    from faster_whisper import WhisperModel
    src = a.source or os.path.join(WORK, "source.mp4")
    model = WhisperModel(a.model, device="auto", compute_type="int8")
    segs, info = model.transcribe(src, word_timestamps=True, vad_filter=True)
    words, lines = [], []
    for s in segs:
        lines.append(f"[{s.start:7.2f} - {s.end:7.2f}] {s.text.strip()}")
        print(lines[-1])
        for w in s.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
    with open(os.path.join(WORK, "transcript.json"), "w") as f:
        json.dump({"language": info.language, "words": words}, f)
    with open(os.path.join(WORK, "transcript.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------- captions (ASS)
def ts(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def esc(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")")


ASS_HEAD = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Black,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,4,5,60,60,0
Style: Hook,Inter Black,66,&H00101010,&H00101010,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,26,0,8,90,90,230
Style: Bar,Inter Black,10,&H0000E5FF,&H0000E5FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0
Style: Wm,Inter ExtraBold,38,&H66FFFFFF,&H66FFFFFF,&H66000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,90

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

HILITE = ["&H0000E5FF&", "&H0055FF55&", "&H00FFD000&"]  # yellow, green, cyan (BGR)


def chunk_words(words, max_words=3, max_chars=16):
    """Group words into short punchy caption chunks, breaking on pauses/punctuation."""
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        text = " ".join(x["w"] for x in cur)
        brk = (len(cur) >= max_words or len(text) >= max_chars or nxt is None
               or w["w"][-1:] in ".?!," or (nxt and nxt["s"] - w["e"] > 0.45))
        if brk:
            chunks.append(cur)
            cur = []
    return chunks


def build_ass(timeline_words, hook_text, total, watermark):
    ev = []
    # caption chunks, active word highlighted + popped
    for ci, ch in enumerate(chunk_words(timeline_words)):
        c_start, c_end = ch[0]["s"], ch[-1]["e"]
        color = HILITE[ci % len(HILITE)]
        for wi, w in enumerate(ch):
            s = w["s"]
            e = ch[wi + 1]["s"] if wi + 1 < len(ch) else max(c_end, s + 0.15)
            parts = []
            for j, x in enumerate(ch):
                word = esc(x["w"].upper())
                if j == wi:
                    parts.append(r"{\c" + color + r"\fscx118\fscy118\t(0,90,\fscx100\fscy100)}" + word + r"{\r}")
                else:
                    parts.append(word)
            pop = r"\fscx80\fscy80\t(0,80,\fscx100\fscy100)" if wi == 0 else ""
            ev.append(f"Dialogue: 1,{ts(s)},{ts(e)},Cap,,0,0,0,,{{\\pos({W // 2},{int(H * 0.66)}){pop}}}" + " ".join(parts))
    # hook title card (top), pops in, holds, then fades
    if hook_text:
        hold = min(3.2, total)
        ev.append(f"Dialogue: 2,{ts(0)},{ts(hold)},Hook,,0,0,0,,"
                  r"{\fad(0,250)\fscx60\fscy60\frz-4\t(0,180,\fscx106\fscy106\frz2)\t(180,300,\fscx100\fscy100\frz0)}"
                  + esc(hook_text.upper()))
    # progress bar along the bottom
    ev.append(f"Dialogue: 3,{ts(0)},{ts(total)},Bar,,0,0,0,,"
              r"{\pos(0,0)\clip(0," + str(H - 14) + ",0," + str(H) + r")\t(0," + str(int(total * 1000))
              + r",\clip(0," + str(H - 14) + f",{W},{H}))\\p1}}m 0 {H - 14} l {W} {H - 14} {W} {H} 0 {H}")
    if watermark:
        ev.append(f"Dialogue: 0,{ts(0)},{ts(total)},Wm,,0,0,0,,{esc(watermark)}")
    return ASS_HEAD + "\n".join(ev) + "\n"


# ---------------------------------------------------------------- render
def framing_filter(mode, crop_x, zoom):
    """Return a filter chain turning any input into a 1080x1920 frame."""
    if mode == "blur":
        return (f"split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                f"boxblur=30:3,eq=brightness=-0.12[bg];[b]scale={W}:-2[fg];[bg][fg]overlay=0:(H-h)/2")
    # crop mode: fill height, pick horizontal centre (0..1), static punch-in zoom
    h = int(H * (1 + zoom)) // 2 * 2
    return (f"scale=-2:{h}:flags=lanczos,"
            f"crop={W}:{H}:x='(iw-ow)*{crop_x}':y='(ih-oh)/2'")


def cmd_render(a):
    cfg = json.load(open(a.clips))
    src = cfg.get("source", os.path.join(WORK, "source.mp4"))
    if not os.path.isabs(src):
        src = os.path.join(ROOT, src)
    words = json.load(open(os.path.join(WORK, "transcript.json")))["words"]
    os.makedirs(OUT, exist_ok=True)
    whoosh = make_whoosh()

    for clip in cfg["clips"]:
        if a.only and clip["id"] not in a.only:
            continue
        parts = ([clip["hook"]] if clip.get("hook") else []) + clip["segments"]
        durs = [p["end"] - p["start"] for p in parts]
        total = sum(durs) - TRANS * (len(parts) - 1)
        if total > MAX_LEN:
            sys.exit(f"{clip['id']}: {total:.1f}s > {MAX_LEN}s - trim segments")

        # map transcript words onto the output timeline
        tl, off = [], 0.0
        for i, (p, d) in enumerate(zip(parts, durs)):
            for w in words:
                if w["s"] >= p["start"] - 0.05 and w["e"] <= p["end"] + 0.1:
                    s = off + max(w["s"] - p["start"], 0)
                    e = min(off + w["e"] - p["start"], off + d)
                    if tl and s < tl[-1]["e"]:          # overlap during transition: next part wins
                        tl[-1]["e"] = s
                        if tl[-1]["e"] - tl[-1]["s"] < 0.05:
                            tl.pop()
                    tl.append({"w": w["w"], "s": s, "e": e})
            off += d - TRANS
        tmp = tempfile.mkdtemp(prefix="clip_")
        ass = os.path.join(tmp, "subs.ass")
        open(ass, "w").write(build_ass(tl, clip.get("title", ""), total, cfg.get("watermark", "")))

        mode, cx = clip.get("layout", cfg.get("layout", "crop")), clip.get("crop_x", 0.5)
        transitions = clip.get("transitions") or ["fadewhite", "zoomin", "slideup", "smoothleft"]
        inputs, fc = [], []
        for i, p in enumerate(parts):
            inputs += ["-ss", f"{p['start']:.3f}", "-t", f"{durs[i]:.3f}", "-i", src]
            zoom = 0.10 if (i == 0 and clip.get("hook")) else 0.04
            fc.append(f"[{i}:v]{framing_filter(p.get('layout', mode), p.get('crop_x', cx), zoom)},"
                      f"fps={FPS},setsar=1,format=yuv420p,settb=AVTB[v{i}]")
            fc.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a{i}]")
        vlast, alast, off = "v0", "a0", 0.0
        for i in range(1, len(parts)):
            off += durs[i - 1] - TRANS
            t = transitions[(i - 1) % len(transitions)]
            fc.append(f"[{vlast}][v{i}]xfade=transition={t}:duration={TRANS}:offset={off:.3f}[vx{i}]")
            fc.append(f"[{alast}][a{i}]acrossfade=d={TRANS}[ax{i}]")
            vlast, alast = f"vx{i}", f"ax{i}"
        # whoosh on each transition
        n = len(parts) - 1
        inputs += ["-i", whoosh]
        wi = len(parts)
        if n:
            fc.append(f"[{wi}:a]asplit={n}" + "".join(f"[w{k}]" for k in range(n)) if n > 1 else f"[{wi}:a]anull[w0]")
            offs, o = [], 0.0
            for k in range(n):
                o += durs[k] - TRANS
                offs.append(o)
                fc.append(f"[w{k}]adelay={int(max(o - 0.15, 0) * 1000)}:all=1[wd{k}]")
            fc.append(f"[{alast}]" + "".join(f"[wd{k}]" for k in range(n)) +
                      f"amix=inputs={n + 1}:normalize=0:duration=first[amix]")
            alast = "amix"
        fc.append(f"[{alast}]loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
        ass_esc = ass.replace(":", r"\:")
        fc.append(f"[{vlast}]ass='{ass_esc}':fontsdir='{FONTS}'[vout]")

        out = os.path.join(OUT, f"{clip['id']}.mp4")
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
             "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
             "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", a.preset, "-crf", "19",
             "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
             "-movflags", "+faststart", out])
        print(f"✓ {out}  ({total:.1f}s)")


def make_whoosh():
    path = os.path.join(WORK, "whoosh.wav")
    if not os.path.exists(path):
        os.makedirs(WORK, exist_ok=True)
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
             "anoisesrc=d=0.5:c=pink:a=0.6", "-af",
             "highpass=f=400,lowpass=f=6000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.2,volume=0.5",
             "-ac", "2", "-ar", "48000", path])
    return path


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    f = sp.add_parser("fetch"); f.add_argument("url"); f.set_defaults(fn=cmd_fetch)
    t = sp.add_parser("transcribe"); t.add_argument("--model", default="small"); t.add_argument("--source")
    t.set_defaults(fn=cmd_transcribe)
    r = sp.add_parser("render"); r.add_argument("clips"); r.add_argument("--only", nargs="*")
    r.add_argument("--preset", default="medium"); r.set_defaults(fn=cmd_render)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
