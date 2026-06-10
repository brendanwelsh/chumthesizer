"""Zoom the magenta composite to the device edges to hunt for any halo/shadow residue."""
from PIL import Image

MAG = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedal_magenta.png"
im = Image.open(MAG).convert("RGB")

# bottom-edge strip (where front lip / shadow base lives): y ~ 700..790, full width
bot = im.crop((40, 690, 1110, 800)).resize((1070*1, 110*2))
bot.save(r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedal_mag_bottom.png")

# left edge strip
lft = im.crop((30, 340, 200, 780))
lft = lft.resize((lft.width*3, lft.height*1))
lft.save(r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedal_mag_left.png")
print("ok")
