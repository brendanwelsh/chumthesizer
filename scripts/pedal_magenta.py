"""Composite the bg-removed device over saturated MAGENTA to confirm NO white/grey
halo or shadow remains."""
from PIL import Image
import numpy as np

RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"
OUT = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedal_magenta.png"

dev = Image.open(RGBA).convert("RGBA")
mag = Image.new("RGBA", dev.size, (255, 0, 255, 255))
mag.alpha_composite(dev)
mag.convert("RGB").save(OUT)
print("wrote", OUT, dev.size)
