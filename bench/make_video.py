#!/usr/bin/env python3
"""LinkedIn video (1080x1350): two iPhones side by side, React Native left, Exact right, from the hand passes.

Times per recording, in s after LIFT (the finger leaves the icon and iOS starts the launch animation; the icon
had been greyed by the touch before that, for as long as the finger stayed, which is the person, not the app):
  READY   first complete frame (analyze_launch2 "complete": edge energy >= 90 % of the settled screen)
  SCROLL  first frame of the person's scroll (a run of moving frames; the 1-frame jump before it is a message arriving)
  TOP     last frame of the scroll's motion, on message 1 (checked by eye)
 A  launch, real time: from LIFT - 0.1 (both icons greyed) to HOLD, then holds; the counter stops at READY
 B  the same, slow motion x6 (every captured frame shown, none invented), then holds
 C1 scroll, real time, each phone from its own SCROLL - 0.2 s; counters from SCROLL
 C2 the rest of RN's scroll sped up x4 until message 1; Exact holds on message 1
Usage: make_video.py  ->  runs/linkedin.mp4"""
import subprocess
from PIL import Image, ImageDraw

LIFT = {"rn": 3.5672, "exact": 3.4172}
READY = {"rn": 0.283, "exact": 0.200}
SCROLL = {"rn": 1.92, "exact": 0.65}
TOP = {"rn": 46.61, "exact": 18.92}
SLOW, FAST, C1LEN = 6, 4, 19.5
SW, SH, BZ = 440, 957, 14
PW, PH = SW + 2 * BZ, SH + 2 * BZ
X = {"rn": 50, "exact": 1080 - 50 - PW}
Y = 175
OUT = "runs"
apps = ("rn", "exact")
up = {k: TOP[k] - SCROLL[k] for k in apps}           # time to message 1, from the first scroll gesture

# --- device frame, screen mask, background
fr = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
d = ImageDraw.Draw(fr)
d.rounded_rectangle((0, 0, PW - 1, PH - 1), 74, fill=(18, 18, 20, 255), outline=(92, 92, 98, 255), width=3)
d.rounded_rectangle((BZ, BZ, BZ + SW - 1, BZ + SH - 1), 60, fill=(0, 0, 0, 0))
d.rounded_rectangle((PW // 2 - 62, BZ + 11, PW // 2 + 62, BZ + 45), 17, fill=(0, 0, 0, 255))
fr.save(f"{OUT}/frame.png")
m = Image.new("L", (SW, SH), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, SW - 1, SH - 1), 60, fill=255)
m.save(f"{OUT}/mask.png")
bg = Image.new("RGB", (1080, 1350))
for y in range(1350):
    c = int(14 + 14 * y / 1350)
    ImageDraw.Draw(bg).line([(0, y), (1080, y)], fill=(c, c + 2, c + 6))
bg.save(f"{OUT}/bg.png")

# --- timeline
HOLD = 0.5   # both phones play to here (iOS's launch animation over, before either scroll starts), then hold
RMAX = HOLD
A = 0.1 + RMAX + 0.7
B = SLOW * (0.1 + RMAX + 0.05) + 0.8
C1 = C1LEN
c2_from = {k: SCROLL[k] - 0.2 + C1LEN for k in apps}
C2 = (TOP["rn"] + 0.8 - c2_from["rn"]) / FAST
END = 2.0
TOTAL = A + B + C1 + C2 + END

def ts(t):
    h, r = divmod(t, 3600); mi, s = divmod(r, 60)
    return f"{int(h)}:{int(mi):02d}:{s:05.2f}"

ev = []
def text(t1, t2, x, y, s, size, colour="FFFFFF", bold=0, an=8, style="S"):
    ev.append(f"Dialogue: 0,{ts(t1)},{ts(t2)},{style},,0,0,0,,{{\\an{an}\\pos({x},{y})\\fs{size}\\b{bold}"
              f"\\1c&H{colour[4:6]}{colour[2:4]}{colour[0:2]}&}}{s}")

for t1, t2, s in [(0, A, "Ouverture"), (A, A + B, "Ouverture · ralenti ×6"),
                  (A + B, A + B + C1, "Scroll vers le haut, au doigt"),
                  (A + B + C1, A + B + C1 + C2, "Scroll vers le haut · accéléré ×4"),
                  (A + B + C1 + C2, TOTAL, "Jusqu'au message 1 sur 10 000")]:
    text(t1, t2, 540, 60, s, 54, bold=1)
cx = {k: X[k] + PW // 2 for k in apps}
for k, name in (("rn", "React Native"), ("exact", "Exact")):
    text(0, TOTAL, cx[k], Y + PH + 22, name, 46, bold=1)

GREY, GREEN = "BFC5CC", "34C759"
fmt_s = lambda v: f"{v:.1f} s".replace(".", ",")
step = 1 / 60
t = 0.0
while t < TOTAL:
    for k in apps:
        if t < A + B:                                  # ms since the finger lifted
            r = t - 0.1 if t < A else -0.1 + (t - A) / SLOW
            done = r >= READY[k]
            s = f"Prête · {READY[k] * 1000:.0f} ms" if done else f"{max(r, 0) * 1000:.0f} ms"
        else:                                          # s since the first scroll gesture
            r = (t - A - B - 0.2) if t < A + B + C1 else (C1LEN - 0.2 + (t - A - B - C1) * FAST)
            done = r >= up[k]
            s = fmt_s(min(max(r, 0), up[k]))
        text(t, t + step, cx[k], Y + PH + 80, s, 36, GREEN if done else GREY)
    t += step
for k in apps:
    reach = A + B + 0.2 + up[k] if up[k] <= C1LEN - 0.2 else A + B + C1 + (up[k] - (C1LEN - 0.2)) / FAST
    text(reach, TOTAL, cx[k], Y + PH // 2, f"✓ Message 1 · {fmt_s(up[k])}", 40, "FFFFFF", 1, 5, "Badge")
text(0, A + B, 540, 1310, "Même iPhone 17 Pro, builds Release. Compteur depuis le relâchement du doigt sur l'icône.", 24, "8A9099")
text(A + B, TOTAL, 540, 1310, "Même iPhone 17 Pro, builds Release, même doigt. Compteur depuis le premier geste de scroll.", 24, "8A9099")

with open(f"{OUT}/overlay.ass", "w") as f:
    f.write("""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1350

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,Helvetica Neue,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,2,8,0,0,0,1
Style: Badge,Helvetica Neue,40,&H00FFFFFF,&H00FFFFFF,&H28000000,&H28000000,1,0,0,0,100,100,0,0,3,16,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(ev) + "\n")

# --- one screen per app
def screen(i, k):
    L = LIFT[k]
    def seg(a, b, n, extra=""):
        return f"[{i}:v]trim={L + a:.3f}:{L + b:.3f},setpts=PTS-STARTPTS,fps=60{extra}[{n}]"
    a_len = 0.1 + HOLD
    parts = [
        seg(-0.1, HOLD, f"{k}a", f",tpad=stop_mode=clone:stop_duration={A - a_len:.3f}"),
        seg(-0.1, HOLD + 0.05, f"{k}bs") + f";[{k}bs]setpts={SLOW}*PTS,fps=60,"
        f"tpad=stop_mode=clone:stop_duration={B - SLOW * (a_len + 0.05):.3f}[{k}b]",
        seg(SCROLL[k] - 0.2, SCROLL[k] - 0.2 + C1LEN, f"{k}c1"),
    ]
    if k == "rn":
        parts.append(seg(c2_from[k], TOP[k] + 0.8, f"{k}c2s") + f";[{k}c2s]setpts=PTS/{FAST},fps=60,"
                     f"tpad=stop_mode=clone:stop_duration={END}[{k}c2]")
    else:
        parts.append(seg(c2_from[k] - 0.02, c2_from[k], f"{k}c2", f",tpad=stop_mode=clone:stop_duration={C2 + END:.3f}"))
    parts.append(f"[{k}a][{k}b][{k}c1][{k}c2]concat=n=4:v=1[{k}cat];[{k}cat]scale={SW}:{SH},format=rgba[{k}s];"
                 f"[{k}s][3:v]alphamerge[{k}r]")
    return ";".join(parts)

fc = ";".join([screen(1, "rn"), screen(2, "exact"),
    f"[0:v][rnr]overlay={X['rn'] + BZ}:{Y + BZ}[o1];[o1][exactr]overlay={X['exact'] + BZ}:{Y + BZ}[o2];"
    f"[4:v]split[f1][f2];[o2][f1]overlay={X['rn']}:{Y}[o3];[o3][f2]overlay={X['exact']}:{Y}[o4];"
    f"[o4]ass={OUT}/overlay.ass,trim=0:{TOTAL:.3f},format=yuv420p[v]"])
cmd = ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "60", "-i", f"{OUT}/bg.png",
       "-i", f"{OUT}/hand-rn-1.mov", "-i", f"{OUT}/hand-exact-1.mov",
       "-loop", "1", "-i", f"{OUT}/mask.png", "-loop", "1", "-i", f"{OUT}/frame.png",
       "-filter_complex", fc, "-map", "[v]", "-t", f"{TOTAL:.3f}", "-r", "60",
       "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", f"{OUT}/linkedin.mp4"]
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stderr[-2000:] or f"ok {OUT}/linkedin.mp4, {TOTAL:.1f} s (A {A:.2f}, B {B:.2f}, C1 {C1}, C2 {C2:.2f})")
