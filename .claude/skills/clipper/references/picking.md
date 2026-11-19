# Picking moments (step 3)

You're the editor of a clipping page with millions of followers. You're reading a 12-minute piece of a
transcript (podcast, interview, stream, talk, vlog). Find the moments people actually WATCH TO THE END and
SHARE, score them, and be harsh.

## What to look for

| category | what it looks like |
|---|---|
| `story` | a self-contained story with a twist or payoff ("so I'm sitting there and he says...") |
| `hot_take` | a strong, arguable opinion people will fight about in the comments |
| `insight` | a surprising fact, number, or piece of advice that changes how you see something |
| `confession` | something personal, vulnerable, or shocking the speaker admits |
| `funny` | a joke, roast or bit that lands without setup |
| `freakout` | losing it: yelling, disbelief, rage, uncontrollable laughter |
| `first_reaction` | seeing / hearing / trying something for the first time |
| `fail` | a plan going wrong, getting called out, an awkward moment |

Signals help, they don't decide: `<<LOUD(+NdB)>>` = the speaker got loud. `<<CHAT xN>>` = chat moved N times
faster than normal (chat lags a few seconds, so the moment is usually just before the marker). A loud line
with nothing interesting said is not a clip. A great line with no marker can be.

## Throw out (score 0, don't include)

- Anything that needs earlier context (references to "what I said before", inside jokes, unnamed "he/that thing").
- Starts with filler ("uh so yeah", "anyway", "okay so", "um"): move the start to the first real sentence; if
  there isn't one, drop it.
- Ads, sponsor reads, "subscribe", intros/outros, reading donations, dead air.
- Whisper junk: repeated lines, "[Music]", "Thank you." over and over, text that doesn't fit.
- Anything hateful, sexual, or about real people's private lives; medical/financial claims that are dangerous.

## Scoring (0-10, harsh)

- 9-10: anyone scrolling would stop and share it. Instant payoff, no context needed, strong emotion.
- 7-8: solid clip, clear hook in the first 3 seconds, lands on its own.
- 5-6: fine, but nobody shares it. Include only if the chunk has nothing better.
- below 5: don't include.

Most chunks have 0-2 real candidates. Many have none: write `[]`.

## Boundaries

- The moment: 20-55 seconds. Start ON the hook, not on 30 s of build-up. End right after the payoff.
  Total clip (teaser + moment) must stay under 60 s; the renderer trims the tail if it doesn't.
- Use the `[HH:MM:SS]` timestamps from the chunk. `end` = start of the first line AFTER the moment.

## The teaser (this is what makes it open on a hook)

Most moments build up to their best line. Pull that line to the front: `teaser` = 2-4 seconds of the single
most shocking / funny / quotable sentence, usually the payoff from inside (or right after) the moment. It
plays first, punched in, then a white flash cuts to the start of the moment, so the viewer stays to see how
it gets there. Leave `teaser` out only when the moment's first line is already the strongest hook.

## Output: `picks/chunk_NN.json`

```json
[
  {
    "start": "01:23:41",
    "end": "01:24:19",
    "teaser": {"start": "01:24:09", "end": "01:24:12"},
    "category": "story",
    "score": 8.5,
    "hook": "HE TURNED DOWN $10M FOR THIS",
    "title": "He turned down $10 million and doesn't regret it",
    "caption": "Would you have taken the money? 👀",
    "hashtags": ["#podcast", "#money", "#business", "#shorts", "#fyp"],
    "why": "clear payoff, strong emotion, no context needed"
  }
]
```

- `hook`: on-screen title, max ~7 words, no emoji (they don't render), makes you need to see it. Patterns that
  work: "HE TURNED DOWN $10M FOR THIS", "NOBODY TALKS ABOUT THIS", "SHE DIDN'T KNOW SHE WAS LIVE".
- `title`: post title (YouTube Shorts / TikTok), sentence case, under 70 characters.
- `caption`: 1-2 short lines + a question that gets comments. Emoji fine here. No links.
- `hashtags`: 4-6, topic + creator name tag when known + `#shorts`.
- Optional `layout`: `"cam"` (face crop) or `"gameplay"` (blurred full frame) to override detection.
