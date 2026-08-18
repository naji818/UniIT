---
name: timed-film-production
description: Build a narrated, timed film — animated explainer, educational video, documentary piece, YouTube episode — from a script or brief. Produces a JSON timeline as single source of truth, automatic narration-fit validation, a shot list with per-shot generation prompts, an SRT subtitle track, and a rendered animatic (previz MP4) that locks the edit before any generation credits are spent. Use this whenever someone asks for a video, film, animation, explainer, or narrated piece with a target runtime; wants a script turned into shots, a storyboard, or a shot list; asks how long a narration will run or whether it fits; needs an animatic or previz; or wants to revise the timing, scenes, or narration of an existing cut. Reach for it even when they don't say "animatic" or "shot list" — if the request is "turn this script into a video of about N minutes", this is the pipeline.
---

# Timed film production

A method for building films where **narration and runtime are both fixed
constraints**. It exists because the naive approach — write scenes, guess
durations, discover at the end that the read doesn't fit — wastes the most
expensive resource in the pipeline: generated footage you have to throw away.

Reference implementation lives in this repository under `tools/`, `animatic/`,
and `production/`. Read those files when you need the working code; this
document explains the architecture and the reasoning, which is the part that
transfers to a new project.

## The two ideas that matter

**1. One source of truth.** Every document — script, shot list, prompt sheet,
subtitles, animatic data, YouTube chapters — is *generated* from a single
`production/timeline.json`. Hand-maintained parallel documents always drift:
someone edits a line in the script, the shot list still says 6 seconds, and the
error surfaces after footage exists. Generation makes drift structurally
impossible.

**2. Narration is fixed; picture time is the variable.** The script belongs to
the client. Shot durations don't. So measure the narration's spoken duration and
fit the picture around it — never the reverse. This inverts the usual instinct
(write shots, then squeeze the read) and it is the single highest-value idea
here.

On the reference project the first assembly ran 8:09 with four scenes whose
narration physically could not fit the picture. Rebalancing against measured
speaking time brought it to 7:54 with every scene passing. Nobody had to cut a
word.

## The timeline

`production/timeline.json` holds everything:

```
title, meta (format, fps, target runtime, wpm, tone)
protagonist (name, visual_anchor, arc)   ← character consistency lives here
style (base look, per-act look + palette, global negative prompt)
audio (music arc, sfx, mix levels)
scenes[]
  id, name, act, intent
  vo[]        ← narration lines, verbatim, one sentence each
  shots[]
    id, dur, camera, action, prompt, onscreen[], note
```

Two fields carry more weight than their size suggests:

- **`intent`** — one line on what the scene must accomplish emotionally. When a
  generated shot looks fine but feels wrong, this is what you check it against.
- **`note`** — a per-shot warning for shots with a creative trap. These are the
  shots most likely to come back subtly wrong in a way that changes the film's
  meaning, and they are worth flagging loudly.

Keep `vo` lines as individual sentences. The timing model prices each line
separately and inserts a landing pause between them, which is how narration
actually gets read.

## Workflow

```bash
cd tools
python3 rebalance.py            # refit shot durations to the narration
python3 check_timing.py         # GATE — runtime + narration fit
python3 build_docs.py           # script/narration.md, shot-list.md, prompt-sheet.md
python3 build_subtitles.py      # script/narration.srt
python3 build_animatic_data.py  # animatic/data.js
python3 render_animatic.py      # previz MP4
```

`check_timing.py` is a gate, not a report. It exits non-zero when the cut leaves
the target runtime band or when any scene no longer leaves enough picture time
for its narration. Treat a failure as a hard stop — everything downstream
inherits the error.

Never edit anything in `script/`. Those files carry a generated-file banner and
are overwritten. Edit `production/timeline.json` and rebuild.

## The narration timing model

Lives in `tools/timeline_lib.py`. Three constants do the work:

- **`WORDS_PER_SECOND`** from a target wpm (140 is a comfortable educational
  read; 160+ starts to feel rushed for a non-native audience)
- **`SENTENCE_PAUSE`** — a beat after every line, because narration is not
  read as continuous prose
- **`MIN_LINE_SECONDS`** — a floor, because a three-word line like
  *"Statistics matters."* is delivered slowly for emphasis, not proportionally
  to its word count. Without this floor short punchy lines get starved.

`rebalance.py` then sets each scene's target to `vo_seconds + breathing`, and
distributes that across the scene's shots in proportion to their existing
durations, snapped to a 0.5s grid, with the rounding error pushed onto shots
that can absorb it without breaching min/max shot length. The proportional part
matters — it preserves the rhythm the shots were designed with instead of
flattening everything to an average.

Watch **speaking density** (share of runtime with narration over it). Past ~90%
the film has no room to breathe and needs either a longer runtime or a shorter
script — that's a conversation with the client, not something to silently fix.

## The animatic

A previz cut rendered before any footage is generated, so the edit, the read and
the text treatment can be approved while changes are still free.

`animatic/engine.js` is a deterministic canvas renderer: **every frame is a pure
function of time**. No `requestAnimationFrame`, no wall clock, no unseeded
randomness (use a seeded PRNG). Determinism is what makes the render
reproducible and lets frames be produced out of real time.

`tools/render_animatic.py` drives it in headless Chromium and pipes each JPEG
straight into ffmpeg's stdin, so **no intermediate frames ever touch disk**. A
7-minute 1080p24 cut is ~11,000 frames; writing those out would be gigabytes.

Shots map to reusable visual modules via `production/animatic_viz.json`
(`shot-id → [module, variant, textMode?]`). Roughly 20 parameterised modules
covered 78 shots. Resist writing one module per shot — variants of a shared
module keep the visual language coherent, which is what an animatic is for.

Useful flags: `--probe` (one still per shot, the fastest way to review every
module at once), `--hud` (burn in shot id and timecode), `--start/--end`.

## Typography

**Add on-screen text in post, never in the generation prompt.** Video models
produce malformed lettering. Write prompts that deliberately leave clean negative
space for type instead.

The animatic's `onscreen()` function is the working reference for reveal
patterns: 1–2 strings become a hero card, 3–6 a staggered stack, 7+ a staggered
grid revealed in waves so each label lands readable.

Two things that will bite on the first pass:

- **Measure and shrink text to fit.** A fixed font size overflows the frame the
  moment a string is longer than you assumed. Shrink until the measured width
  fits, then draw.
- **Line height must exceed font size.** Setting it below (e.g. `size * 0.82`)
  makes two-line titles collide. Use ~1.4×.

Over busy visuals, put a soft dark scrim behind text blocks. Legibility beats
purity.

## Character consistency

If a person recurs across shots, generate **one character sheet first** and pass
it as an image reference to every shot featuring them. Text-only prompts will not
hold a face across dozens of shots, and a drifting face is the failure mode most
likely to sink the whole film.

Put the visual description in `protagonist.visual_anchor` and reuse it verbatim
in every prompt. Play the character's arc in posture and bearing, not wardrobe —
same person, same clothes, different carriage.

## Before spending generation credits

Preflight the cost rather than inferring it from a balance. Per-shot video cost
varies by an order of magnitude between models at identical duration and
resolution, and the cheapest capable model is often not the obvious one. Multiply
by shot count, then by a realistic keeper rate — **assume roughly one usable take
in three** for character-consistent work — before quoting a budget.

Generate scene by scene, not shot by shot, reviewing each scene as a block
against the art direction. A drift in look then costs five shots to catch, not
seventy-eight.

## Protecting the message

Educational films argue something, and generated footage will quietly undermine
the argument if you let it. On the reference project the brief's rules became
explicit per-shot notes: never show an older technology as dead or crumbling;
light two contrasted paths *equally* when the point is that both matter; frame a
cautionary beat as a trap the subject fell into rather than a punishment; keep
speculative technology conditional; make an unknown future bright rather than
black.

The general lesson: when a brief says "don't imply X", find the specific shot
where a model would most naturally imply X, and write the counter-instruction
into that shot's `note`. Prose rules in a style guide get averaged away; a note
attached to the shot gets read at the moment it matters.

## Publishing

`tools/build_youtube.py` generates the description with chapter markers derived
from the timeline, so chapter timestamps cannot go stale. It validates YouTube's
rules before writing (first chapter at 0:00, 3+ chapters, 10s minimum, 5000-char
description, 500-char tags). Floor chapter timestamps rather than rounding — a
rounded-up marker lands past the cut it labels.

Two platform facts worth stating early, because they change what you upload:
YouTube **cannot replace a video file** after upload (only metadata is editable,
so a finished version is a new upload with a new URL), and its editor can add
**library music only, never narration**. Voice-over has to be muxed before
upload.
