#!/usr/bin/env python3
"""Render YouTube thumbnail variants to deliverables/thumbnails/."""

from __future__ import annotations

import base64
import os

from playwright.sync_api import sync_playwright

from timeline_lib import ROOT

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PAGE = "file://" + os.path.join(ROOT, "youtube", "thumbnail.html")
VARIANTS = ["a", "b", "c"]


def main() -> None:
    out = os.path.join(ROOT, "deliverables", "thumbnails")
    os.makedirs(out, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=CHROME, args=["--no-sandbox", "--disable-gpu"]
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(PAGE)
        page.wait_for_function("window.__ready === true", timeout=20000)

        for v in VARIANTS:
            url = page.evaluate(
                """(v) => {
                     draw(v);
                     return document.getElementById('t').toDataURL('image/png');
                   }""",
                v,
            )
            path = os.path.join(out, f"thumbnail-{v}.png")
            with open(path, "wb") as fh:
                fh.write(base64.b64decode(url.split(",", 1)[1]))
            kb = os.path.getsize(path) / 1024
            # YouTube rejects thumbnails over 2 MB.
            print(f"thumbnail-{v}.png  {kb:.0f} KB{'  <-- OVER 2MB' if kb > 2048 else ''}")

        browser.close()

    if errors:
        raise SystemExit("JS errors:\n  " + "\n  ".join(sorted(set(errors))))


if __name__ == "__main__":
    main()
