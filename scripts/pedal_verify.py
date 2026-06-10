"""VERIFY: composite all 3 white sprites over the brightened base, save _pedal_align.png.
Also composite the base alone over MAGENTA -> _pedal_basemag.png. Read both."""
from PIL import Image, ImageEnhance

OUTDIR = r"C:\Users\brend\Projects\ulanzi-synth\public\pedal"
RAW = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw"

base = Image.open(rf"{OUTDIR}\base.png").convert("RGBA")

# brighten base so the white sprite edges are easy to judge against the seams
bright = ImageEnhance.Brightness(base).enhance(1.55)

comp = bright.copy()
for i in range(3):
    w = Image.open(rf"{OUTDIR}\white-{i}.png").convert("RGBA")
    comp.alpha_composite(w)

# put on a mid-grey card so transparent area is visible
card = Image.new("RGBA", comp.size, (60, 60, 66, 255))
card.alpha_composite(comp)
card.convert("RGB").save(rf"{RAW}\_pedal_align.png")

# base alone on magenta
mag = Image.new("RGBA", base.size, (255, 0, 255, 255))
mag.alpha_composite(base)
mag.convert("RGB").save(rf"{RAW}\_pedal_basemag.png")
print("ok", comp.size)
