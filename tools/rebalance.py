#!/usr/bin/env python3
"""Rebalance shot durations so every scene fits its narration plus breathing room.

The narration is fixed (it is the client's script), so picture time is the
variable. Each scene gets its estimated speaking time plus a breathing margin,
then that target is distributed across the scene's shots in proportion to their
existing durations, snapped to 0.5s and reconciled so the sum is exact.
"""

from __future__ import annotations

import json

from timeline_lib import SENTENCE_PAUSE, TIMELINE_PATH, WORDS_PER_SECOND, load

BREATHING = 2.5      # seconds of picture beyond the narration, per scene
MIN_SHOT = 4.0
MAX_SHOT = 9.0
STEP = 0.5

# Scenes with no narration are paced by feel, not by the model.
SILENT_TARGETS = {"OPEN": 11.0, "END": 11.0}


def distribute(target: float, weights: list[float]) -> list[float]:
    """Split `target` across len(weights) shots, snapped to STEP, summing exactly."""
    total_weight = sum(weights)
    raw = [target * w / total_weight for w in weights]
    clamped = [min(MAX_SHOT, max(MIN_SHOT, r)) for r in raw]

    # Snap to the grid, then push the rounding error onto the shots that can
    # absorb it without breaching the min/max shot bounds.
    snapped = [round(c / STEP) * STEP for c in clamped]
    drift = round((target - sum(snapped)) / STEP)

    order = sorted(range(len(snapped)), key=lambda i: -snapped[i])
    while drift != 0:
        moved = False
        for i in order if drift < 0 else reversed(order):
            candidate = snapped[i] + (STEP if drift > 0 else -STEP)
            if MIN_SHOT <= candidate <= MAX_SHOT:
                snapped[i] = candidate
                drift += -1 if drift > 0 else 1
                moved = True
                if drift == 0:
                    break
        if not moved:  # every shot is at a bound; accept the residual
            break
    return snapped


def main() -> None:
    data, scenes = load()
    by_id = {s.id: s for s in scenes}

    for raw_scene in data["scenes"]:
        scene = by_id[raw_scene["id"]]
        if scene.id in SILENT_TARGETS:
            target = SILENT_TARGETS[scene.id]
        else:
            target = scene.vo_seconds + BREATHING
            target = round(target / STEP) * STEP

        weights = [s.dur for s in scene.shots]
        for raw_shot, dur in zip(raw_scene["shots"], distribute(target, weights)):
            raw_shot["dur"] = dur

        actual = sum(s["dur"] for s in raw_scene["shots"])
        print(f"{scene.id:<6} vo {scene.vo_seconds:>5.1f}s  ->  picture {actual:>5.1f}s")

    with open(TIMELINE_PATH, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    runtime = sum(sh["dur"] for sc in data["scenes"] for sh in sc["shots"])
    print(f"\nRuntime now {int(runtime // 60)}:{runtime % 60:04.1f} ({runtime:.0f}s)")


if __name__ == "__main__":
    main()
