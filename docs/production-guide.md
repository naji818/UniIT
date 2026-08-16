# Production Guide

How to take this repository from an approved script to a finished 3D animated film.

---

## Status

| Deliverable | State |
| --- | --- |
| Narration script, timed | ✅ Complete |
| Shot list / storyboard, 78 shots | ✅ Complete |
| Per-shot generation prompts | ✅ Complete |
| Art direction bible | ✅ Complete |
| Animatic (previz cut, `build/animatic.mp4`) | ✅ Rendered |
| Voice-over recording | ⛔ Not started — needs TTS credits or a voice artist |
| Music and sound design | ⛔ Not started |
| Final 3D shot generation | ⛔ Not started — needs generation credits |
| Online edit and grade | ⛔ Not started |

**The blocker is generation capacity, not the plan.** At the time of writing,
the connected Higgsfield account had 1.05 credits on a free plan and the Artlist
account had no free generations remaining. Every input a render needs is in
this repository and ready to run.

---

## Pipeline

### Step 1 — Lock the script

`script/narration.md` is the timed read. If a line changes, change it in
`production/timeline.json`, never in the generated markdown, then:

```bash
cd tools
python3 rebalance.py     # refit shot durations around the new narration
python3 check_timing.py  # must PASS before anything else proceeds
python3 build_docs.py
python3 build_animatic_data.py
```

`check_timing.py` fails the build if the cut leaves the 6–8 minute brief or if
any scene no longer leaves enough picture time for its narration. Treat a
failure as a hard stop.

### Step 2 — Lock the character

Generate **one** character sheet from the visual anchor in
`docs/art-direction.md`, then use it as an image reference on all 41 shots that
feature the student. Skipping this is the single most common way a film like
this falls apart — the face drifts and the audience stops believing it is one
person.

Higgsfield ships a dedicated workflow for exactly this:

```
get_workflow_instructions({ workflow: "character-sheet" })
```

### Step 3 — Generate shots

`script/prompt-sheet.md` holds 78 self-contained prompts in cut order. Each one
carries its own style, subject, camera and palette, so shots can be generated
independently and in parallel.

Work **scene by scene, not shot by shot** — review each scene as a block against
the art direction before moving on, so a drift in look is caught after 5 shots
rather than after 78.

Apply the global negative prompt (top of the prompt sheet) to every generation.

Shots carrying an `⚠ Note` in `script/shot-list.md` have a specific creative
trap. Read the note before generating; those are the shots most likely to come
back subtly wrong in a way that changes the film's meaning.

### Step 4 — On-screen typography

Do **not** ask the video model to render the on-screen text — models produce
malformed lettering, and the brief calls for minimal, readable type. Every
prompt deliberately leaves clean negative space for typography.

Add all text in post, using the copy and reveal timing already proven in the
animatic (`animatic/engine.js`, the `onscreen` function):

- 1–2 strings → hero card
- 3–6 strings → staggered stack
- 7+ strings → staggered grid, revealed in waves
- `FIN-03` → one hero word at a time

### Step 5 — Voice-over

786 words, target 140 wpm, warm and professional with neutral
Sri Lankan-friendly diction. Time each scene against `script/narration.md`.

A Sri Lankan English narrator is strongly preferred — it matches the setting and
the audience, and it is a large part of why the film will feel addressed to the
student rather than about them.

### Step 6 — Assemble

Cut to the animatic. It is frame-accurate to the shot list, so it doubles as the
edit reference: drop each generated shot onto its corresponding animatic segment
and the timing is already solved.

---

## Cost estimate

78 shots at roughly 5–7 seconds each. Assuming one usable take in three — realistic
for character-consistent cinematic work — budget **200–250 generations**, plus a
character sheet and voice-over.

Check live balances before committing:

```
mcp__higgsfield__balance        # credits and plan
mcp__artlist__get_balance       # credits or remaining free generations
```

---

## The animatic

`build/animatic.mp4` — 7:54, 1920×1080, 24 fps.

It is **previz, not the film**: abstract graphic stand-ins that lock composition,
timing, camera intent, typography and narration pacing. It exists so the edit,
the read and the text treatment can be approved before any credits are spent.

Rebuild or explore it:

```bash
cd tools
python3 render_animatic.py                    # full cut
python3 render_animatic.py --probe            # one still per shot -> build/probe/
python3 render_animatic.py --hud              # burn in shot id + timecode
python3 render_animatic.py --start 60 --end 90  # a single section
```

Or open `animatic/index.html` in a browser to scrub it live
(`?hud=1` for burn-in).

---

## Repository map

```
production/timeline.json      Single source of truth — scenes, narration, shots, prompts
production/animatic_viz.json  Shot -> animatic visual module map (animatic only)

script/narration.md           Timed narration script          (generated)
script/shot-list.md           Shot list and storyboard        (generated)
script/prompt-sheet.md        78 generation prompts           (generated)

docs/art-direction.md         The look, the rules, the character
docs/production-guide.md      This file

tools/timeline_lib.py         Loader and narration timing model
tools/check_timing.py         Runtime and narration-fit validation
tools/rebalance.py            Refits shot durations to the narration
tools/build_docs.py           Generates the three script documents
tools/build_animatic_data.py  Generates animatic/data.js
tools/render_animatic.py      Renders the animatic to MP4

animatic/                     Canvas previz engine
build/                        Render output (not committed)
```

Everything in `script/` is generated. Edit `production/timeline.json` and rebuild.
