"""Background + drop-shadow removal for the Elgato Stream Deck Pedal -> true silhouette.

Approach that KILLS the soft drop-shadow (the previous halo problem):
  - Define device_core = clearly dark plastic (lum <= DARK_CORE).
  - Background = every pixel reachable from the image border that is NOT device_core
    (4-connected region grow). Because the soft shadow under the front lip is mid-grey
    (lum ~140..250) and is continuously connected to the pure-white border, the grow
    swallows the ENTIRE shadow gradient. Interior light features (the Elgato logo) are
    fully enclosed by dark core, so the grow never reaches them -> they survive.
  - Soft-blur the resulting alpha edge ~1px.
  - Strict luminance bbox of the dark device for a TIGHT crop (shadow excluded).
"""
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

SRC = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\magic-trackpad-apple.jpg"
OUT_RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"

DARK_CORE = 95   # lum at/below this = solid device plastic (never background)

im = Image.open(SRC).convert("RGB")
W, H = im.size
arr = np.asarray(im).astype(np.uint8)
f = arr.astype(np.float32)
lum = 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]

core = lum <= DARK_CORE          # protected device pixels
# background grow: from border into anything NOT core
inbg = np.zeros((H, W), dtype=bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if not core[y, x] and not inbg[y, x]:
            inbg[y, x] = True
            dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if not core[y, x] and not inbg[y, x]:
            inbg[y, x] = True
            dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and not inbg[ny, nx] and not core[ny, nx]:
            inbg[ny, nx] = True
            dq.append((ny, nx))

device = ~inbg
alpha = np.where(device, 255, 0).astype(np.uint8)

# erode by 1px first so the blurred edge doesn't re-introduce a light fringe from the
# (now removed) shadow, then soft-blur ~1px for a clean anti-aliased edge.
amask = Image.fromarray(alpha, "L")
amask = amask.filter(ImageFilter.MinFilter(3))             # 1px erode
amask = amask.filter(ImageFilter.GaussianBlur(0.8))
alpha_b = np.asarray(amask)

rgba = np.dstack([arr, alpha_b])
Image.fromarray(rgba, "RGBA").save(OUT_RGBA)

# tight bbox on the dark device (exclude any soft remnant)
ys, xs = np.where(device)
print(f"size={W}x{H}")
print(f"alpha-bbox x0={xs.min()} x1={xs.max()} y0={ys.min()} y1={ys.max()} w={xs.max()-xs.min()+1} h={ys.max()-ys.min()+1}")
print(f"device px count={int(device.sum())}")
