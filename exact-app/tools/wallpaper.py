# Generates assets/wallpaper.png: a WhatsApp-like beige doodle wallpaper (original line art).
import math, random
from PIL import Image, ImageDraw
W, H, S = 1179, 2556, 3  # iPhone 17 Pro pixels, 3x
BG, INK = (239, 231, 221), (226, 215, 201)
img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img); rnd = random.Random(7)
lw = 2 * S // 2 + 1
def star(x, y, r):
    pts = [(x + (r if i % 2 == 0 else r * .45) * math.cos(math.pi / 5 * i - math.pi / 2),
            y + (r if i % 2 == 0 else r * .45) * math.sin(math.pi / 5 * i - math.pi / 2)) for i in range(10)]
    d.line(pts + [pts[0]], fill=INK, width=lw, joint='curve')
def heart(x, y, r):
    pts = [(x + r * 16 * math.sin(t) ** 3 / 17, y - r * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17)
           for t in [i * 2 * math.pi / 40 for i in range(41)]]
    d.line(pts, fill=INK, width=lw, joint='curve')
def bubble(x, y, r):
    d.rounded_rectangle([x - r, y - r * .7, x + r, y + r * .5], radius=r * .4, outline=INK, width=lw)
    d.line([(x - r * .4, y + r * .5), (x - r * .7, y + r), (x - r * .1, y + r * .5)], fill=INK, width=lw)
def circle(x, y, r): d.ellipse([x - r, y - r, x + r, y + r], outline=INK, width=lw)
def squiggle(x, y, r):
    d.line([(x - r + i * r / 10, y + math.sin(i / 1.6) * r / 4) for i in range(21)], fill=INK, width=lw, joint='curve')
def note(x, y, r):
    circle(x - r * .4, y + r * .5, r * .3); d.line([(x - r * .1, y + r * .5), (x - r * .1, y - r * .8), (x + r * .5, y - r * .5)], fill=INK, width=lw)
def sun(x, y, r):
    circle(x, y, r * .45)
    for k in range(8):
        a = k * math.pi / 4; d.line([(x + r * .65 * math.cos(a), y + r * .65 * math.sin(a)), (x + r * math.cos(a), y + r * math.sin(a))], fill=INK, width=lw)
shapes = [star, heart, bubble, circle, squiggle, note, sun]
step = 46 * S
for gy in range(-1, H // step + 2):
    for gx in range(-1, W // step + 2):
        x = gx * step + (step / 2 if gy % 2 else 0) + rnd.uniform(-10, 10) * S
        y = gy * step + rnd.uniform(-10, 10) * S
        rnd.choice(shapes)(x, y, rnd.uniform(7, 11) * S)
img.save('assets/wallpaper.png', optimize=True)
