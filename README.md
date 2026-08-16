# You Enter University to Study Computer Science — But Are You Ready for the Future?

Production repository for a cinematic 3D animated educational film following a
young Sri Lankan student through a Computer Science degree, and asking whether a
degree alone prepares anyone for a field that changes faster than its syllabus.

**7:54 · 16:9 · 78 shots · 14 scenes · 786 words of narration**

The film is a warning, a roadmap and a motivator — not an advert for a degree.
It respects universities, never calls any technology dead, and draws a hard line
between using AI to learn and using AI to avoid learning.

---

## What is here

A complete, validated pre-production package and a rendered animatic.

| | |
| --- | --- |
| **[`script/narration.md`](script/narration.md)** | The timed narration, cue by cue |
| **[`script/narration.srt`](script/narration.srt)** | Subtitle track, 131 captions, ready for the final cut |
| **[`script/shot-list.md`](script/shot-list.md)** | All 78 shots — camera, action, on-screen text, creative warnings |
| **[`script/prompt-sheet.md`](script/prompt-sheet.md)** | 78 self-contained text-to-video prompts in cut order |
| **[`docs/art-direction.md`](docs/art-direction.md)** | The look, the character, and the seven non-negotiable rules |
| **[`docs/production-guide.md`](docs/production-guide.md)** | How to get from here to a finished film |
| **`build/animatic.mp4`** | The previz cut — full length, fully timed |

## What is not here

**The finished 3D film.** Rendering ~7:54 of character-consistent cinematic
animation needs on the order of 200–250 generations. The connected accounts had
1.05 credits (Higgsfield, free plan) and no remaining free generations (Artlist),
so no shots could be generated.

Everything a render needs is prepared and validated. See
[`docs/production-guide.md`](docs/production-guide.md) for the pipeline and cost
estimate.

## The animatic

`build/animatic.mp4` is a real, watchable 7:54 cut: every shot at its exact
duration, every narration line as a timed caption, every on-screen title in its
final wording and reveal pattern, and abstract graphic stand-ins carrying each
shot's composition and camera intent.

It is deliberately **not** a preview of the final look — it is the instrument for
approving the edit, the read and the text treatment *before* spending credits on
generation.

```bash
cd tools
python3 render_animatic.py          # rebuild the full cut
python3 render_animatic.py --probe  # one still per shot
```

Or open `animatic/index.html` in a browser to scrub it live.

## Structure

`production/timeline.json` is the single source of truth. Scenes, narration,
shot durations, camera notes and generation prompts all live there; the three
documents in `script/` are generated from it and should never be edited directly.

```bash
cd tools
python3 rebalance.py            # refit shot durations around the narration
python3 check_timing.py         # validate runtime and narration fit
python3 build_docs.py           # regenerate script/
python3 build_subtitles.py      # regenerate the subtitle track
python3 build_animatic_data.py  # regenerate the animatic data bundle
```

`check_timing.py` is the gate. It fails if the cut leaves the 6–8 minute brief
or if any scene no longer leaves enough picture time for its narration:

```
Runtime          : 07:54.00  (474s)
Shots            : 78  (mean 6.1s)
Narration words  : 786
Speaking density : 88% of runtime

PASS: runtime within brief and every scene fits its narration.
```

## Scene order

| | Scene | In | Dur |
| --- | --- | --- | --- |
| `OPEN` | Cold open / main title | 00:00 | 11.0s |
| `S1` | The first day | 00:11 | 29.0s |
| `S2` | The university experience | 00:40 | 31.0s |
| `S3` | The technology timeline | 01:11 | 23.5s |
| `S4` | Java to Python — concepts transfer | 01:34 | 23.0s |
| `S5` | Web development evolves | 01:57 | 25.0s |
| `S6` | The AI explosion | 02:22 | 26.5s |
| `S7` | Mathematics and statistics | 02:49 | 42.5s |
| `S8` | Theory and application | 03:31 | 25.5s |
| `S9` | The market expectation | 03:57 | 31.5s |
| `S10` | AI and academic integrity | 04:28 | 46.0s |
| `S11` | Building a portfolio | 05:14 | 27.5s |
| `S12` | The speed of technology | 05:42 | 24.5s |
| `S13` | Quantum computing | 06:06 | 44.0s |
| `FINAL` | The message to the student | 06:50 | 52.5s |
| `END` | End title | 07:43 | 11.0s |
