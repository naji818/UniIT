#!/usr/bin/env python3
"""Generate script/narration.srt — a subtitle track matching the timed narration.

Long lines are split across two subtitle rows so they stay readable at 16:9.
"""

from __future__ import annotations

import os

from timeline_lib import ROOT, SENTENCE_PAUSE, WORDS_PER_SECOND, load

MIN_LINE_SECONDS = 1.5
LEAD_IN = 0.15    # caption appears just before the word lands
LEAD_OUT = 0.35   # and holds just past it
MAX_CHARS = 42    # per subtitle row


def srt_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int(seconds // 60) % 60
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        ms, s = 0, s + 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def wrap_rows(text: str) -> list[str]:
    """Greedily wrap a line into rows of at most MAX_CHARS."""
    rows, cur = [], ""
    for word in text.split():
        candidate = f"{cur} {word}".strip()
        if len(candidate) > MAX_CHARS and cur:
            rows.append(cur)
            cur = word
        else:
            cur = candidate
    if cur:
        rows.append(cur)
    return rows


def balance(rows: list[str]) -> list[str]:
    """Even out a two-row caption so one row isn't a stub."""
    if len(rows) != 2:
        return rows
    words = " ".join(rows).split()
    best, best_diff = rows, None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if len(a) > MAX_CHARS or len(b) > MAX_CHARS:
            continue
        diff = abs(len(a) - len(b))
        if best_diff is None or diff < best_diff:
            best, best_diff = [a, b], diff
    return best


def captions_for(line: str, start: float, dur: float) -> list[tuple]:
    """Split one narration line into readable captions of at most two rows."""
    rows = wrap_rows(line)
    groups = [rows[i:i + 2] for i in range(0, len(rows), 2)]
    total = sum(len(" ".join(gp)) for gp in groups)

    out, clock = [], start
    for gp in groups:
        share = dur * len(" ".join(gp)) / total
        out.append((clock, clock + share, "\n".join(balance(gp))))
        clock += share
    return out


def main() -> None:
    _, scenes = load()

    entries = []
    for scene in scenes:
        clock = scene.start
        for line in scene.vo:
            dur = max(len(line.split()) / WORDS_PER_SECOND, MIN_LINE_SECONDS)
            parts = captions_for(line, clock, dur)
            for i, (cs, ce, text) in enumerate(parts):
                lead_in = LEAD_IN if i == 0 else 0.0
                lead_out = LEAD_OUT if i == len(parts) - 1 else 0.0
                entries.append((cs - lead_in, ce + lead_out, text))
            clock += dur + SENTENCE_PAUSE

    # Never let one caption overlap the next.
    for i in range(len(entries) - 1):
        start, end, text = entries[i]
        entries[i] = (start, min(end, entries[i + 1][0] - 0.04), text)

    out = os.path.join(ROOT, "script", "narration.srt")
    with open(out, "w") as fh:
        for i, (start, end, text) in enumerate(entries, 1):
            fh.write(f"{i}\n{srt_time(max(0, start))} --> {srt_time(end)}\n"
                     f"{text}\n\n")

    print(f"wrote script/narration.srt — {len(entries)} captions")


if __name__ == "__main__":
    main()
