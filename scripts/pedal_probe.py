"""Overlay candidate corner POINTS (given in original coords) on the brightened device,
each labelled with its (x,y), so I can confirm/adjust the pedal polygons by eye.
Reads a polygon set, draws the polygon outline + numbered vertices."""
import sys, json
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"
OUT = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedalprobe.png"

# polygons in ORIGINAL image coords; edit & re-run to converge
POLYS = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {
    "L": [[95,400],[300,378],[315,690],[70,705]],
    "C": [[345,372],[800,372],[835,700],[320,700]],
    "R": [[850,378],[1055,400],[1078,705],[835,690]],
}
COLORS = {"L": (0,255,80), "C": (255,80,255), "R": (255,220,0)}

dev = Image.open(RGBA).convert("RGBA")
bgc = Image.new("RGBA", dev.size, (30,30,34,255))
bgc.alpha_composite(dev)
im = bgc.convert("RGB")
im = ImageEnhance.Brightness(im).enhance(1.6)
im = ImageEnhance.Contrast(im).enhance(1.2)

# crop tight to device & scale 2x for legibility
CX0,CY0,CX1,CY1 = 40,335,1105,765
SCALE=2
im = im.crop((CX0,CY0,CX1,CY1)).resize(((CX1-CX0)*SCALE,(CY1-CY0)*SCALE), Image.LANCZOS)
d = ImageDraw.Draw(im)
try: font = ImageFont.truetype("arial.ttf", 16)
except Exception: font = ImageFont.load_default()
def S(p): return ((p[0]-CX0)*SCALE,(p[1]-CY0)*SCALE)

for key,poly in POLYS.items():
    col = COLORS.get(key,(0,255,255))
    pts=[S(p) for p in poly]
    d.line(pts+[pts[0]], fill=col, width=2)
    for i,(p,sp) in enumerate(zip(poly,pts)):
        d.ellipse([sp[0]-4,sp[1]-4,sp[0]+4,sp[1]+4], fill=col)
        d.text((sp[0]+5,sp[1]-8), f"{key}{i}:{p[0]},{p[1]}", fill=col, font=font)

im.save(OUT)
print("wrote", OUT, im.size)
