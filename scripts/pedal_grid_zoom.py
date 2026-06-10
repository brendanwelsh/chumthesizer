"""Zoomed measuring grid over just the device, scaled 2x with legible labels.
Crop region of the ORIGINAL image, then grid in ORIGINAL coords mapped to the zoom."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"

# crop window in ORIGINAL coords (a bit of pad around the device)
CX0, CY0, CX1, CY1 = 30, 330, 1110, 770
SCALE = 2

name = sys.argv[1] if len(sys.argv) > 1 else "all"
if name == "L":
    CX0, CY0, CX1, CY1 = 30, 330, 360, 770; SCALE = 3
elif name == "C":
    CX0, CY0, CX1, CY1 = 300, 330, 820, 770; SCALE = 2
elif name == "R":
    CX0, CY0, CX1, CY1 = 780, 330, 1110, 770; SCALE = 3

OUT = rf"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedalgrid_{name}.png"

dev = Image.open(RGBA).convert("RGBA")
bgc = Image.new("RGBA", dev.size, (35, 35, 40, 255))
bgc.alpha_composite(dev)
im = bgc.convert("RGB")
im = ImageEnhance.Brightness(im).enhance(1.9)
im = ImageEnhance.Contrast(im).enhance(1.25)

crop = im.crop((CX0, CY0, CX1, CY1))
zw, zh = (CX1 - CX0) * SCALE, (CY1 - CY0) * SCALE
crop = crop.resize((zw, zh), Image.LANCZOS)

d = ImageDraw.Draw(crop)
try:
    font = ImageFont.truetype("arial.ttf", 15)
except Exception:
    font = ImageFont.load_default()

def sx(x): return (x - CX0) * SCALE
def sy(y): return (y - CY0) * SCALE

x0g = (CX0 // 25 + 1) * 25
for x in range(x0g, CX1, 25):
    col = (0, 220, 255) if x % 100 == 0 else (0, 80, 120)
    d.line([(sx(x), 0), (sx(x), zh)], fill=col, width=1)
    if x % 50 == 0:
        d.text((sx(x) + 1, 1), str(x), fill=(0, 235, 255), font=font)
        d.text((sx(x) + 1, zh - 18), str(x), fill=(0, 235, 255), font=font)
y0g = (CY0 // 25 + 1) * 25
for y in range(y0g, CY1, 25):
    col = (255, 100, 0) if y % 100 == 0 else (120, 55, 0)
    d.line([(0, sy(y)), (zw, sy(y))], fill=col, width=1)
    if y % 50 == 0:
        d.text((1, sy(y) + 1), str(y), fill=(255, 150, 0), font=font)
        d.text((zw - 42, sy(y) + 1), str(y), fill=(255, 150, 0), font=font)

crop.save(OUT)
print("wrote", OUT, crop.size)
