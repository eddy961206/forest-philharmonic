#!/usr/bin/env python3
"""Download the instrument samples used by Forest Philharmonic.

Samples are already committed under public/samples, so you only need this
script if you want to re-download or change the sampling density.

Sources
  * FluidR3_GM (rendered by gleitz/midi-js-soundfonts) - CC BY 3.0
  * Salamander Grand Piano V3 by Alexander Holm (via Tonejs/audio) - CC BY 3.0
"""
import concurrent.futures as cf
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "samples")

FLUID = "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/{inst}-mp3/{note}.mp3"
SALAMANDER = "https://raw.githubusercontent.com/Tonejs/audio/master/salamander/{note}.mp3"

# instrument id -> (soundfont name, low midi, high midi, step in semitones)
FLUID_SET = {
    "violin": ("violin", 55, 100, 2),
    "viola": ("viola", 48, 88, 2),
    "cello": ("cello", 36, 81, 2),
    "contrabass": ("contrabass", 28, 67, 2),
    "strings": ("string_ensemble_1", 28, 100, 2),
    "flute": ("flute", 60, 98, 2),
    "oboe": ("oboe", 58, 93, 2),
    "clarinet": ("clarinet", 50, 94, 2),
    "bassoon": ("bassoon", 34, 75, 2),
    "horn": ("french_horn", 34, 79, 2),
    "trumpet": ("trumpet", 52, 86, 2),
    "timpani": ("timpani", 36, 60, 2),
    "harp": ("orchestral_harp", 24, 103, 2),
    "choir": ("choir_aahs", 43, 84, 2),
    "voice": ("voice_oohs", 48, 84, 2),
    "bells": ("tubular_bells", 55, 84, 3),
}

FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
SALAMANDER_NAMES = {0: "C", 3: "Ds", 6: "Fs", 9: "A"}


def fluid_name(midi):
    return f"{FLAT_NAMES[midi % 12]}{midi // 12 - 1}"


def jobs():
    manifest = {}
    for key, (sf, lo, hi, step) in FLUID_SET.items():
        notes = list(range(lo, hi + 1, step))
        if notes[-1] != hi:
            notes.append(hi)
        manifest[key] = notes
        for m in notes:
            yield key, m, FLUID.format(inst=sf, note=fluid_name(m))
    piano = [m for m in range(21, 109) if m % 12 in SALAMANDER_NAMES]
    manifest["piano"] = piano
    for m in piano:
        name = f"{SALAMANDER_NAMES[m % 12]}{m // 12 - 1}"
        yield "piano", m, SALAMANDER.format(note=name)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))


def fetch(job):
    key, midi, url = job
    dest = os.path.join(OUT, key, f"{midi}.mp3")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return key, midi, "cached"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            return key, midi, len(data)
        except Exception as e:  # noqa: BLE001
            err = e
    return key, midi, f"FAILED {err}"


def main():
    os.makedirs(OUT, exist_ok=True)
    all_jobs = list(jobs())
    failed = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for key, midi, res in ex.map(fetch, all_jobs):
            if isinstance(res, str) and res.startswith("FAILED"):
                failed += 1
                print(key, midi, res, file=sys.stderr)
    print(f"{len(all_jobs) - failed}/{len(all_jobs)} samples ready in {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
