"""asset-prep-backgrounds.py — D3 asset prep for ADR-047 background system.

Downscales and converts scene photos + precipitation overlays to WebP at
<= 300 KB each, ~2560px longest edge.  Outputs to:
  <dashboard>/src/assets/backgrounds/

Sources (read-only — do NOT modify):
  Graphics/Backgrounds/  (relative to the meta repo root)
  weewx-clearskies-stack/weewx_clearskies_config/static/sky.jpg

Run from any directory; paths are resolved relative to this script's location.

Usage:
    python scripts/asset-prep-backgrounds.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from PIL import Image

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
DASHBOARD_ROOT = SCRIPT_DIR.parent  # repos/weewx-clearskies-dashboard
REPO_ROOT = DASHBOARD_ROOT.parent.parent  # weather-belchertown (meta repo root)

SRC_BG = REPO_ROOT / "Graphics" / "Backgrounds"
SRC_STACK_SKY = REPO_ROOT / "repos" / "weewx-clearskies-stack" / "weewx_clearskies_config" / "static" / "sky.jpg"
DST_DIR = DASHBOARD_ROOT / "src" / "assets" / "backgrounds"
DST_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Asset manifest
#
# Each entry:
#   src  — Path to the source file (absolute)
#   dst  — Output filename (WebP) in DST_DIR
#   keep_alpha — True for the frost cutout (snow overlay) which has transparency
#
# All 6 scene photos + 2 overlays from ADR-047 §Decision / implementation notes.
# ---------------------------------------------------------------------------

ASSETS: list[dict] = [
    # ── scene photos (no transparency needed) ────────────────────────────
    {
        "src": SRC_STACK_SKY,
        "dst": "scene-clear-day.webp",
        "keep_alpha": False,
    },
    {
        "src": SRC_BG / "clear_night_nathan_anderson.jpg",
        "dst": "scene-clear-night.webp",
        "keep_alpha": False,
    },
    {
        "src": SRC_BG / "cloudy_day_Davies_Design_Studio.jpg",
        "dst": "scene-cloudy-day.webp",
        "keep_alpha": False,
    },
    {
        "src": SRC_BG / "cloudy_night_ben-mathis-seibel.jpg",
        "dst": "scene-cloudy-night.webp",
        "keep_alpha": False,
    },
    {
        "src": SRC_BG / "storm_day_Raychel_Sanner.jpg",
        "dst": "scene-storm-day.webp",
        "keep_alpha": False,
    },
    {
        "src": SRC_BG / "storm_night_felix-mittermeier.jpg",
        "dst": "scene-storm-night.webp",
        "keep_alpha": False,
    },
    # ── overlays ──────────────────────────────────────────────────────────
    {
        "src": SRC_BG / "rain_on_glass.jpg",
        "dst": "overlay-rain.webp",
        "keep_alpha": False,
    },
    {
        # The operator's 16 MB frost cutout is 4032x3024 RGBA.  At 2560px+q40 it
        # is still ~2 MB because the fine frost crystal alpha channel is
        # incompressible at that resolution.  Scale to 1280px longest edge —
        # the overlay is blended at 0.25-0.75 opacity over a blurred scene
        # photo, so the sub-pixel crystal detail is perceptually irrelevant.
        # 1280px covers any viewport when background-size:cover scales it up.
        "src": SRC_BG / "snow_on_glass_transparent.png",
        "dst": "overlay-snow.webp",
        "keep_alpha": True,   # frost cutout — preserve transparency via screen blend
        "max_long_edge": 800,    # override: frost alpha channel is ~incompressible; 800px
                                # at screen-blend/partial-opacity is perceptually fine
    },
]

# ---------------------------------------------------------------------------
# Compression strategy
#
# Target: <= 300 KB each, ~2560px longest edge.
# Strategy: resize first, then iteratively lower WebP quality from the
# starting value (90) until the file fits within the budget.
# The snow overlay PNG is 16 MB — it needs the tightest squeeze.
# ---------------------------------------------------------------------------

MAX_LONG_EDGE = 2560
BUDGET_BYTES = 300 * 1024  # 300 KB
QUALITY_START = 90
QUALITY_FLOOR = 40   # lower floor for the transparent frost overlay which is large


def resize_to_fit(img: Image.Image, max_long_edge: int) -> Image.Image:
    """Resize img so its longest dimension does not exceed max_long_edge.
    Aspect ratio is preserved.  Returns the original if already within budget.
    """
    w, h = img.size
    long_edge = max(w, h)
    if long_edge <= max_long_edge:
        return img
    scale = max_long_edge / long_edge
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))
    return img.resize((new_w, new_h), Image.LANCZOS)


def compress_to_budget(
    img: Image.Image,
    dst_path: Path,
    keep_alpha: bool,
) -> tuple[int, int]:
    """Save img as WebP, iterating quality down until <= BUDGET_BYTES.

    Returns (final_quality, final_size_bytes).
    Raises RuntimeError if budget can't be met above QUALITY_FLOOR.
    """
    if keep_alpha:
        # Preserve RGBA for the frost overlay (screen blend needs transparency).
        if img.mode not in ("RGBA", "LA"):
            img = img.convert("RGBA")
    else:
        # Strip alpha for scene photos — saves ~20% on file size.
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

    quality = QUALITY_START
    while quality >= QUALITY_FLOOR:
        img.save(dst_path, format="WEBP", quality=quality, method=6)
        size = dst_path.stat().st_size
        if size <= BUDGET_BYTES:
            return quality, size
        quality -= 5

    # Last attempt at floor quality
    img.save(dst_path, format="WEBP", quality=QUALITY_FLOOR, method=6)
    size = dst_path.stat().st_size
    if size > BUDGET_BYTES:
        raise RuntimeError(
            "{}: could not reach {} KB budget (got {} KB at quality={}). "
            "Try a lower max_long_edge or reduce QUALITY_FLOOR.".format(
                dst_path.name, BUDGET_BYTES // 1024, size // 1024, QUALITY_FLOOR
            )
        )
    return QUALITY_FLOOR, size


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    errors: list[str] = []
    results: list[tuple[str, int, int, int]] = []  # dst, width, height, bytes

    print("Source backgrounds: {}".format(SRC_BG))
    print("Source sky.jpg:     {}".format(SRC_STACK_SKY))
    print("Output dir:         {}".format(DST_DIR))
    print()

    for asset in ASSETS:
        src: Path = asset["src"]
        dst: Path = DST_DIR / asset["dst"]
        keep_alpha: bool = asset["keep_alpha"]

        if not src.exists():
            msg = f"MISSING SOURCE: {src}"
            print(f"  ERROR  {msg}")
            errors.append(msg)
            continue

        try:
            img = Image.open(src)
            orig_w, orig_h = img.size
            long_edge = asset.get("max_long_edge", MAX_LONG_EDGE)
            img = resize_to_fit(img, long_edge)
            quality, size = compress_to_budget(img, dst, keep_alpha)
            results.append((asset["dst"], img.width, img.height, size))
            kb = size / 1024
            status = "OK   " if size <= BUDGET_BYTES else "OVER "
            print(
                "  {} {:<32} {}x{} -> {}x{}  q={}  {:.1f} KB".format(
                    status, asset["dst"], orig_w, orig_h, img.width, img.height, quality, kb
                )
            )
        except Exception as exc:  # noqa: BLE001
            msg = f"{asset['dst']}: {exc}"
            print(f"  ERROR  {msg}")
            errors.append(msg)

    print()
    print("-- Summary --------------------------------------------------")
    total = sum(r[3] for r in results)
    for name, w, h, size in results:
        over = " <-- OVER BUDGET" if size > BUDGET_BYTES else ""
        print("  {:<36} {:>4} KB{}".format(name, size // 1024, over))
    print("  {:<36} {:>4} KB".format("Total (all assets):", total // 1024))

    if errors:
        print()
        print("ERRORS:")
        for e in errors:
            print("  - {}".format(e))
        return 1

    over_budget = [r for r in results if r[3] > BUDGET_BYTES]
    if over_budget:
        print()
        print("BUDGET FAILURES (assets exceed 300 KB):")
        for name, _, _, size in over_budget:
            print("  - {}: {} KB".format(name, size // 1024))
        return 1

    print()
    print("All assets within budget.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
