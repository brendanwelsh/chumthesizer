"""Build the Stream Deck Pedal splice assets:
  - public/pedal/base.png       (bg + shadow fully removed, cropped tight)
  - public/pedal/white-0..2.png (pressed PRESSED sprite per pedal: its OWN pixels inverted +
                                 brightened, masked to the real top-face polygon ∩ device alpha)
All outputs share the SAME crop box so they overlay the base 1:1.

Per-pedal pressed sprite = ImageOps.invert(own pixels) -> Brightness 1.18 -> Contrast 1.1,
masked to (polygon ∩ device alpha), composited full-canvas then cropped.
"""
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageEnhance, ImageChops

SRC = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\magic-trackpad-apple.jpg"
OUTDIR = r"C:\Users\brend\Projects\ulanzi-synth\public\pedal"

# ---- crop box (tight to the dark device; soft shadow excluded). (left,top,right,bottom) ----
CROP = (50, 346, 1094, 757)   # width 1044, height 411

# ---- pedal TOP-FACE polygons in ORIGINAL image coords (measured off the grid) ----
POLYS = {
    0: [[100, 406], [310, 376], [310, 656], [86, 666]],    # LEFT
    1: [[343, 356], [806, 356], [862, 660], [316, 660]],   # CENTER
    2: [[840, 390], [1018, 401], [1030, 652], [858, 657]], # RIGHT
}

DARK_CORE = 95

# ===== 1. device alpha (true silhouette, shadow killed) =====
im = Image.open(SRC).convert("RGB")
W, H = im.size
arr = np.asarray(im).astype(np.uint8)
f = arr.astype(np.float32)
lum = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]
core = lum <= DARK_CORE

inbg = np.zeros((H, W), dtype=bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if not core[y, x] and not inbg[y, x]:
            inbg[y, x] = True; dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if not core[y, x] and not inbg[y, x]:
            inbg[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and not inbg[ny, nx] and not core[ny, nx]:
            inbg[ny, nx] = True; dq.append((ny, nx))
device = ~inbg
alpha = np.where(device, 255, 0).astype(np.uint8)
amask = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
alpha_full = amask  # L, full canvas

# ===== base.png = device RGBA, cropped =====
base_rgba = Image.fromarray(np.dstack([arr, np.asarray(alpha_full)]), "RGBA")
base_crop = base_rgba.crop(CROP)
base_crop.save(rf"{OUTDIR}\base.png")
print("base", base_crop.size)

# ===== per-pedal pressed white sprite =====
def poly_mask(poly):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(0.8))  # soft 1px edge
    # intersect with device alpha so edges follow the real device & gaps stay out
    return ImageChops.multiply(m, alpha_full)

rgb_full = Image.fromarray(arr, "RGB")
for idx, poly in POLYS.items():
    # pressed look: invert this pedal's own pixels, then brighten + add contrast
    pressed = ImageOps.invert(rgb_full)
    pressed = ImageEnhance.Brightness(pressed).enhance(1.18)
    pressed = ImageEnhance.Contrast(pressed).enhance(1.1)
    mask = poly_mask(poly)
    sprite_full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sprite_full.paste(pressed, (0, 0), mask)  # mask -> alpha
    sprite = sprite_full.crop(CROP)
    sprite.save(rf"{OUTDIR}\white-{idx}.png")
    # report polygon centroid as % of crop (for label cx)
    cx = sum(p[0] for p in poly) / len(poly)
    cxpct = (cx - CROP[0]) / (CROP[2] - CROP[0]) * 100
    print(f"white-{idx}", sprite.size, f"label cx={cxpct:.1f}%")
