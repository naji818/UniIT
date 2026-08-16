"""Shared loader and timing model for the production timeline.

Every generated artefact (narration script, shot list, prompt sheet, animatic)
derives from production/timeline.json so the documents can never drift apart.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMELINE_PATH = os.path.join(ROOT, "production", "timeline.json")

# Narration pacing model. A professional educational read sits around 140 wpm,
# and each sentence carries a short landing pause before the next one starts.
WORDS_PER_SECOND = 140 / 60.0
SENTENCE_PAUSE = 0.55
# Very short lines ("Statistics matters.") are delivered slower than their word
# count implies, so they get a floor rather than a proportional duration.
MIN_LINE_SECONDS = 1.5


@dataclass
class Shot:
    id: str
    dur: float
    camera: str
    action: str
    prompt: str
    onscreen: list = field(default_factory=list)
    note: str = ""
    start: float = 0.0

    @property
    def end(self) -> float:
        return self.start + self.dur


@dataclass
class Scene:
    id: str
    name: str
    act: str
    intent: str
    vo: list
    shots: list
    start: float = 0.0

    @property
    def dur(self) -> float:
        return sum(s.dur for s in self.shots)

    @property
    def end(self) -> float:
        return self.start + self.dur

    @property
    def vo_words(self) -> int:
        return sum(len(line.split()) for line in self.vo)

    @property
    def vo_seconds(self) -> float:
        """Estimated spoken duration including inter-sentence pauses."""
        total = 0.0
        for line in self.vo:
            total += max(len(line.split()) / WORDS_PER_SECOND, MIN_LINE_SECONDS)
            total += SENTENCE_PAUSE
        return total

    @property
    def headroom(self) -> float:
        """Picture time minus narration time. Negative means the read is rushed."""
        return self.dur - self.vo_seconds


def load(path: str = TIMELINE_PATH):
    with open(path) as fh:
        data = json.load(fh)

    scenes = []
    clock = 0.0
    for raw_scene in data["scenes"]:
        scene = Scene(
            id=raw_scene["id"],
            name=raw_scene["name"],
            act=raw_scene["act"],
            intent=raw_scene.get("intent", ""),
            vo=raw_scene.get("vo", []),
            shots=[],
            start=clock,
        )
        for raw_shot in raw_scene["shots"]:
            shot = Shot(
                id=raw_shot["id"],
                dur=float(raw_shot["dur"]),
                camera=raw_shot.get("camera", ""),
                action=raw_shot.get("action", ""),
                prompt=raw_shot.get("prompt", ""),
                onscreen=raw_shot.get("onscreen", []),
                note=raw_shot.get("note", ""),
                start=clock,
            )
            scene.shots.append(shot)
            clock += shot.dur
        scenes.append(scene)

    return data, scenes


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    return f"{minutes:02d}:{seconds % 60:05.2f}"


def all_shots(scenes):
    return [shot for scene in scenes for shot in scene.shots]
