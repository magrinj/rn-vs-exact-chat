#!/usr/bin/env python3
"""Launch timings by content, from a screenrec .mov + .csv pair (testLaunchForVideo).

t0 = first frame that leaves the still home screen (iOS starts the launch transition).
Content = edge energy of the transcript band (y 20-80 %): mean |frame - 9x9 box blur|. Text and bubble edges
have it; the blurred home screen, a blank launch screen and a header-only frame have almost none. It does not
care where the edges are, so it counts messages shown while iOS still zooms and fades the window in.
Relative to the settled frame (t0 + REF s, before the first live message arrives):
  visible   first frame >= 50 %: messages on screen (possibly still fading in)
  complete  first frame >= 90 %: the screen as it settles
Frames come at up to 60/s from the capture, so each time is good to about +-17 ms.
Usage: analyze_launch2.py runs/name   (reads runs/name.csv and runs/name.mov)
"""
import csv, statistics, subprocess, sys
import numpy as np

REF, W, H = 0.9, 295, 639
base = sys.argv[1]
rows = [(float(r["t"]), float(r["green"]), float(r["diff"])) for r in csv.DictReader(open(base + ".csv"))]
start = rows[0][0]

def launches():
    out, i = [], 0
    while i < len(rows):
        j = i
        while j < len(rows) and rows[j][2] < 2 and rows[j][1] < 0.003:
            j += 1
        if j >= len(rows):
            break
        if j > i and rows[j - 1][0] - rows[i][0] >= 1.5:
            out.append(rows[j][0] - start)
            while j < len(rows) and rows[j][0] - start < out[-1] + 3:
                j += 1
        i = j + 1
    return out

def frames(t, dur):
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-ss", f"{max(t, 0):.3f}", "-i", base + ".mov", "-t", f"{dur:.3f}",
                          "-vf", f"scale={W}:{H}", "-vsync", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)

def highpass(f):
    band = f[int(H * 0.2):int(H * 0.8)]
    k = 9
    c = np.cumsum(np.cumsum(np.pad(band, ((k // 2 + 1, k // 2), (k // 2 + 1, k // 2)), mode="edge"), 0), 1)
    blur = (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
    return (band - blur).ravel()

res = []
for t0 in launches():
    seq = frames(t0 - 0.05, REF + 0.1)
    times = [r[0] - start for r in rows if t0 - 0.06 <= r[0] - start <= t0 + REF + 0.05]
    n = min(len(seq), len(times))
    e = [float(np.abs(highpass(f)).mean()) for f in seq[:n]]
    ref = e[-1]
    # skip the home screen's own edges before the transition blurs it
    k0 = next(i for i, (t, x) in enumerate(zip(times, e)) if t > t0 and x < 0.25 * ref)
    vis = next((times[i] for i in range(k0, n) if e[i] >= 0.5 * ref), None)
    com = next((times[i] for i in range(k0, n) if e[i] >= 0.9 * ref), None)
    res.append((round((vis - t0) * 1000) if vis else None, round((com - t0) * 1000) if com else None))

print(f"{base}: {len(res)} launches")
for k, name in ((0, "visible"), (1, "complete")):
    v = [r[k] for r in res]
    ok = [x for x in v if x is not None]
    print(f"  {name:8s} ms: {v}" + (f"  median {statistics.median(ok):.0f}, sd {statistics.pstdev(ok):.0f}" if ok else ""))
