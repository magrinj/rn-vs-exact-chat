#!/usr/bin/env python3
"""Idle CPU and memory from an Activity Monitor trace of one launched app.
CPU = CPU time used between 15 s and the end / wall time (one core = 100 %). Memory = physical footprint.
Usage: idle.py run.trace Chat|WhatsApp"""
import subprocess, sys, xml.etree.ElementTree as ET
x = subprocess.run(["xcrun", "xctrace", "export", "--input", sys.argv[1], "--xpath",
    '/trace-toc/run[@number="1"]/data/table[@schema="activity-monitor-process-live"]'], capture_output=True, text=True).stdout
root = ET.fromstring(x)
cols = [c.find("mnemonic").text for c in root.iter("col")]
ids, pts = {}, {}
for row in root.iter("row"):
    vals = {}
    for name, e in zip(cols, list(row)):
        if "ref" in e.attrib: e = ids[e.attrib["ref"]]
        else:
            for sub in e.iter():
                if "id" in sub.attrib: ids[sub.attrib["id"]] = sub
        vals[name] = e
    p = vals["process"].attrib.get("fmt", "")
    if not p.startswith(sys.argv[2] + " ("): continue
    t = int(vals["start"].text) / 1e9
    pts.setdefault(p, []).append((t, int(vals["cpu-total"].text) / 1e9, int(vals["memory-physical-footprint"].text) / 2**20))
p, s = max(pts.items(), key=lambda kv: len(kv[1]))
s.sort()
a = next(x for x in s if x[0] >= s[0][0] + 15); b = s[-1]
mem = lambda at: min(s, key=lambda x: abs(x[0] - (s[0][0] + at)))[2]
print(f"{sys.argv[1]} {p}: CPU {100*(b[1]-a[1])/(b[0]-a[0]):.1f} % ({b[0]-a[0]:.0f} s), memory {mem(10):.0f} MB @10s, {mem(35):.0f} MB @35s, {b[2]:.0f} MB @{b[0]-s[0][0]:.0f}s")
