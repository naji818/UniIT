#!/usr/bin/env python3
"""Report runtime and per-scene narration headroom.

Exit code is non-zero if the cut falls outside the 6-8 minute brief or if any
scene does not leave enough picture time for its narration.
"""

from __future__ import annotations

import sys

from timeline_lib import all_shots, load, timecode

MIN_RUNTIME = 360.0  # 6:00
MAX_RUNTIME = 480.0  # 8:00


def main() -> int:
    data, scenes = load()
    shots = all_shots(scenes)
    runtime = sum(s.dur for s in shots)

    print(f"{data['title']}\n")
    print(f"{'SCENE':<6} {'START':>8} {'DUR':>7} {'SHOTS':>6} {'WORDS':>6} {'VO':>7} {'SLACK':>7}")
    print("-" * 56)

    tight = []
    for scene in scenes:
        flag = ""
        if scene.vo and scene.headroom < 0:
            flag = "  <-- RUSHED"
            tight.append(scene)
        print(
            f"{scene.id:<6} {timecode(scene.start):>8} {scene.dur:>6.1f}s "
            f"{len(scene.shots):>6} {scene.vo_words:>6} "
            f"{scene.vo_seconds:>6.1f}s {scene.headroom:>6.1f}s{flag}"
        )

    words = sum(s.vo_words for s in scenes)
    speaking = sum(s.vo_seconds for s in scenes)
    print("-" * 56)
    print(f"{'TOTAL':<6} {'':>8} {runtime:>6.1f}s {len(shots):>6} {words:>6} {speaking:>6.1f}s")
    print()
    print(f"Runtime          : {timecode(runtime)}  ({runtime:.0f}s)")
    print(f"Shots            : {len(shots)}  (mean {runtime / len(shots):.1f}s)")
    print(f"Narration words  : {words}")
    print(f"Speaking density : {speaking / runtime * 100:.0f}% of runtime")

    ok = True
    if not MIN_RUNTIME <= runtime <= MAX_RUNTIME:
        print(f"\nFAIL: runtime outside the 6:00-8:00 brief.")
        ok = False
    if tight:
        print(f"\nFAIL: narration does not fit in {', '.join(s.id for s in tight)}.")
        ok = False
    if ok:
        print("\nPASS: runtime within brief and every scene fits its narration.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
