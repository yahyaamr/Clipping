# Handoff prompt for a new Claude account

Paste everything below the line into the first message of a new Claude Code session (claude.ai/code or the
Claude app) on the new account, with the `yahyaamr/clipping` repository attached.

Before you start, on the new account:
1. Connect GitHub (claude.ai → Settings → Connectors / GitHub) and make sure the Claude GitHub App can see `yahyaamr/clipping`.
2. Create a cloud environment and set **Network access** to allow at least: `registry.npmjs.org`, `pypi.org`,
   `files.pythonhosted.org`, `api.cloudinary.com`, `res.cloudinary.com` (plus the default package-manager list).
   Optional for links: `youtube.com`, `googlevideo.com`, `ytimg.com`, `twitch.tv`, `usher.ttvnw.net`, `kick.com`.
3. Generate a **new** Cloudinary API key just for Claude (Cloudinary → Settings → API Keys → Generate New API Key), and add
   it to the environment as an **environment variable** (not a network secret):
   `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`. Never paste the key into the chat.
4. Start the session **after** saving the environment, so it sees the variable.

---

You're picking up a project I started with Claude on another account. Read this whole brief, then read the
repo, then confirm the plan back to me before building anything new.

## Who I am and what I'm building

I'm starting **viral short-form channels on YouTube Shorts and TikTok** and want to earn from views and from
paid clipping campaigns. I want to run everything **from my phone, cloud-based**, with as little manual work
as possible. Two content lines:

1. **Clipping channel**: long videos (podcasts, streams, interviews) → vertical 9:16 clips under 60 s that open on a hook.
2. **Stickman motivation channel**: code-animated stickman shorts about discipline/motivation, one per day.

## Repository: `yahyaamr/clipping`

There is no `main` branch yet. Two branches hold the work:

| Branch | What's on it |
|---|---|
| `claude/eager-gauss-etpamg` (same commit as `claude/blissful-cori-vc1ku3`) | The **clipper skill** at `.claude/skills/clipper/` (latest: slower, readable captions) |
| `claude/stoic-einstein-xzjq6e` | The clipper skill **plus** `stickman/`, the stickman engine and episode 001 "THE WEIGHT" |

First task: propose creating `main` from these (stickman branch already contains the clipper commits) and ask me before pushing.

### The clipper skill (`.claude/skills/clipper/`)
- `SKILL.md`: the workflow (setup → prep → Claude picks moments → render → report). Triggers on "clip this video <link or file>", "make shorts from…", "set up the clipper", `/clipper`.
- `references/picking.md`: how to pick and score moments (read it every time before picking).
- `scripts/clipper.py`: `prep`, `status`, `render`. `scripts/setup.sh`: installs yt-dlp, faster-whisper, OpenCV <5, Pillow; downloads Whisper small.
- Fonts: Inter Black / ExtraBold (OFL). Ported from `vossashtonai/gta6-clipper-windows` (MIT), generalised from GTA 6 streams to any video, Linux/macOS/cloud.
- **The picking is done by the Claude session itself. No LLM API keys.**

Important environment facts we already solved:
- **Whisper model comes from npm, not Hugging Face** (`@skillninja/shortmovie-telop-model-p0..p3`, data-only, sha256 `ca732cb1…ce73` checked in `setup.sh`) → `~/.cache/clipper/whisper-small`. huggingface.co isn't needed.
- OpenCV must be **<5** (5 dropped the Haar face detector).
- Whisper splits numbers ("$4 ,000"); the clipper rejoins them.
- **YouTube blocks cloud servers** ("Sign in to confirm you're not a bot", HTTP 403 on streams, even after allowing the domains). Don't try PO-token plugins to get around it. Twitch's video host (`usher.ttvnw.net`) was blocked by the network policy. Therefore **uploaded files / Cloudinary are the main input**, not links.

## Video style (keep exactly this; it's tuned already)

Each clip, 1080×1920, 30 fps, **≤ 59.5 s total** (trimmed at the last sentence end that fits):
1. **Hook teaser first**: the punchiest 2–4 s line of the moment (usually the payoff), punched in at 1.12×.
2. **White flash (0.3 s) + whoosh SFX** into the start of the moment.
3. **Punch-in zooms** alternating 1.0× / 1.12× per sentence (jump-cut feel).
4. **Animated captions**, uppercase Inter Black ~84 px, white with thick black outline, centred.
   After my feedback that captions were too fast: phrases of **up to 4 words**, each held **≥ ~0.8 s** (avg ~0.9 s)
   and kept on until the next phrase (no blank flicker), **break at sentence ends**, the phrase pops in once, and
   **only the highlight colour moves word to word** (cycling yellow / green / cyan). **No per-word size bounce.**
   If still too fast for a fast talker: offer a 2-line (6–8 words) mode.
5. **Hook title card**: black Inter Black text on a white box, pops in for the first 3 s, max ~7 words, no emoji (they don't render).
6. **Progress bar** (yellow) along the bottom; optional **@handle watermark** (semi-transparent); audio normalised to **-14 LUFS**.
7. **Auto layout**: stream facecam stacked over gameplay / face-centred crop for talking heads / **full frame enlarged
   over a blurred copy** for wide group shots (foreground made bigger after I said it only filled a third of the screen).
   Per-pick override: `"layout": "cam"` or `"gameplay"`.
8. A `.txt` per clip: post **title** (sentence case, <70 chars), **caption** (1–2 lines + a question to drive comments, emoji ok, no links), **4–6 hashtags** (topic + creator + `#shorts`).
9. Per-pick `"fixes": {"Korn": "Corn"}` corrects misheard caption words.

## Hooks and moment picking (from `references/picking.md`)

Act as the editor of a clip page with millions of followers; be harsh.
- Categories: `story`, `hot_take`, `insight`, `confession`, `funny`, `freakout`, `first_reaction`, `fail`.
- Signals `<<LOUD(+NdB)>>` and `<<CHAT xN>>` help but don't decide.
- Throw out: needs prior context, starts with filler, ads/sponsor/intros, Whisper junk, hateful/sexual/private-life content, dangerous medical/financial claims.
- Score 0–10: 9–10 anyone would stop and share; 7–8 clear hook in 3 s; default render keeps `--min-score 7`, top 3. Never lower the bar silently; offer `--min-score 6`.
- Moment 20–55 s, start ON the hook, end right after the payoff.
- Hook text patterns that work: "HE TURNED DOWN $10M FOR THIS", "NOBODY TALKS ABOUT THIS", "SHE DIDN'T KNOW SHE WAS LIVE", "THEY NAMED THEIR ALLIANCE WHAT?!".
- Write hooks/captions in the video's language unless I say otherwise.
- After rendering, grab a frame per clip and look at it; fix framing and re-render.

## Cloudinary integration (designed, NOT built yet; build this first)

Goal: **phone → Cloudinary → Claude cloud session → Cloudinary → phone.** I upload a long video to Cloudinary from
my phone, then in the Claude app say "clip my latest Cloudinary video" (or name it). The session downloads it,
runs the clipper, and uploads the finished clips back so they survive after the container is deleted.

What we tested: `api.cloudinary.com` and `res.cloudinary.com` are reachable from the cloud session; there is no
Cloudinary connector for Claude, so call the API directly using `CLOUDINARY_URL` from the environment. It's an
environment variable (not a network secret) because uploads must be signed by the code. The key needs upload permission.

Build it into the clipper skill:
- `clipper.py cld-list [--folder sources] [--n 10]`: list recent video uploads (public_id, duration, size, created_at).
- `clipper.py cld-pull <public_id|latest>`: download the original via its `secure_url` into `source/`, then `prep` it.
- `clipper.py cld-push <run>`: upload each `clips/clip_NN_*.mp4` to a `clips/<run-name>/` folder, store title/caption/hashtags
  as contextual metadata and tags, upload the `.txt` too (resource_type raw), and print the playable URLs.
- Use chunked upload for big files (Cloudinary's large-upload endpoint); respect the plan's video size limit.
- Parse `CLOUDINARY_URL` yourself or use the `cloudinary` Python package (add it to `setup.sh`). Never print or commit the secret.
- Update `SKILL.md` so "clip my latest Cloudinary video" runs: `cld-pull latest` → prep → pick → render → `cld-push` → report with links.
- Test end to end with a short video I upload, and send me the clips.

Other input routes we discussed:
- A Chrome extension won't help (Chrome on phones has no extensions, and the block is server-side).
- **Remote Control** (Claude desktop app → Settings → Claude Code → Remote Control) on a home Mac/PC lets a phone
  session download YouTube links over my home connection, only while that computer is on. On a Mac: `brew install ffmpeg-full deno`
  (libass for captions, deno for yt-dlp's YouTube JS). On Windows a local session can save to `D:\Clipping`.
- Or download the video elsewhere and upload it to Cloudinary; Cloudinary can't fetch YouTube links itself.

## Who to clip (permission and monetisation)

- **Safest:** paid/official clipping programs: **Whop Content Rewards** (~$1 per 1,000 views typical, $0.20–$6; Whop takes ~10%),
  **MrBeast** (via Clyper), **N3on**, **Lacy** (Reach Pool), **Kick's** clipper program (through agencies).
- **Publicly open to repurposing:** Alex Hormozi, GaryVee, Patrick Bet-David/Valuetainment.
- **Tolerated but no permission (risky):** Kai Cenat, IShowSpeed, Adin Ross, xQc, Jynxzi, Ludwig, Sketch, Duke Dennis.
  Speed, Kai Cenat and CaseOh reportedly have no public program. **Sidemen: not safe without written permission.**
- Also fine: anyone who gives written permission, CC BY videos (credit them), public domain.
- Avoid music/movies/sports inside clips; add "clips"/"fan" to the page name; credit the creator; one niche per account.
- YouTube can refuse monetisation for "reused content", so add our own hooks/edits. TikTok Creator Rewards has required
  videos **over 1 minute**: offer 61–90 s versions if I want that.
- My plan: start with 2–3 Whop campaigns paying ≥$1/1k views + Hormozi/GaryVee. Add each campaign's required watermark/credit.
- The MrBeast Hunger Games video (`youtu.be/q6fgVVmdpgY`) was only a test; we don't earn from it.

## Stickman motivation channel (`stickman/` on `claude/stoic-einstein-xzjq6e`)

Decisions I made:
- **Animation written in code** (no manual work, no AI video generators: they can't keep characters/text consistent).
- **Our own backgrounds/patterns**, subtle, matching the mood. Characters are the focus. **Never copy manga art.**
- It's a genre, not someone's property, so the channel gets its **own signature** (palette, hero look, sign-off).
- Audio: **sound effects only**; I add music manually on TikTok.
- **New characters per topic** (FEAR, PHONE, PROCRASTINATION, "THEY", COMFORT, EXCUSES, DOUBT…).
- **One video per day**; **you also come up with the story ideas.**
- Palette: **black, grey and red, plus green.**

Identity built so far:
- Hero **YOU**: warm white, **red headband** with flowing tails; turns **red** when they refuse to quit.
- Obstacles: faceless grey pill-limb figures with spaced monospace labels (JetBrains Mono) over their heads; Inter Black for big text.
- Red = pressure/transformation, green = growth/the win. Dark backgrounds: grid crosses, halftone dots, rings, focus lines, grain.
- Fixed sign-off every video: **"+1% / BETTER THAN YESTERDAY"** with the hero running.
- Story shape: humiliation → grind (day counter) → low point → breaking point ("NOT TODAY.") → payoff → sign-off, ~30 s, new scene every few seconds.

Code: `engine/figure.js` (FK + two-bone IK rig, labels, headband), `poses.js`, `actions.js` (push-ups, sitting on figures, throws, KO),
`stage.js` (camera, backgrounds, text), `audio.js` (synthesised whoosh/thud/impact/riser/heartbeat/ticks/"HA"/ding),
`episodes/NNN-*.js` (one file per video), `render.js`. Run: `cd stickman && npm install && node render.js episodes/001-the-weight.js`
(add `--stills 3,16` for PNG previews). Episode 001 "THE WEIGHT" renders in ~45 s.

Open items I hadn't answered yet: pacing feedback on episode 001, the hero/end-card design, and **a list of 30 story ideas** for daily posts.
Known rough edges: pose-to-pose motion is simple; the knocked-out figures look stiff.

(Remotion was installed once in a throwaway session but isn't used; the stickman engine has its own renderer.)

## How I want you to work

- I'm usually on my phone: keep replies short and plain, send finished videos as files, and give me exact taps for any settings I must change.
- Commit and push to the session's branch when done; never commit videos, `runs/`, `source/` or secrets.
- Watch every clip's frames before saying it's done, and remind me to watch before posting.

**Start by:** (1) reading the repo on both branches, (2) confirming `CLOUDINARY_URL` is set without printing it,
(3) running `setup.sh`, (4) proposing the `main` branch merge, then (5) building and testing the Cloudinary integration.
