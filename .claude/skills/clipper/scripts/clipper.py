#!/usr/bin/env python3
"""Viral Clipper: any long video (YouTube / Twitch / Kick link or a local file) -> ready-to-post
vertical 9:16 shorts that open on a hook.

  prep SRC [SRC...]   download audio only (or read a local file), transcribe, mark loud moments and
                      chat spikes, write 12-minute transcript chunks for Claude to read
  status RUN          what a run has and what's left
  render RUN          rank Claude's picks, fetch only those minutes, frame 9:16 (facecam stack /
                      face crop / blurred fill), hook teaser -> transition -> moment, punch zooms,
                      animated word-by-word captions, hook title, progress bar, whoosh SFX,
                      post caption + hashtags. Every clip <= 59.5 s.

Step 3 (picking) is done by the Claude Code session itself; see SKILL.md.
Based on gta6-clipper by Ashton Voss AI (MIT), ported to Linux/macOS and generalised.
"""
import argparse, concurrent.futures as cf, datetime as dt, json, math, os, re, shutil
import statistics, subprocess, sys, threading, time
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
FONTS = SKILL / "fonts"
RUNS = Path(os.environ.get("CLIPPER_RUNS_DIR", Path.cwd() / "runs"))
CHUNK_SEC = 12 * 60
YTDLP = [sys.executable, "-m", "yt_dlp", "--no-warnings", "--quiet", "--no-progress"]
W, H, FPS = 1080, 1920, 30
MAX_LEN = 59.5        # hard cap: always a Short / under TikTok's 1-minute mark
TRANS = 0.3           # teaser -> moment transition (s)


# ---------------------------------------------------------------- helpers
def log(*a):
    print(*a, flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)


def cookie_args(c):
    if not c:
        return []
    return ["--cookies", c] if os.path.isfile(c) else ["--cookies-from-browser", c]


def hms(s):
    s = max(0, int(round(s)))
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def parse_ts(v):
    if isinstance(v, (int, float)):
        return float(v)
    sec = 0.0
    for p in str(v).strip().split(":"):
        sec = sec * 60 + float(p)
    return sec


def slug(s, n=40):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s or "video").strip("-").lower()
    return s[:n] or "video"


def is_local(src):
    return os.path.isfile(src)


def ytdlp_json(url, cookies=None, extra=()):
    r = run(YTDLP + cookie_args(cookies) + list(extra) + ["-J", url])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "yt-dlp failed")
    return json.loads(r.stdout)


def probe_duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- signals
def loud_moments(wav):
    """Per-second RMS, flag seconds well above the local baseline (yelling / losing it / laughter)."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af",
             "asetnsamples=n=16000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
             "-f", "null", "-"])
    vals = [-90.0 if v == "-inf" else float(v) for v in re.findall(r"RMS_level=(-?[\d.]+|-inf)", r.stdout)]
    events = []
    for i, v in enumerate(vals):
        if v < -32:
            continue
        base = statistics.median(vals[max(0, i - 90):min(len(vals), i + 90)])
        if v - base >= 9:
            events.append((i, round(v - base, 1)))
    merged = []
    for t, d in events:
        if merged and t - merged[-1]["end"] <= 2:
            merged[-1]["end"] = t
            merged[-1]["db"] = max(merged[-1]["db"], d)
        else:
            merged.append({"start": t, "end": t, "db": d})
    return merged


def chat_spikes(chat_file):
    """YouTube replay chat: messages per 10 s vs the local baseline. Counted, never read."""
    if not chat_file or not Path(chat_file).exists():
        return []
    times = []
    with open(chat_file, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                times.append(int(json.loads(line)["replayChatItemAction"]["videoOffsetTimeMsec"]) / 1000)
            except Exception:
                pass
    if len(times) < 50:
        return []
    bins = [0] * (int(max(times) // 10) + 1)
    for t in times:
        if t >= 0:
            bins[int(t // 10)] += 1
    out = []
    for i, c in enumerate(bins):
        base = max(1.0, statistics.median(bins[max(0, i - 30):min(len(bins), i + 30)]))
        if c >= 8 and c / base >= 2.5:
            out.append({"start": i * 10, "end": i * 10 + 10, "x": round(c / base, 1), "msgs": c})
    return out


# ---------------------------------------------------------------- speech to text
_FW, _FW_LOCK = None, threading.Lock()


def whisper_model():
    global _FW
    with _FW_LOCK:
        if _FW is None:
            from faster_whisper import WhisperModel
            _FW = WhisperModel(os.environ.get("CLIPPER_WHISPER_MODEL", "small"),
                               device=os.environ.get("CLIPPER_WHISPER_DEVICE", "auto"),
                               compute_type=os.environ.get("CLIPPER_WHISPER_COMPUTE", "int8"), num_workers=2)
    return _FW


def transcribe(wav, words=False, language=None):
    import wave
    import numpy as np
    with wave.open(str(wav), "rb") as wf:  # always 16 kHz mono s16 (we make it with ffmpeg)
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32) / 32768.0
    if pcm.size < 1600:
        return [], language
    it, info = whisper_model().transcribe(pcm, language=language, beam_size=5 if words else 1,
                                          word_timestamps=words, vad_filter=True,
                                          condition_on_previous_text=False)
    segs = []
    for s in it:
        if words:
            segs += [{"start": w.start, "end": w.end, "text": w.word.strip()} for w in (s.words or []) if w.word.strip()]
        elif s.text.strip():
            segs.append({"start": s.start, "end": s.end, "text": s.text.strip()})
    return segs, info.language


def to_wav(src, wav, ss=None, dur=None):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.3f}", "-t", f"{dur:.3f}"]
    r = run(cmd + ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    if r.returncode != 0:
        raise RuntimeError("audio extract failed: " + r.stderr[-300:])


# ---------------------------------------------------------------- prep (steps 1 + 2)
def prep_one(src, cookies, force=False):
    t0 = time.time()
    if is_local(src):
        p = Path(src).resolve()
        info = {"url": str(p), "webpage_url": str(p), "local_file": str(p), "id": slug(p.stem, 16),
                "title": p.stem, "creator": os.environ.get("CLIPPER_CREATOR", ""), "platform": "local",
                "duration": probe_duration(p), "cookies": None}
    else:
        meta = ytdlp_json(src, cookies, ["--no-playlist"])
        if meta.get("live_status") == "is_live" and "youtube" in meta.get("extractor_key", "").lower():
            return {"url": src, "error": "still live on YouTube: clip it once the replay is up"}
        info = {"url": src, "webpage_url": meta.get("webpage_url") or src, "id": meta.get("id"),
                "title": meta.get("title"), "creator": meta.get("uploader") or meta.get("channel") or "",
                "platform": meta.get("extractor_key"), "duration": meta.get("duration"), "cookies": cookies}
    creator = info["creator"] or "creator"
    rd = RUNS / f"{dt.date.today()}-{slug(creator, 24)}-{slug(str(info['id']), 16)}"
    (rd / "chunks").mkdir(parents=True, exist_ok=True)
    (rd / "picks").mkdir(exist_ok=True)
    (rd / "stream.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    if (rd / "transcript.json").exists() and not force:
        log(f"[{creator}] already prepped -> {rd}")
        return {"run": str(rd), "creator": creator, "cached": True}

    wav = rd / "audio.wav"
    if "local_file" in info:
        log(f"[{creator}] 1/2 reading audio from local file ({hms(info['duration'])})")
        to_wav(info["local_file"], wav)
    else:
        log(f"[{creator}] 1/2 downloading audio only ({hms(info.get('duration') or 0)})")
        is_yt = "youtube" in (info["platform"] or "").lower()
        with cf.ThreadPoolExecutor(2) as ex:
            fa = ex.submit(run, YTDLP + cookie_args(cookies) + ["--no-playlist", "-f", "bestaudio/audio_only/worst",
                                                                 "-o", str(rd / "audio.%(ext)s"), src])
            fc = ex.submit(run, YTDLP + cookie_args(cookies) + ["--no-playlist", "--skip-download", "--write-subs",
                                                                 "--sub-langs", "live_chat", "-o", str(rd / "chat"), src]) if is_yt else None
            ra = fa.result()
            if fc:
                fc.result()
        a = next((p for p in rd.glob("audio.*") if p.suffix not in (".part", ".ytdl", ".wav")), None)
        if not a:
            raise RuntimeError(f"audio download failed: {ra.stderr[-300:]}")
        to_wav(a, wav)
        a.unlink(missing_ok=True)
    t_dl = time.time()

    log(f"[{creator}] 2/2 transcribing + scanning for loud moments and chat spikes")
    with cf.ThreadPoolExecutor(2) as ex:
        fs = ex.submit(transcribe, wav)
        fl = ex.submit(loud_moments, wav)
        segs, lang = fs.result()
        loud = fl.result()
    chat = chat_spikes(next(iter(rd.glob("chat*.live_chat.json")), None))
    wav.unlink(missing_ok=True)
    info["language"] = lang
    (rd / "stream.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    (rd / "transcript.json").write_text(json.dumps(segs), encoding="utf-8")
    (rd / "signals.json").write_text(json.dumps({"loud": loud, "chat": chat}, indent=1), encoding="utf-8")

    dur = info.get("duration") or (segs[-1]["end"] if segs else 0)
    n = max(1, math.ceil(dur / CHUNK_SEC))
    for ci in range(n):
        a, b = ci * CHUNK_SEC, (ci + 1) * CHUNK_SEC
        lines = [f"# {creator}: {info['title']}", f"Chunk {ci + 1}/{n}  ({hms(a)} to {hms(b)})",
                 "Markers: LOUD(+dB over normal) = speaker got loud. CHAT xN = chat moving N times faster than normal.", ""]
        for s in segs:
            if s["end"] <= a or s["start"] >= b:
                continue
            tags = []
            for e in loud:
                if e["start"] <= s["end"] and e["end"] + 1 >= s["start"]:
                    tags.append(f"LOUD(+{e['db']:.0f}dB)")
                    break
            for e in chat:
                if e["start"] - 15 <= s["end"] and e["end"] >= s["start"]:
                    tags.append(f"CHAT x{e['x']}")
                    break
            lines.append(f"[{hms(s['start'])}] {s['text']}" + (f"   <<{' '.join(tags)}>>" if tags else ""))
        (rd / "chunks" / f"chunk_{ci + 1:02d}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (rd / "timing.json").write_text(json.dumps({"prep_started": t0, "download_sec": round(t_dl - t0),
                                                "analyse_sec": round(time.time() - t_dl), "chunks": n,
                                                "segments": len(segs), "loud_events": len(loud),
                                                "chat_spikes": len(chat)}, indent=1), encoding="utf-8")
    log(f"[{creator}] ready: {n} chunks, {len(loud)} loud moments, {len(chat)} chat spikes "
        f"({round(time.time() - t0)}s) -> {rd}")
    return {"run": str(rd), "creator": creator, "chunks": n}


def cmd_prep(a):
    RUNS.mkdir(parents=True, exist_ok=True)
    results = []
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        futs = {ex.submit(prep_one, u, a.cookies, a.force): u for u in a.sources}
        for f in cf.as_completed(futs):
            try:
                results.append(f.result())
            except Exception as e:
                results.append({"url": futs[f], "error": str(e)})
                log(f"FAILED {futs[f]}: {e}")
    log("\nRUNS:")
    for r in results:
        log(f"  {r.get('run') or ''}  {r.get('error') or ''}")
    if results and all(r.get("error") for r in results):
        sys.exit(1)


def cmd_status(a):
    rd = Path(a.run)
    chunks = sorted((rd / "chunks").glob("chunk_*.md"))
    picked = {p.stem for p in (rd / "picks").glob("chunk_*.json")}
    cands = sum(len(json.loads(p.read_text(encoding="utf-8"))) for p in (rd / "picks").glob("chunk_*.json"))
    log(json.dumps({"run": str(rd), "chunks": len(chunks), "picked_chunks": len(picked), "candidates": cands,
                    "chunks_left": [c.name for c in chunks if c.stem not in picked],
                    "clips": sorted(x.name for x in (rd / "clips").glob("*.mp4")) if (rd / "clips").exists() else []},
                   indent=1))


# ---------------------------------------------------------------- selection
def select(rd, top, min_score):
    segs = json.loads((rd / "transcript.json").read_text(encoding="utf-8"))
    cands = []
    for p in sorted((rd / "picks").glob("chunk_*.json")):
        try:
            for c in json.loads(p.read_text(encoding="utf-8")):
                c["_s"], c["_e"] = parse_ts(c["start"]), parse_ts(c["end"])
                if c.get("teaser"):
                    c["_ts"], c["_te"] = parse_ts(c["teaser"]["start"]), parse_ts(c["teaser"]["end"])
                cands.append(c)
        except Exception as e:
            log(f"  bad pick file {p.name}: {e}")
    ok = []
    for c in sorted(cands, key=lambda c: -float(c.get("score", 0))):
        if float(c.get("score", 0)) < min_score:
            continue
        st = max([s["start"] for s in segs if s["start"] <= c["_s"] + 0.5] or [c["_s"]])
        en = min([s["end"] for s in segs if s["end"] >= c["_e"] - 0.5] or [c["_e"]])
        if en - st < 12:
            continue
        if any(not (en + 20 < o["_s"] or st > o["_e"] + 20) for o in ok):
            continue
        c["_s"], c["_e"] = max(0, st - 0.2), en + 0.35
        teaser = (c["_te"] - c["_ts"]) if "_ts" in c else 0
        if teaser:
            teaser = min(teaser, 5.0)
            c["_te"] = c["_ts"] + teaser
        budget = MAX_LEN - (teaser - TRANS if teaser else 0)
        if c["_e"] - c["_s"] > budget:          # keep it under a minute: trim the tail
            cut = c["_s"] + budget
            ends = [s["end"] for s in segs if c["_s"] + 15 < s["end"] <= cut]
            c["_e"] = (max(ends) + 0.2) if ends else cut
            c["_e"] = min(c["_e"], cut)
        ok.append(c)
        if len(ok) >= top:
            break
    return ok, len(cands)


# ---------------------------------------------------------------- framing
def find_facecam(video, VW, VH):
    """Find a face that stays in the same small spot (stream facecam overlay) and its box edges;
    or a big face (talking head / podcast cam) to crop around."""
    import cv2
    import numpy as np
    cap = cv2.VideoCapture(str(video))
    nfr = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 300
    haar = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces, grads = [], []
    for i in range(12):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(nfr * (i + 0.5) / 12))
        ok, fr = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        grads.append((np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0)), np.abs(cv2.Sobel(g, cv2.CV_32F, 0, 1))))
        faces.append([tuple(map(float, f)) for f in haar.detectMultiScale(g, 1.1, 6, minSize=(40, 40))])
    cap.release()
    flat = [f for fs in faces for f in fs]
    if not flat:
        return {"mode": "gameplay"}
    best, best_n = None, 0
    for f in flat:
        cx, cy = f[0] + f[2] / 2, f[1] + f[3] / 2
        members = [g for g in flat if abs(g[0] + g[2] / 2 - cx) < VW * 0.06 and abs(g[1] + g[3] / 2 - cy) < VH * 0.08]
        if len(members) > best_n:
            best, best_n = members, len(members)
    if best_n < max(3, len(faces) * 0.4):
        return {"mode": "gameplay"}
    fx, fy, fw, fh = (statistics.median(m[k] for m in best) for k in range(4))
    if fw > VW * 0.08:  # a real-sized face: talking head / podcast camera, crop around it
        return {"mode": "cam", "face": [fx, fy, fw, fh]}

    gx = np.median(np.stack([g[0] for g in grads]), axis=0)
    gy = np.median(np.stack([g[1] for g in grads]), axis=0)

    def scan(profile, start, stop):
        vals = [(profile[i], i) for i in range(int(start), int(stop), 1 if stop > start else -1) if 0 <= i < len(profile)]
        if len(vals) < 5:
            return None
        v, i = max(vals)
        return i if v > 3.5 * (statistics.median(x for x, _ in vals) + 1e-3) and v > 6 else None

    y0, y1 = int(max(0, fy - fh * 0.5)), int(min(VH, fy + fh * 1.5))
    x0, x1 = int(max(0, fx - fw * 0.5)), int(min(VW, fx + fw * 1.5))
    colp, rowp = gx[y0:y1].mean(axis=0), gy[:, x0:x1].mean(axis=1)
    L, R = scan(colp, fx - fw * 0.15, fx - fw * 2.6), scan(colp, fx + fw * 1.15, fx + fw * 3.6)
    T, B = scan(rowp, fy - fh * 0.15, fy - fh * 2.2), scan(rowp, fy + fh * 1.15, fy + fh * 3.2)
    cw_guess = fw * 3.4
    ch_guess = cw_guess * 0.75
    L = L if L is not None else fx + fw / 2 - cw_guess / 2
    R = R if R is not None else fx + fw / 2 + cw_guess / 2
    T = T if T is not None else fy + fh * 0.45 - ch_guess * 0.45
    B = B if B is not None else fy + fh * 0.45 + ch_guess * 0.55
    L, R, T, B = max(0, L + 2), min(VW, R - 2), max(0, T + 2), min(VH, B - 2)
    if R - L < fw * 1.4 or B - T < fh * 1.4:
        return {"mode": "gameplay"}
    return {"mode": "facecam", "box": [int(L), int(T), int(R - L), int(B - T)], "face": [fx, fy, fw, fh]}


def layout_filter(fc, VW, VH, inp, out):
    """Filter chain: [inp] -> 1080x1920 [out]. Returns (chain, hook_y, caption_y)."""
    if fc["mode"] == "facecam":
        L, T, cw, ch = fc["box"]
        top_h = int(min(960, max(560, 1080 * ch / cw))) // 2 * 2
        bot_h = H - top_h
        gw, gh = VH * 1080 / bot_h, VH
        if gw > VW:
            gw, gh = VW, VW * bot_h / 1080
        gx, gy = (VW - gw) / 2, (VH - gh) / 2
        chain = (f"[{inp}]split[{out}a][{out}b];[{out}a]crop={cw}:{ch}:{L}:{T},scale=1080:{top_h}:force_original_aspect_ratio=increase,"
                 f"crop=1080:{top_h}[{out}t];[{out}b]crop={int(gw)}:{int(gh)}:{int(gx)}:{int(gy)},scale=1080:{bot_h}[{out}g];"
                 f"[{out}t][{out}g]vstack[{out}]")
        return chain, top_h, top_h + int(bot_h * 0.55)
    if fc["mode"] == "cam":
        fx, fy, fw, fh = fc["face"]
        cw = int(min(VW, VH * 9 / 16)) // 2 * 2
        cx = int(min(max(0, fx + fw / 2 - cw / 2), VW - cw))
        return f"[{inp}]crop={cw}:{VH - VH % 2}:{cx}:0,scale={W}:{H}:flags=lanczos[{out}]", 300, 1300
    chain = (f"[{inp}]split[{out}a][{out}b];[{out}a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
             f"boxblur=30:3,eq=brightness=-0.15[{out}bg];[{out}b]scale={W}:-2[{out}fg];[{out}bg][{out}fg]overlay=0:(H-h)/2[{out}]")
    return chain, 420, 1420


# ---------------------------------------------------------------- captions (animated ASS)
def ats(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def esc(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")")


HILITE = ["&H0000E5FF&", "&H0055FF55&", "&H00FFD000&"]  # yellow, green, cyan (ASS is BGR)


def build_ass(words, hook, total, hook_y, cap_y, watermark=""):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Black,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,4,5,50,50,0
Style: Hook,Inter Black,62,&H00101010,&H00101010,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,24,0,5,100,100,0
Style: Bar,Inter Black,10,&H0000E5FF,&H0000E5FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0
Style: Wm,Inter ExtraBold,36,&H66FFFFFF,&H66FFFFFF,&H66000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,80

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) >= 3 or len(" ".join(x["t"] for x in cur)) >= 15
                    or w["s"] - cur[-1]["e"] > 0.45 or re.search(r"[.?!,]$", cur[-1]["t"])):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    ev = []
    for gi, g in enumerate(groups):
        color = HILITE[gi % len(HILITE)]
        for i, w in enumerate(g):
            t1 = g[i + 1]["s"] if i + 1 < len(g) else max(w["e"], w["s"] + 0.15)
            if t1 <= w["s"]:
                continue
            txt = []
            for j, x in enumerate(g):
                word = esc(x["t"].upper())
                txt.append(r"{\c" + color + r"\fscx118\fscy118\t(0,90,\fscx100\fscy100)}" + word + r"{\r}" if j == i else word)
            pop = r"\fscx75\fscy75\t(0,90,\fscx100\fscy100)" if i == 0 else ""
            ev.append(f"Dialogue: 1,{ats(w['s'])},{ats(t1)},Cap,,0,0,0,,{{\\pos({W // 2},{cap_y}){pop}}}" + " ".join(txt))
    if hook:  # hook title card: pops in with a little tilt, holds 3.2 s, fades
        ev.append(f"Dialogue: 2,{ats(0)},{ats(min(3.2, total))},Hook,,0,0,0,,"
                  f"{{\\pos({W // 2},{hook_y})\\fad(0,250)\\fscx55\\fscy55\\frz-4\\t(0,170,\\fscx107\\fscy107\\frz2)"
                  f"\\t(170,300,\\fscx100\\fscy100\\frz0)}}" + esc(hook.upper()))
    ev.append(f"Dialogue: 3,{ats(0)},{ats(total)},Bar,,0,0,0,,"   # progress bar fills along the bottom
              f"{{\\pos(0,0)\\clip(0,{H - 14},0,{H})\\t(0,{int(total * 1000)},\\clip(0,{H - 14},{W},{H}))\\p1}}"
              f"m 0 {H - 14} l {W} {H - 14} {W} {H} 0 {H}")
    if watermark:
        ev.append(f"Dialogue: 0,{ats(0)},{ats(total)},Wm,,0,0,0,,{esc(watermark)}")
    return head + "\n".join(ev) + "\n"


def clip_words(src, ss, dur, work, lang, tag):
    wav = work / f"{tag}.wav"
    to_wav(src, wav, ss, dur)
    segs, _ = transcribe(wav, words=True, language=lang)
    words = []
    for s in segs:
        t = s["text"].strip()
        if not t or re.fullmatch(r"\[.*\]|\(.*\)", t):
            continue
        if re.fullmatch(r"[^\w]+", t) and words:
            words[-1]["t"] += t
            continue
        words.append({"t": t, "s": s["start"], "e": min(s["end"], dur)})
    wav.unlink(missing_ok=True)
    return words


def make_whoosh(path):
    if not path.exists():
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.6", "-af",
             "highpass=f=400,lowpass=f=6000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.2,volume=0.45",
             "-ac", "2", "-ar", "48000", str(path)])
    return path


def punch_windows(words, total, start_at):
    """Alternate 1.0x / 1.12x zoom on each sentence (jump-cut punch-ins keep eyes on screen)."""
    cuts = [start_at] + [w["e"] for w in words if re.search(r"[.?!]$", w["t"]) and start_at + 1 < w["e"] < total - 1] + [total]
    cuts = sorted(set(round(c, 2) for c in cuts))
    merged = [cuts[0]]
    for c in cuts[1:]:
        if c - merged[-1] >= 2.5 or c == cuts[-1]:
            merged.append(c)
    return [(merged[i], merged[i + 1]) for i in range(1, len(merged) - 1, 2)]


# ---------------------------------------------------------------- render (step 4)
def fetch_section(info, a, b, work, cookies, tag):
    if info.get("local_file"):
        return Path(info["local_file"]), a   # cut straight from the file
    out = next(work.glob(f"{tag}.*"), None)
    if not out:
        r = run(YTDLP + cookie_args(cookies) + ["--no-playlist", "-f",
                "bv*[height<=1080][fps<=60]+ba/b[height<=1080]/bv*+ba/b", "--download-sections", f"*{a:.1f}-{b:.1f}",
                "--force-keyframes-at-cuts", "--merge-output-format", "mp4", "-o", str(work / f"{tag}.%(ext)s"),
                info["webpage_url"]])
        out = next((p for p in work.glob(f"{tag}.*") if p.suffix in (".mp4", ".mkv", ".webm")), None)
        if not out:
            raise RuntimeError("section download failed: " + r.stderr[-300:])
    return out, 0.0   # file starts at stream time a


def render_one(rd, info, c, n, cookies, keep, watermark):
    clips = rd / "clips"
    clips.mkdir(exist_ok=True)
    work = rd / f"work_{n:02d}"
    work.mkdir(exist_ok=True)
    lang = info.get("language")
    pad = 3.0

    # pieces: optional teaser (hook line pulled from inside/after the moment), then the moment itself
    pieces = []
    if "_ts" in c:
        pieces.append(("teaser", c["_ts"], c["_te"]))
    pieces.append(("main", c["_s"], c["_e"]))
    srcs = []
    for tag, s, e in pieces:
        a = max(0, s - pad)
        f, base = fetch_section(info, a, e + 1, work, cookies, tag)
        ss = s - a if base == 0.0 and not info.get("local_file") else s
        srcs.append((tag, f, ss, e - s))

    main_f = srcs[-1][1]
    pr = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                         "stream=width,height", "-of", "json", str(main_f)]).stdout)
    VW, VH = pr["streams"][0]["width"], pr["streams"][0]["height"]
    if info.get("local_file"):  # detect on the moment's own frames
        probe = work / "probe.mp4"
        run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{c['_s']:.2f}", "-t", f"{min(30, c['_e'] - c['_s']):.2f}",
             "-i", str(main_f), "-an", "-vf", "fps=2", "-c:v", "libx264", "-preset", "ultrafast", str(probe)])
        fc = find_facecam(probe, VW, VH)
    else:
        fc = find_facecam(main_f, VW, VH)
    forced = c.get("layout")
    if forced == "gameplay" or (forced == "cam" and "face" not in fc):
        fc = {"mode": "gameplay"}
    elif forced == "cam":
        fc = {"mode": "cam", "face": fc["face"]}

    # captions on the output timeline
    durs = [d for _, _, _, d in srcs]
    total = sum(durs) - TRANS * (len(srcs) - 1)
    words, off = [], 0.0
    for (tag, f, ss, d) in srcs:
        for w in clip_words(f, ss, d, work, lang, tag):
            s, e = off + w["s"], off + w["e"]
            if words and s < words[-1]["e"]:
                words[-1]["e"] = s
                if words[-1]["e"] - words[-1]["s"] < 0.05:
                    words.pop()
            words.append({"t": w["t"], "s": s, "e": e})
        off += d - TRANS

    # video graph
    inputs, fcx = [], []
    for i, (tag, f, ss, d) in enumerate(srcs):
        inputs += ["-ss", f"{ss:.3f}", "-t", f"{d:.3f}", "-i", str(f)]
        chain, hook_y, cap_y = layout_filter(fc, VW, VH, f"{i}:v", f"L{i}")
        fcx.append(chain)
        zoom = 1.12 if tag == "teaser" else 1.0   # teaser plays punched-in
        z = f"scale={int(W * zoom) // 2 * 2}:{int(H * zoom) // 2 * 2},crop={W}:{H}," if zoom != 1.0 else ""
        fcx.append(f"[L{i}]{z}fps={FPS},setsar=1,format=yuv420p,settb=AVTB[v{i}]")
        fcx.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a{i}]")
    vl, al = "v0", "a0"
    if len(srcs) == 2:
        fcx.append(f"[v0][v1]xfade=transition=fadewhite:duration={TRANS}:offset={durs[0] - TRANS:.3f}[vx]")
        fcx.append(f"[a0][a1]acrossfade=d={TRANS}[ax]")
        wi = len(srcs)
        inputs += ["-i", str(make_whoosh(rd.parent / "whoosh.wav"))]
        fcx.append(f"[{wi}:a]adelay={int(max(durs[0] - TRANS - 0.15, 0) * 1000)}:all=1[wd]")
        fcx.append(f"[ax][wd]amix=inputs=2:normalize=0:duration=first[am]")
        vl, al = "vx", "am"
    # punch-in zooms on alternating sentences of the main moment
    main_start = (durs[0] - TRANS) if len(srcs) == 2 else 0.0
    wins = punch_windows(words, total, main_start + 0.5)
    if wins:
        en = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in wins)
        fcx.append(f"[{vl}]split[pz0][pz1];[pz1]scale={int(W * 1.12) // 2 * 2}:{int(H * 1.12) // 2 * 2},crop={W}:{H}[pzz];"
                   f"[pz0][pzz]overlay=0:0:enable='{en}'[vp]")
        vl = "vp"
    ass = work / "subs.ass"
    ass.write_text(build_ass(words, c.get("hook") or c.get("title"), total, hook_y, cap_y, watermark), encoding="utf-8")
    fcx.append(f"[{vl}]ass='{str(ass).replace(':', chr(92) + ':')}':fontsdir='{FONTS}'[v]")
    fcx.append(f"[{al}]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")

    out = clips / f"clip_{n:02d}_{slug(c.get('title') or c.get('hook'), 40)}.mp4"
    r = run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(fcx),
             "-map", "[v]", "-map", "[aout]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium",
             "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
    if r.returncode != 0:
        raise RuntimeError("render failed: " + r.stderr[-800:])
    tags = " ".join(c.get("hashtags") or ["#shorts", "#viral", "#fyp"])
    out.with_suffix(".txt").write_text(
        f"TITLE: {c.get('title', '')}\n\nCAPTION:\n{c.get('caption', '')}\n\n{tags}\n\n"
        f"Source: {info.get('creator')}, {info['webpage_url']} at {hms(c['_s'])}\n"
        f"Category: {c.get('category')}  Score: {c.get('score')}  Layout: {fc['mode']}  Length: {total:.1f}s\n",
        encoding="utf-8")
    if not keep:
        shutil.rmtree(work, ignore_errors=True)
    return out, fc["mode"], total


def cmd_render(a):
    rd = Path(a.run)
    info = json.loads((rd / "stream.json").read_text(encoding="utf-8"))
    t0 = time.time()
    picks, total = select(rd, a.top, a.min_score)
    log(f"[{info.get('creator') or 'video'}] {total} possible moments -> keeping best {len(picks)}")
    made = []
    for n, c in enumerate(picks, 1):
        try:
            out, mode, length = render_one(rd, info, c, n, a.cookies or info.get("cookies"), a.keep, a.watermark)
            made.append({"file": str(out), "title": c.get("title"), "score": c.get("score"), "layout": mode,
                         "at": hms(c["_s"]), "len": round(length, 1)})
            log(f"  clip {n}: {c.get('title')}  ({hms(c['_s'])}, {length:.1f}s, {mode}) -> {out.name}")
        except Exception as e:
            log(f"  clip {n} FAILED: {e}")
    summary = {"video": info.get("title"), "creator": info.get("creator"), "length": hms(info.get("duration") or 0),
               "moments_found": total, "clips": made, "render_time": hms(time.time() - t0)}
    (rd / "clips").mkdir(exist_ok=True)
    (rd / "clips" / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    log(f"\n{summary['length']} video -> {total} moments -> {len(made)} clips -> {rd / 'clips'}")


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="cmd", required=True)
    pr = sp.add_parser("prep"); pr.add_argument("sources", nargs="+", help="URLs or local video files")
    pr.add_argument("--cookies"); pr.add_argument("--jobs", type=int, default=2); pr.add_argument("--force", action="store_true")
    s = sp.add_parser("status"); s.add_argument("run")
    r = sp.add_parser("render"); r.add_argument("run")
    r.add_argument("--top", type=int, default=3); r.add_argument("--min-score", type=float, default=7.0)
    r.add_argument("--cookies"); r.add_argument("--keep", action="store_true")
    r.add_argument("--watermark", default=os.environ.get("CLIPPER_WATERMARK", ""))
    a = p.parse_args()
    {"prep": cmd_prep, "status": cmd_status, "render": cmd_render}[a.cmd](a)


if __name__ == "__main__":
    main()
