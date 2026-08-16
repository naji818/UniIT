#!/usr/bin/env python3
"""Render the animatic to MP4.

Drives animatic/index.html frame by frame in headless Chromium and pipes each
JPEG straight into ffmpeg's stdin, so no intermediate frames ever hit disk.

  python3 render_animatic.py                 # full cut -> build/animatic.mp4
  python3 render_animatic.py --probe         # sample stills -> build/probe/
  python3 render_animatic.py --start 60 --end 90
"""

from __future__ import annotations

import argparse
import base64
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

from timeline_lib import ROOT, load

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PAGE = "file://" + os.path.join(ROOT, "animatic", "index.html") + "?static=1"


def ffmpeg_bin() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def new_page(pw):
    browser = pw.chromium.launch(
        executable_path=CHROME,
        args=["--no-sandbox", "--disable-gpu", "--hide-scrollbars",
              "--force-device-scale-factor=1"],
    )
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE)
    page.wait_for_function("window.__ready === true", timeout=20000)
    if errors:
        raise SystemExit("JS error on load:\n  " + "\n  ".join(errors))
    return browser, page, errors


def grab(page, t: float, quality: int, hud: bool) -> bytes:
    url = page.evaluate(
        """([t, hud, q]) => {
             renderAt(t, { hud });
             return document.getElementById('stage').toDataURL('image/jpeg', q);
           }""",
        [t, hud, quality / 100],
    )
    return base64.b64decode(url.split(",", 1)[1])


def probe(args) -> int:
    """Render one still per shot so the look of every module can be checked."""
    _, scenes = load()
    out = os.path.join(ROOT, "build", "probe")
    os.makedirs(out, exist_ok=True)
    with sync_playwright() as pw:
        browser, page, errors = new_page(pw)
        for scene in scenes:
            for shot in scene.shots:
                t = shot.start + shot.dur * 0.55
                with open(os.path.join(out, f"{shot.id}.jpg"), "wb") as fh:
                    fh.write(grab(page, t, 90, args.hud))
        browser.close()
    if errors:
        print("JS errors during probe:\n  " + "\n  ".join(sorted(set(errors))))
        return 1
    print(f"wrote stills for every shot to build/probe/")
    return 0


def render(args) -> int:
    data, scenes = load()
    runtime = sum(s.dur for s in scenes)
    start, end = args.start, args.end if args.end is not None else runtime
    frames = int(round((end - start) * args.fps))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    cmd = [
        ffmpeg_bin(), "-y",
        "-f", "image2pipe", "-vcodec", "mjpeg", "-r", str(args.fps), "-i", "-",
        "-an",
        "-vcodec", "libx264", "-pix_fmt", "yuv420p",
        "-preset", args.preset, "-crf", str(args.crf),
        "-movflags", "+faststart",
        "-r", str(args.fps),
        args.out,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    t0 = time.time()
    with sync_playwright() as pw:
        browser, page, errors = new_page(pw)
        try:
            for i in range(frames):
                t = start + i / args.fps
                proc.stdin.write(grab(page, t, args.quality, args.hud))
                if i % 200 == 0 and i:
                    el = time.time() - t0
                    eta = el / i * (frames - i)
                    print(f"  {i}/{frames} frames  {i / frames * 100:4.1f}%  "
                          f"{i / el:4.1f} fps  eta {eta / 60:.1f} min", flush=True)
        finally:
            proc.stdin.close()
            browser.close()
    proc.wait()

    if errors:
        print("JS errors during render:\n  " + "\n  ".join(sorted(set(errors))))
        return 1
    size = os.path.getsize(args.out) / 1e6
    print(f"\n{args.out} — {frames} frames, {(end - start):.1f}s, {size:.1f} MB, "
          f"rendered in {(time.time() - t0) / 60:.1f} min")
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(ROOT, "build", "animatic.mp4"))
    p.add_argument("--fps", type=int, default=24)
    p.add_argument("--crf", type=int, default=20)
    p.add_argument("--preset", default="veryfast")
    p.add_argument("--quality", type=int, default=88, help="intermediate JPEG quality")
    p.add_argument("--start", type=float, default=0.0)
    p.add_argument("--end", type=float, default=None)
    p.add_argument("--hud", action="store_true", help="burn in shot id and timecode")
    p.add_argument("--probe", action="store_true", help="stills only, one per shot")
    args = p.parse_args()
    return probe(args) if args.probe else render(args)


if __name__ == "__main__":
    sys.exit(main())
