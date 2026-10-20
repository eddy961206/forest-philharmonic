#!/usr/bin/env python3
"""Measure every sample and write public/samples/manifest.json.

For each sample we store
  s  - start offset (s): first point above -40 dB of peak, so MP3 encoder
       padding and dead air don't delay the note
  g  - gain that brings the sustain RMS to a common reference, so the
       engine's balance numbers mean the same thing for every instrument
  d  - usable duration (s) after the start offset

Needs ffmpeg on PATH. Run after tools/fetch_samples.py.
"""
import array
import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, "public", "samples")
SR = 22050
TARGET_RMS = 0.12


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    a = array.array("f")
    a.frombytes(raw)
    return a


def measure(path, percussive):
    a = decode(path)
    peak = max((abs(x) for x in a), default=0.0) or 1e-9
    thresh = peak * 0.01  # -40 dB
    start = next((i for i, x in enumerate(a) if abs(x) > thresh), 0)
    # back off a hair so we keep the very front of the attack
    start = max(0, start - int(0.004 * SR))
    if percussive:
        # loudness of the strike itself
        lo, hi = start, min(len(a), start + int(0.35 * SR))
    else:
        # sustain region, past the attack
        lo = min(len(a) - 1, start + int(0.25 * SR))
        hi = min(len(a), start + int(1.6 * SR))
    seg = a[lo:hi] if hi > lo else a[start:]
    rms = math.sqrt(sum(x * x for x in seg) / max(1, len(seg))) or 1e-9
    # find the tail where the sample effectively ends (-50 dB of peak)
    end = len(a)
    tail_t = peak * 0.003
    for i in range(len(a) - 1, start, -1):
        if abs(a[i]) > tail_t:
            end = i
            break
    return {
        "s": round(start / SR, 4),
        "g": round(min(8.0, TARGET_RMS / rms), 4),
        "d": round((end - start) / SR, 3),
    }


PERCUSSIVE = {"piano", "harp", "timpani"}


def main():
    out = {}
    for inst in sorted(os.listdir(SAMPLES)):
        d = os.path.join(SAMPLES, inst)
        if not os.path.isdir(d):
            continue
        notes = {}
        for f in sorted(os.listdir(d), key=lambda x: int(x.split(".")[0])):
            if not f.endswith(".mp3"):
                continue
            notes[f.split(".")[0]] = measure(os.path.join(d, f), inst in PERCUSSIVE)
        out[inst] = notes
        gains = [v["g"] for v in notes.values()]
        print(f"{inst:11s} {len(notes):3d} samples  gain {min(gains):.2f}-{max(gains):.2f}  "
              f"start<= {max(v['s'] for v in notes.values()):.3f}s  dur {min(v['d'] for v in notes.values()):.2f}-{max(v['d'] for v in notes.values()):.2f}s")
    with open(os.path.join(SAMPLES, "manifest.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
