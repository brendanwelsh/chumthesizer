"""Brighten the device hard + draw a fine measuring grid, so I can read off the real
pedal top-face corner polygons. 25px thin lines, 100px labelled heavy lines.
Coordinates are in ORIGINAL source-image pixels (1144x1144)."""
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"
OUT = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedalgrid.png"

dev = Image.open(RGBA).convert("RGBA")
# put device on dark grey so transparency doesn't confuse, then brighten hard
bgc = Image.new("RGBA", dev.size, (40, 40, 46, 255))
bgc.alpha_composite(dev)
im = bgc.convert("RGB")
im = ImageEnhance.Brightness(im).enhance(2.3)
im = ImageEnhance.Contrast(im).enhance(1.15)

W, H = im.size
d = ImageDraw.Draw(im)
try:
    font = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()

for x in range(0, W, 25):
    col = (0, 200, 255) if x % 100 == 0 else (0, 90, 130)
    d.line([(x, 0), (x, H)], fill=col, width=1)
for y in range(0, H, 25):
    col = (255, 90, 0) if y % 100 == 0 else (130, 60, 0)
    d.line([(0, y), (W, y)], fill=col, width=1)
for x in range(0, W, 100):
    d.text((x + 2, 2), str(x), fill=(0, 230, 255), font=font)
    d.text((x + 2, H - 20), str(x), fill=(0, 230, 255), font=font)
for y in range(0, H, 100):
    d.text((2, y + 1), str(y), fill=(255, 140, 0), font=font)

im.save(OUT)
print("wrote", OUT)
