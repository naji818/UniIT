#!/usr/bin/env python3
"""Generate the YouTube description with chapter markers from timeline.json.

Chapter timings come from the cut, so they stay correct if the edit changes.
YouTube requires the first chapter at 0:00, at least three chapters, and a
minimum of 10 seconds each — all of which this checks before writing.
"""

from __future__ import annotations

import os

from timeline_lib import ROOT, load

# Human-facing chapter titles, keyed by scene id. Scene names in timeline.json
# are production labels; these are written for a viewer browsing the video.
CHAPTER_TITLES = {
    "OPEN": "Introduction",
    "S1": "Your first day",
    "S2": "What your degree gives you",
    "S3": "Technology does not wait for the syllabus",
    "S4": "Java to Python — why concepts transfer",
    "S5": "How web development keeps evolving",
    "S6": "AI is a family of technologies",
    "S7": "Why mathematics and statistics matter",
    "S8": "Theory and application together",
    "S9": "What the industry actually asks for",
    "S10": "Using AI without cheating yourself",
    "S11": "Build your portfolio from year one",
    "S12": "The speed of technology",
    "S13": "Quantum computing",
    "FINAL": "The message to you",
    "END": "Computer Science is a lifelong journey",
}

DESCRIPTION = """\
You have entered university to study Computer Science. You may be excited. You \
may believe the next three or four years will teach you everything you need to \
become a software engineer.

There is something worth understanding from day one: Computer Science is one of \
the fastest-changing fields in the world, and your degree is not the finish \
line. It is the starting point.

This film follows a first-year Sri Lankan undergraduate from their first day on \
campus to the moment they graduate into a landscape that has already moved. It \
is not a warning against university — the foundations a degree gives you are \
genuinely valuable. It is about what you build on top of them.

What it covers:

• Why programming fundamentals outlast any single language — and why Java still \
matters even as Python grows
• How web development, cloud and AI keep reshaping what "modern" means
• Why mathematics, statistics and probability become powerful once you want to \
understand AI rather than only use it
• The difference between passing an examination and being able to solve a real \
problem
• Using AI honestly: as a tutor, reviewer and assistant — never as a substitute \
for understanding what you submit
• Building a portfolio from year one instead of year four
• Quantum computing, and why it is worth watching without overclaiming

The most important thing you learn at university may not be a programming \
language. It may be the ability to adapt.

Made for students beginning a Computer Science degree — in Sri Lanka and \
anywhere else.
"""

TAGS = [
    "computer science", "computer science degree", "university", "sri lanka",
    "software engineering", "learn to code", "programming", "artificial intelligence",
    "machine learning", "data science", "career advice", "students",
    "python", "java", "web development", "cloud computing", "quantum computing",
    "study tips", "first year university", "tech career",
]


def ts(seconds: float) -> str:
    """YouTube chapter timestamp. Chapters must floor, never round up, or the
    marker can land past the cut it labels."""
    total = int(seconds)
    return f"{total // 60}:{total % 60:02d}"


def main() -> None:
    _, scenes = load()

    chapters = []
    for scene in scenes:
        title = CHAPTER_TITLES.get(scene.id, scene.name.title())
        chapters.append((scene.start, scene.dur, f"{ts(scene.start)} {title}"))

    # Validate against YouTube's chapter rules before writing anything.
    problems = []
    if not chapters or chapters[0][0] != 0:
        problems.append("first chapter must start at 0:00")
    if len(chapters) < 3:
        problems.append("need at least 3 chapters")
    for start, dur, line in chapters:
        if dur < 10:
            problems.append(f"chapter under 10s: {line} ({dur:.1f}s)")
    if problems:
        raise SystemExit("Chapter validation failed:\n  " + "\n  ".join(problems))

    body = [
        DESCRIPTION,
        "",
        "── CHAPTERS ──",
        "",
        *[line for _, _, line in chapters],
        "",
        "── ABOUT ──",
        "",
        "Runtime 7:54. Written and produced independently.",
        "",
        "#ComputerScience #University #SriLanka #Programming #AI #CareerAdvice",
    ]

    out_dir = os.path.join(ROOT, "deliverables", "youtube")
    os.makedirs(out_dir, exist_ok=True)

    desc_path = os.path.join(out_dir, "description.txt")
    with open(desc_path, "w") as fh:
        fh.write("\n".join(body))

    tags_path = os.path.join(out_dir, "tags.txt")
    with open(tags_path, "w") as fh:
        fh.write(", ".join(TAGS))

    chars = len("\n".join(body))
    tag_chars = len(", ".join(TAGS))
    print(f"description.txt  {chars} chars"
          f"{'  <-- OVER 5000 LIMIT' if chars > 5000 else ''}")
    print(f"tags.txt         {tag_chars} chars"
          f"{'  <-- OVER 500 LIMIT' if tag_chars > 500 else ''}")
    print(f"chapters         {len(chapters)}")


if __name__ == "__main__":
    main()
