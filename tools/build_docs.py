#!/usr/bin/env python3
"""Generate the narration script, shot list and prompt sheet from timeline.json."""

from __future__ import annotations

import os

from timeline_lib import ROOT, SENTENCE_PAUSE, WORDS_PER_SECOND, all_shots, load, timecode

MIN_LINE_SECONDS = 1.5

BANNER = (
    "<!-- GENERATED FILE - do not edit by hand.\n"
    "     Source: production/timeline.json\n"
    "     Rebuild: python3 tools/build_docs.py -->\n"
)


def vo_cues(scene):
    """Walk the narration lines of a scene, yielding (start, end, text)."""
    clock = scene.start
    for line in scene.vo:
        dur = max(len(line.split()) / WORDS_PER_SECOND, MIN_LINE_SECONDS)
        yield clock, clock + dur, line
        clock += dur + SENTENCE_PAUSE


def write(relpath: str, body: str) -> None:
    path = os.path.join(ROOT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(body)
    print(f"wrote {relpath}")


def build_narration(data, scenes) -> str:
    runtime = sum(s.dur for s in scenes)
    out = [BANNER, f"# Narration Script\n", f"**{data['title']}**\n"]
    out.append(
        f"Runtime `{timecode(runtime)}` · {sum(s.vo_words for s in scenes)} words · "
        f"target delivery {data['meta']['narration_wpm']} wpm\n"
    )
    out.append(f"> **Tone.** {data['meta']['tone']}\n")
    out.append(
        "> **Delivery.** Land a full beat on each line break below — the timings assume "
        "a short pause after every sentence. Timecodes are the target in-points; the "
        "read should never feel rushed to hit them.\n"
    )
    out.append("---\n")

    for scene in scenes:
        out.append(f"## {scene.id} — {scene.name}\n")
        out.append(
            f"`{timecode(scene.start)} – {timecode(scene.end)}` · "
            f"{scene.dur:.1f}s · Act {scene.act}\n"
        )
        if scene.intent:
            out.append(f"*Intent: {scene.intent}*\n")
        if not scene.vo:
            out.append("**No narration.** Music and picture only.\n")
        else:
            out.append("| Timecode | Line |")
            out.append("| --- | --- |")
            for start, end, line in vo_cues(scene):
                out.append(f"| `{timecode(start)}` | {line} |")
            out.append("")
        out.append("")
    return "\n".join(out)


def build_shotlist(data, scenes) -> str:
    shots = all_shots(scenes)
    out = [BANNER, "# Shot List & Storyboard\n", f"**{data['title']}**\n"]
    out.append(
        f"{len(shots)} shots · `{timecode(sum(s.dur for s in shots))}` · "
        f"{data['meta']['format']} · {data['meta']['resolution']} · {data['meta']['fps']} fps\n"
    )

    out.append("## Character continuity\n")
    p = data["protagonist"]
    out.append(f"**{p['name']}** — {p['role']}  ")
    out.append(f"*Referred to as {p['pronouns']}.*\n")
    out.append(f"**Visual anchor (use verbatim in every prompt featuring them):**  ")
    out.append(f"> {p['visual_anchor']}\n")
    out.append(f"**Arc:** {p['arc']}\n")

    out.append("## Look by act\n")
    for act, spec in data["style"]["acts"].items():
        out.append(f"### Act {act} — {', '.join(spec['scenes'])}\n")
        out.append(f"{spec['look']}\n")
        out.append(f"`{spec['palette']}`\n")
    out.append("---\n")

    for scene in scenes:
        out.append(f"## {scene.id} — {scene.name}\n")
        out.append(
            f"`{timecode(scene.start)} – {timecode(scene.end)}` · "
            f"{scene.dur:.1f}s · {len(scene.shots)} shots · Act {scene.act}\n"
        )
        if scene.intent:
            out.append(f"*{scene.intent}*\n")
        for shot in scene.shots:
            out.append(f"### `{shot.id}` — {timecode(shot.start)} · {shot.dur:.1f}s\n")
            out.append(f"- **Camera.** {shot.camera}")
            out.append(f"- **Action.** {shot.action}")
            if shot.onscreen:
                items = " · ".join(f"`{t}`" for t in shot.onscreen)
                out.append(f"- **On-screen text.** {items}")
            if shot.note:
                out.append(f"- **⚠ Note.** {shot.note}")
            out.append("")
        out.append("")
    return "\n".join(out)


def build_prompts(data, scenes) -> str:
    """A flat, copy-paste sheet for a text-to-video model."""
    shots = all_shots(scenes)
    out = [BANNER, "# Generation Prompt Sheet\n", f"**{data['title']}**\n"]
    out.append(
        f"{len(shots)} prompts, one per shot, in cut order. Each is self-contained: "
        "style, subject, camera and palette are baked in so shots can be generated "
        "independently and in parallel.\n"
    )
    out.append("## Global negative prompt\n")
    out.append(f"```\n{data['style']['negative']}\n```\n")
    out.append("## Character reference\n")
    out.append(
        "Generate one character sheet first and use it as an image reference on every "
        "shot featuring the student, otherwise the face will drift between shots.\n"
    )
    out.append(f"```\n{data['protagonist']['visual_anchor']}\n```\n")
    out.append("---\n")

    for scene in scenes:
        out.append(f"## {scene.id} — {scene.name}\n")
        for shot in scene.shots:
            out.append(f"**`{shot.id}`** · {shot.dur:.1f}s · {timecode(shot.start)}\n")
            out.append(f"```\n{shot.prompt}\n```\n")
    return "\n".join(out)


def main() -> None:
    data, scenes = load()
    write("script/narration.md", build_narration(data, scenes))
    write("script/shot-list.md", build_shotlist(data, scenes))
    write("script/prompt-sheet.md", build_prompts(data, scenes))


if __name__ == "__main__":
    main()
