"""Probe ONE pedal polygon, zoomed, with a fine grid + the polygon overlaid, so I can
read exact corners. Args: KEY  JSON-poly  [cx0 cy0 cx1 cy1 scale]"""
import sys, json
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RGBA = r"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_dev_rgba.png"

KEY = sys.argv[1]
POLY = json.loads(sys.argv[2])
if len(sys.argv) >= 7:
    CX0,CY0,CX1,CY1 = map(int, sys.argv[3:7])
    SCALE = int(sys.argv[7]) if len(sys.argv) > 7 else 3
else:
    CX0,CY0,CX1,CY1,SCALE = 40,335,400,765,3

OUT = rf"C:\Users\brend\Projects\ulanzi-synth\assets\raw\_pedalprobe_{KEY}.png"

dev = Image.open(RGBA).convert("RGBA")
bgc = Image.new("RGBA", dev.size, (30,30,34,255))
bgc.alpha_composite(dev)
im = bgc.convert("RGB")
im = ImageEnhance.Brightness(im).enhance(1.7)
im = ImageEnhance.Contrast(im).enhance(1.2)
im = im.crop((CX0,CY0,CX1,CY1)).resize(((CX1-CX0)*SCALE,(CY1-CY0)*SCALE), Image.LANCZOS)
d = ImageDraw.Draw(im)
zw,zh = im.size
try: font = ImageFont.truetype("arial.ttf", 14)
except Exception: font = ImageFont.load_default()
def S(p): return ((p[0]-CX0)*SCALE,(p[1]-CY0)*SCALE)

# fine grid 25px, labelled 50px
x0g=(CX0//25+1)*25
for x in range(x0g,CX1,25):
    c=(0,210,255) if x%100==0 else (0,70,105)
    d.line([((x-CX0)*SCALE,0),((x-CX0)*SCALE,zh)],fill=c,width=1)
    if x%50==0:
        d.text(((x-CX0)*SCALE+1,1),str(x),fill=(0,235,255),font=font)
        d.text(((x-CX0)*SCALE+1,zh-16),str(x),fill=(0,235,255),font=font)
y0g=(CY0//25+1)*25
for y in range(y0g,CY1,25):
    c=(255,90,0) if y%100==0 else (110,50,0)
    d.line([(0,(y-CY0)*SCALE),(zw,(y-CY0)*SCALE)],fill=c,width=1)
    if y%50==0:
        d.text((1,(y-CY0)*SCALE+1),str(y),fill=(255,150,0),font=font)
        d.text((zw-38,(y-CY0)*SCALE+1),str(y),fill=(255,150,0),font=font)

pts=[S(p) for p in POLY]
d.line(pts+[pts[0]], fill=(80,255,120), width=2)
for i,(p,sp) in enumerate(zip(POLY,pts)):
    d.ellipse([sp[0]-4,sp[1]-4,sp[0]+4,sp[1]+4], fill=(255,60,60))
    d.text((sp[0]+5,sp[1]-16), f"{i}:{p[0]},{p[1]}", fill=(255,255,80), font=font)

im.save(OUT)
print("wrote", OUT, im.size)
