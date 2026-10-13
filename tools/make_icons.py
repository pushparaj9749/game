#!/usr/bin/env python3
"""Generate the legacy (pre-API-26) launcher icon PNGs for Rickshaw Rush.

Adaptive icons in res/mipmap-anydpi-v26 only resolve on API 26+, so devices on
minSdk 24/25 still need real bitmaps in res/mipmap-<dpi>/. This script draws the
same front-on auto-rickshaw as res/drawable/ic_launcher_foreground.xml at 8x and
downscales with LANCZOS, which gives clean anti-aliasing without any design tool.

Usage:  python3 tools/make_icons.py
Deps:   pip install Pillow
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app", "src", "main", "res")

# Launcher icon sizes per density bucket (square, legacy style).
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

SS = 8  # supersampling factor

BG = (18, 58, 46, 255)          # deep teal, matches ic_launcher_background
BODY_DARK = (185, 148, 0, 255)
BODY = (232, 194, 26, 255)
ROOF_DARK = (20, 80, 44, 255)
ROOF = (30, 107, 60, 255)
GLASS = (159, 216, 234, 255)
GLASS_HI = (214, 241, 250, 255)
LIGHT = (255, 243, 176, 255)
DARK = (21, 23, 28, 255)
GRILLE = (58, 63, 73, 255)
SHADOW = (13, 15, 20, 255)


def rrect(d, box, radius, fill):
    d.rounded_rectangle(box, radius=radius, fill=fill)


def circle(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def draw_master(size):
    """Draw the icon into a size x size RGBA image (call with size*SS)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 108.0  # the vector artwork is authored on a 108dp grid

    def U(v):
        return v * u

    # Background: squircle. Legacy icons are usually full-bleed with rounding.
    rrect(d, [0, 0, size - 1, size - 1], U(22), BG)

    # Road shadow
    rrect(d, [U(28), U(84), U(80), U(92)], U(4), SHADOW)

    # Wheels
    rrect(d, [U(30), U(72), U(38), U(86)], U(2), DARK)
    rrect(d, [U(70), U(72), U(78), U(86)], U(2), DARK)

    # Body
    rrect(d, [U(24), U(44), U(84), U(82)], U(6), BODY_DARK)
    rrect(d, [U(27), U(46), U(81), U(75)], U(5), BODY)

    # Canopy
    rrect(d, [U(20), U(30), U(88), U(46)], U(8), ROOF_DARK)
    rrect(d, [U(23), U(32), U(85), U(44)], U(7), ROOF)

    # Windshield
    rrect(d, [U(35), U(48), U(73), U(63)], U(3), GLASS)
    rrect(d, [U(36), U(49), U(72), U(54)], U(2), GLASS_HI)

    # Headlights
    circle(d, U(36), U(66), U(4.5), LIGHT)
    circle(d, U(72), U(66), U(4.5), LIGHT)

    # Grille
    rrect(d, [U(46), U(66), U(62), U(73)], U(1.5), GRILLE)

    # Mirrors
    rrect(d, [U(20), U(50), U(26), U(54)], U(1.5), DARK)
    rrect(d, [U(82), U(50), U(88), U(54)], U(1.5), DARK)

    # Subtle top-light sheen
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.ellipse([U(10), U(-30), U(98), U(50)], fill=(255, 255, 255, 26))
    img = Image.alpha_composite(img, sheen)
    return img


def main():
    master = draw_master(SIZES["xxxhdpi"] * SS)
    for dpi, px in SIZES.items():
        out_dir = os.path.join(RES, "mipmap-" + dpi)
        os.makedirs(out_dir, exist_ok=True)
        icon = master.resize((px, px), Image.LANCZOS)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            target = os.path.join(out_dir, name)
            if name.endswith("_round.png"):
                # Punch a circular alpha mask for the round variant.
                mask = Image.new("L", (px * SS, px * SS), 0)
                ImageDraw.Draw(mask).ellipse([0, 0, px * SS - 1, px * SS - 1], fill=255)
                mask = mask.resize((px, px), Image.LANCZOS)
                icon.putalpha(mask)
            icon.save(target, "PNG", optimize=True)
            print("wrote %-56s %dx%d  %d bytes"
                  % (os.path.relpath(target, ROOT), px, px, os.path.getsize(target)))


if __name__ == "__main__":
    main()
