"""Re-cut the 7 pressed-overlay sprites for the on-screen Ulanzi D100H dial.

Each button is cut along its REAL outline so the white "pressed" overlay matches
the physical button 1:1 (top 3 = the rounded button rectangles following their
seams; the 4 side tabs = the actual protruding tab silhouettes).

Pipeline (per button):
  1. Background knockout: flood-fill the white studio background from the image
     edges to transparent, then drop any remaining near-white pixel by luminance,
     and soft-blur the alpha edge ~1px -> the device alpha is the true silhouette.
  2. Mask = a measured corner POLYGON (from a brightened pixel grid) intersected
     with the device alpha, so edges follow the real device and inter-button gaps
     stay out.
  3. Pressed sprite = the button's own pixels, inverted + brightness 1.18 +
     contrast 1.10, masked to that polygon, on a full transparent canvas at the
     shared crop size -> overlays the base exactly 1:1 and lights up the button.

The base public/ulanzi-dial.png and public/ulanzi-knob.png are kept as-is; this
only rewrites public/dial/white-1.png .. white-7.png at the SAME crop box.

Run:  python scripts/dial_cut.py   (Pillow + numpy)
"""
from collections import deque
import os

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "raw", "ulanzi-dial-front.jpg")
OUT = os.path.join(ROOT, "public", "dial")

# Crop box in the 800x800 source that produced the existing 528x583 base
# (recovered by correlating the source device mask against public/ulanzi-dial.png).
CROP = (136, 109, 664, 692)
CW, CH = CROP[2] - CROP[0], CROP[3] - CROP[1]

# Real button corner polygons in cropped (528x583) coords. Tabs extend a little
# past the device edge and top buttons extend above y=0 so the device alpha clips
# them to the true rounded/protruding silhouette.
# 1=bottom-left tab 2=upper-left tab 3=top-left 4=top-mid 5=top-right
# 6=upper-right tab 7=lower-right tab
POLYS = {
    "1": [(-4, 302), (20, 302), (20, 428), (-4, 428)],
    "2": [(-4, 164), (20, 164), (20, 291), (-4, 291)],
    "3": [(8, -6), (163, -6), (163, 128), (9, 127)],
    "4": [(167, -6), (338, -6), (338, 127), (167, 128)],
    "5": [(342, -6), (520, -6), (519, 127), (342, 127)],
    "6": [(508, 164), (532, 164), (532, 291), (508, 291)],
    "7": [(508, 302), (532, 302), (532, 436), (508, 436)],
}


def cropped_rgb():
    return Image.open(SRC).convert("RGB").crop(CROP)


def device_alpha(thresh=42, lum_white=210):
    """True device silhouette: flood-fill the white bg from the edges, then drop
    any remaining near-white pixel. Returns (rgb_image, alpha_uint8)."""
    im = cropped_rgb()
    arr = np.array(im).astype(int)
    w, h = im.size
    corners = np.array([arr[0, 0], arr[0, w - 1], arr[h - 1, 0], arr[h - 1, w - 1]])
    ref = corners.mean(axis=0)

    visited = np.zeros((h, w), dtype=bool)
    bg = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        dq.append((x, 0))
        dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y))
        dq.append((w - 1, y))
    while dq:
        x, y = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y, x]:
            continue
        visited[y, x] = True
        if np.abs(arr[y, x] - ref).max() <= thresh:
            bg[y, x] = True
            dq.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    light = arr.mean(axis=2) >= lum_white
    alpha[light & (~bg)] = 0  # drop any white halo the flood-fill missed
    return im, alpha


def poly_mask(poly):
    m = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.array(m) > 0


def main():
    im, alpha = device_alpha()
    alpha_soft = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1)))
    sil = alpha > 40

    inv = ImageOps.invert(im)
    inv = ImageEnhance.Brightness(inv).enhance(1.18)
    inv = ImageEnhance.Contrast(inv).enhance(1.10)
    inv_arr = np.array(inv)

    os.makedirs(OUT, exist_ok=True)
    for f, poly in POLYS.items():
        pm = poly_mask(poly) & sil
        spr_alpha = np.where(pm, alpha_soft, 0).astype(np.uint8)
        rgb = inv_arr.copy()
        rgb[~pm] = 0  # zero transparent RGB -> small PNG, no stray color
        Image.fromarray(np.dstack([rgb, spr_alpha]), "RGBA").save(
            os.path.join(OUT, f"white-{f}.png")
        )
        print(f"white-{f}.png  px={int(pm.sum())}")


if __name__ == "__main__":
    main()
