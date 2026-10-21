#!/usr/bin/env python3
"""Build performance data (public/music/*.json) from public-domain scores.

Sources
  * music21 core corpus (MusicXML / Humdrum) - pip install music21
  * DCML annotated corpora (MuseScore-derived note tables), CC BY-NC-SA 4.0
    https://github.com/DCMLab - cloned into tools/.cache by --fetch

The output is a ready-to-play performance: notes in seconds, a beat grid for
the conductor, and which stage section plays which line. All interpretive
choices (tempo, rubato, balance, orchestration) live in PROGRAM below.

    python3 tools/build_music.py --fetch     # clone DCML corpora once
    python3 tools/build_music.py             # rebuild all pieces
    python3 tools/build_music.py clair       # rebuild ids containing "clair"
"""
from __future__ import annotations

import bisect
import csv
import json
import math
import os
import re
import subprocess
import sys
import warnings
from dataclasses import dataclass, field
from fractions import Fraction

warnings.filterwarnings("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "music")
CACHE = os.path.join(ROOT, "tools", ".cache")
DCML_REPOS = [
    "debussy_suite_bergamasque",
    "schumann_kinderszenen",
    "tchaikovsky_seasons",
    "beethoven_piano_sonatas",
    "grieg_lyric_pieces",
]
# Humdrum **kern editions by Craig Sapp (CC BY-NC-SA 4.0)
KERN_REPOS = ["chopin-preludes", "chopin-mazurkas", "mozart-piano-sonatas", "beethoven-piano-sonatas", "joplin", "scarlatti-keyboard-sonatas"]

# --------------------------------------------------------------------------
# Intermediate representation
# --------------------------------------------------------------------------


@dataclass
class Note:
    part: str
    on: float  # quarter notes, unfolded timeline
    dur: float
    midi: int
    vel: float = 0.5  # 0..1
    fermata: bool = False
    grace: bool = False
    staff: int = 1


@dataclass
class Measure:
    start: float
    length: float
    mn: int
    ts: str  # "3/4"
    pickup: bool = False


@dataclass
class Score:
    notes: list[Note] = field(default_factory=list)
    measures: list[Measure] = field(default_factory=list)


DYN_LEVEL = {
    "pppp": 0.16, "ppp": 0.22, "pp": 0.30, "p": 0.40, "mp": 0.50, "mf": 0.60,
    "f": 0.72, "ff": 0.84, "fff": 0.94, "ffff": 1.0,
}
ACCENT_DYN = {"sf": 0.16, "sfz": 0.18, "fz": 0.16, "sfp": 0.14, "rfz": 0.12, "rf": 0.12, "sffz": 0.2}

# --------------------------------------------------------------------------
# music21 loader
# --------------------------------------------------------------------------


def load_music21(path: str, measure_range=None, repeats=True, default_dyn=0.45) -> tuple[Score, list[str]]:
    from music21 import articulations, converter, corpus, dynamics, expressions, meter

    s = corpus.parse(path) if not os.path.isabs(path) else converter.parse(path)
    if measure_range:
        s = s.measures(*measure_range)
    try:
        if repeats:
            s = s.expandRepeats()
    except Exception:  # noqa: BLE001 - not every score has clean repeats
        pass
    s = s.stripTies()

    parts = list(s.parts)
    names = []
    for i, p in enumerate(parts):
        nm = (p.partName or f"Part {i + 1}").strip()
        if nm in names:
            nm = f"{nm} {i + 1}"
        names.append(nm)

    score = Score()
    # measures from the first part
    ts_cur = None
    first_offset = None
    for m in parts[0].getElementsByClass("Measure"):
        if m.timeSignature is not None:
            ts_cur = m.timeSignature
        if ts_cur is None:
            ts_cur = m.getContextByClass(meter.TimeSignature) or meter.TimeSignature("4/4")
        off = float(m.offset)
        if first_offset is None:
            first_offset = off
        bar_len = float(ts_cur.barDuration.quarterLength)
        length = float(m.duration.quarterLength) or bar_len
        score.measures.append(Measure(off - first_offset, length, int(m.number or 0), ts_cur.ratioString,
                                      pickup=(len(score.measures) == 0 and length < bar_len - 1e-6)))
    first_offset = first_offset or 0.0

    for pi, p in enumerate(parts):
        flat = p.flatten()
        # dynamics timeline
        dyn_events = []
        for d in flat.getElementsByClass(dynamics.Dynamic):
            dyn_events.append((float(d.offset) - first_offset, str(d.value)))
        dyn_events.sort()
        wedges = []
        for sp in p.spannerBundle if hasattr(p, "spannerBundle") else []:
            if isinstance(sp, (dynamics.Crescendo, dynamics.Diminuendo)):
                els = sp.getSpannedElements()
                if not els:
                    continue
                try:
                    a = float(els[0].getOffsetInHierarchy(p)) - first_offset
                    b = float(els[-1].getOffsetInHierarchy(p)) - first_offset + float(els[-1].quarterLength)
                except Exception:  # noqa: BLE001
                    continue
                wedges.append((a, b, 1 if isinstance(sp, dynamics.Crescendo) else -1))
        for te in flat.getElementsByClass(expressions.TextExpression):
            txt = (te.content or "").strip().lower()
            a = float(te.offset) - first_offset
            if txt.startswith("cresc"):
                wedges.append((a, a + 8, 1))
            elif txt.startswith(("dim", "decresc")):
                wedges.append((a, a + 8, -1))

        dyn_offsets = [o for o, _ in dyn_events]

        def level_at(t):
            i = bisect.bisect_right(dyn_offsets, t + 1e-6) - 1
            base = default_dyn
            for j in range(i, -1, -1):
                v = dyn_events[j][1]
                if v in DYN_LEVEL:
                    base = DYN_LEVEL[v]
                    break
                if v in ("fp", "sfp"):
                    base = DYN_LEVEL["p"]
                    break
            # wedges: grow toward next dynamic or +/- 0.14
            for a, b, sign in wedges:
                if a <= t <= b and b > a:
                    nxt = next((DYN_LEVEL.get(v) for o, v in dyn_events if o > a + 1e-6 and v in DYN_LEVEL), None)
                    target = nxt if nxt is not None and (nxt - base) * sign > 0 else base + 0.14 * sign
                    target = min(max(target, base - 0.2), base + 0.2)
                    base = base + (target - base) * ((t - a) / (b - a))
            return base

        def accent_at(t):
            i = bisect.bisect_left(dyn_offsets, t - 1e-6)
            if i < len(dyn_events) and abs(dyn_events[i][0] - t) < 1e-6:
                v = dyn_events[i][1]
                if v in ACCENT_DYN:
                    return ACCENT_DYN[v]
                if v == "fp":
                    return DYN_LEVEL["f"] - DYN_LEVEL["p"]
            return 0.0

        for n in flat.notes:
            on = float(n.offset) - first_offset
            dur = float(n.duration.quarterLength)
            grace = bool(n.duration.isGrace)
            if dur <= 0 and not grace:
                continue
            vel = level_at(on) + accent_at(on)
            arts = n.articulations
            staccato = False
            for a in arts:
                if isinstance(a, (articulations.Staccato, articulations.Staccatissimo, articulations.Spiccato)):
                    staccato = True
                if isinstance(a, articulations.StrongAccent):
                    vel += 0.14
                elif isinstance(a, articulations.Accent):
                    vel += 0.1
            if staccato:
                dur *= 0.5
            fermata = any(isinstance(e, expressions.Fermata) for e in n.expressions)
            pitches = n.pitches
            for k, pt in enumerate(pitches):
                score.notes.append(Note(names[pi], on, max(dur, 0.0), int(pt.midi), min(1.0, max(0.08, vel)),
                                        fermata=fermata, grace=grace))
    return score, names


# --------------------------------------------------------------------------
# DCML loader (notes.tsv + measures.tsv, repeats unfolded)
# --------------------------------------------------------------------------


def frac(x: str) -> Fraction:
    x = (x or "0").strip()
    return Fraction(x) if x else Fraction(0)


def load_dcml(repo: str, piece: str) -> tuple[Score, list[str]]:
    base = os.path.join(CACHE, repo)
    with open(os.path.join(base, "measures", f"{piece}.measures.tsv"), newline="") as f:
        meas = {int(r["mc"]): r for r in csv.DictReader(f, delimiter="\t")}
    with open(os.path.join(base, "notes", f"{piece}.notes.tsv"), newline="") as f:
        notes_by_mc: dict[int, list[dict]] = {}
        for r in csv.DictReader(f, delimiter="\t"):
            notes_by_mc.setdefault(int(r["mc"]), []).append(r)

    # unfold repeats following the "next" pointers (ms3 semantics)
    order, visits, mc, guard = [], {}, min(meas), 0
    while mc and mc != -1 and guard < 5000:
        guard += 1
        order.append(mc)
        k = visits.get(mc, 0)
        visits[mc] = k + 1
        nxt = [int(x) for x in (meas[mc]["next"] or "-1").replace(" ", "").split(",") if x]
        mc = nxt[min(k, len(nxt) - 1)] if nxt else -1

    score = Score()
    t = Fraction(0)
    raw = []
    for idx, mc in enumerate(order):
        r = meas[mc]
        length = frac(r["act_dur"]) * 4
        ts = r["timesig"]
        num, den = (int(x) for x in ts.split("/"))
        bar_len = Fraction(num * 4, den)
        score.measures.append(Measure(float(t), float(length), int(r["mn"]), ts,
                                      pickup=(idx == 0 and length < bar_len)))
        for n in notes_by_mc.get(mc, []):
            on = t + frac(n["mc_onset"]) * 4
            dur = frac(n["duration"]) * 4
            grace = bool(n.get("gracenote"))
            tied = (n.get("tied") or "").strip()
            raw.append((float(on), float(dur), int(n["midi"]), int(n["staff"]), int(n["voice"]),
                        int(tied) if tied not in ("", "tied") else None, grace))
        t += length

    # merge ties in time order
    raw.sort(key=lambda x: (x[0], x[2]))
    open_ties: dict[tuple, Note] = {}
    for on, dur, midi, staff, voice, tied, grace in raw:
        key = (staff, midi)
        if tied in (0, -1) and key in open_ties:
            prev = open_ties[key]
            if abs(prev.on + prev.dur - on) < 0.02:
                prev.dur = on + dur - prev.on
                if tied == -1:
                    del open_ties[key]
                continue
        note = Note("Piano" if staff == 1 else "Piano LH", on, dur, midi, 0.45, grace=grace, staff=staff)
        score.notes.append(note)
        if tied == 1 or tied == 0:
            open_ties[key] = note
    return score, ["Piano", "Piano LH"]


# --------------------------------------------------------------------------
# Interpretation helpers
# --------------------------------------------------------------------------


def piano_voicing(notes: list[Note], melody_boost=0.1):
    """Bring out the top line of the right hand and the bass, tuck inner voices."""
    by_on: dict[tuple, list[Note]] = {}
    for n in notes:
        by_on.setdefault((round(n.on, 3), n.staff), []).append(n)
    rh_top = sorted((n for n in notes if n.staff == 1), key=lambda n: n.on)
    # skyline: highest RH note sounding at each onset
    for (on, staff), group in by_on.items():
        group.sort(key=lambda n: n.midi)
        if staff == 1:
            group[-1].vel += melody_boost
            for n in group[:-1]:
                n.vel -= 0.06
        else:
            for n in group[1:]:
                n.vel -= 0.07
    _ = rh_top


def phrase_dynamics(notes: list[Note], measures: list[Measure]):
    """Gentle musical shaping for sources without dynamics: arch over 4-bar
    phrases plus slight metric weight."""
    starts = [m.start for m in measures]
    for n in notes:
        i = max(0, bisect.bisect_right(starts, n.on + 1e-6) - 1)
        m = measures[i]
        phase = ((i % 4) + (n.on - m.start) / max(m.length, 1e-6)) / 4.0
        n.vel += 0.07 * math.sin(math.pi * phase) - 0.02
        if abs(n.on - m.start) < 1e-6:
            n.vel += 0.03


def auto_pedal(notes: list[Note], measures: list[Measure], max_hold=6.0, rh_extra=0.6):
    """Simulate a pianist's sustain pedal: change pedal when the bass changes,
    let bass notes ring to the change, give right-hand notes a little legato."""
    lh = sorted((n for n in notes if n.staff == 2), key=lambda n: (n.on, n.midi))
    changes, cur_pc = [], None
    i = 0
    while i < len(lh):
        on = lh[i].on
        group = [lh[i]]
        while i + 1 < len(lh) and abs(lh[i + 1].on - on) < 1e-6:
            i += 1
            group.append(lh[i])
        low = min(g.midi for g in group)
        if cur_pc is None or low % 12 != cur_pc:
            changes.append(on)
            cur_pc = low % 12
        i += 1
    # also change at every downbeat where the bass is re-struck (avoid mud)
    lh_onsets = {round(n.on, 3) for n in lh}
    for m in measures:
        if round(m.start, 3) in lh_onsets:
            changes.append(m.start)
    changes = sorted(set(round(c, 4) for c in changes))
    if not changes:
        return
    for n in notes:
        j = bisect.bisect_right(changes, n.on + 1e-6)
        nxt = changes[j] if j < len(changes) else n.on + max_hold
        ring = min(nxt - n.on, max_hold)
        if n.staff == 2:
            n.dur = max(n.dur, ring)
        else:
            n.dur = max(n.dur, min(ring, n.dur + rh_extra))


def bass_pad(notes: list[Note], measures: list[Measure], part_name: str, every: float = 2.0, vel=0.32):
    """Lowest note of each `every`-quarter window, held - a soft sustained bass
    line drawn from an arpeggiated texture (used under the harp prelude)."""
    out = []
    for m in measures:
        t = m.start
        while t < m.start + m.length - 1e-6:
            win = [n for n in notes if t - 1e-6 <= n.on < t + every - 1e-6]
            if win:
                low = min(win, key=lambda n: n.midi)
                out.append(Note(part_name, t, every * 0.98, low.midi, vel))
            t += every
    return out


# --------------------------------------------------------------------------
# Hand-written scores (for pieces no corpus has): a tiny text notation
# --------------------------------------------------------------------------
#   parts = {"melody": "@q | F#4 F#4 G4 A4 | A4 G4 F#4 E4 | ..."}
#   token  PITCH[:DUR]   DUR in w h q e s (dot allowed: q.) or quarters (2.5)  r = rest
#          [C4 E4 G4]:h  chord     @q sets the default duration
#   chords = "D D G D | D G D A | ..."  one symbol per beat (DUR suffix ok)
#   realised into __bass / __tenor / __alto voices with smooth voice leading

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
DUR = {"w": 4.0, "h": 2.0, "q": 1.0, "e": 0.5, "s": 0.25}


def pitch_midi(tok: str) -> int:
    m = re.fullmatch(r"([A-G])([#b]*)(-?\d)", tok)
    if not m:
        raise ValueError(f"bad pitch {tok!r}")
    return 12 * (int(m.group(3)) + 1) + PC[m.group(1)] + m.group(2).count("#") - m.group(2).count("b")


def dur_of(tok: str, default: float) -> float:
    if not tok:
        return default
    if tok[0].isdigit():
        return float(tok)  # a length in quarters (e.g. 2.5)
    d = DUR[tok[0]]
    if tok.endswith("."):
        d *= 1.5
    return d


def parse_part(text: str, part: str, staff: int, vel: float) -> list[Note]:
    notes, t, default = [], 0.0, 1.0
    for tok in text.replace("|", " ").split():
        if tok.startswith("@"):
            default = dur_of(tok[1:], 1.0)
            continue
        if tok.startswith("["):
            body, _, d = tok.partition("]")
            d = dur_of(d.lstrip(":"), default)
            for p in body[1:].split():
                notes.append(Note(part, t, d, pitch_midi(p), vel, staff=staff))
            t += d
            continue
        name, _, d = tok.partition(":")
        d = dur_of(d, default)
        if name != "r":
            notes.append(Note(part, t, d, pitch_midi(name), vel, staff=staff))
        t += d
    return notes


CHORD_QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11],
              "dim": [0, 3, 6], "sus4": [0, 5, 7], "sus": [0, 5, 7], "aug": [0, 4, 8], "6": [0, 4, 7, 9]}


def parse_chord(sym: str):
    m = re.fullmatch(r"([A-G][#b]?)([a-z0-9]*)(?:/([A-G][#b]?))?", sym)
    root = PC[m.group(1)[0]] + m.group(1)[1:].count("#") - m.group(1)[1:].count("b")
    pcs = [(root + i) % 12 for i in CHORD_QUAL[m.group(2)]]
    bass = parse_chord_root(m.group(3)) if m.group(3) else root % 12
    return pcs, bass


def parse_chord_root(x):
    return (PC[x[0]] + x[1:].count("#") - x[1:].count("b")) % 12


def realize_chords(text: str, voices, vel=0.4, legato=0.98) -> list[Note]:
    """voices: list of (part name, lo midi, hi midi, role) role in bass/inner."""
    t, default, out = 0.0, 1.0, []
    prev = {v[0]: None for v in voices}
    for tok in text.replace("|", " ").split():
        if tok.startswith("@"):
            default = dur_of(tok[1:], 1.0)
            continue
        sym, _, d = tok.partition(":")
        d = dur_of(d, default)
        if sym == "r":
            t += d
            continue
        pcs, bass_pc = parse_chord(sym)
        used = set()
        for name, lo, hi, role in voices:
            cands = []
            for m in range(lo, hi + 1):
                pc = m % 12
                if role == "bass" and pc != bass_pc:
                    continue
                if role != "bass" and pc not in pcs:
                    continue
                dist = abs(m - prev[name]) if prev[name] is not None else abs(m - (lo + hi) / 2)
                penalty = dist + (4 if pc in used and role != "bass" else 0) + (3 if role != "bass" and pc == bass_pc else 0)
                cands.append((penalty, m))
            if not cands:
                continue
            m = min(cands)[1]
            used.add(m % 12)
            prev[name] = m
            out.append(Note(name, t, d * legato, m, vel, staff=2 if role == "bass" else 1))
        t += d
    return out


def load_hand(spec) -> tuple[Score, list[str]]:
    h = spec["src"][1]
    score = Score()
    num, den = (int(x) for x in h["ts"].split("/"))
    bar = num * 4 / den
    names = []
    for part, (text, staff, vel) in h["parts"].items():
        score.notes.extend(parse_part(text, part, staff, vel))
        names.append(part)
    if "chords" in h:
        score.notes.extend(realize_chords(h["chords"], h.get("voices", [("__bass", 36, 55, "bass"), ("__tenor", 48, 64, "inner"), ("__alto", 57, 72, "inner")]), h.get("chord_vel", 0.4)))
    total = max(n.on + n.dur for n in score.notes)
    pickup = h.get("pickup", 0.0)
    t = 0.0
    mn = 0 if pickup else 1
    if pickup:
        score.measures.append(Measure(0.0, pickup, 0, h["ts"], pickup=True))
        t = pickup
        mn = 1
    while t < total - 1e-6:
        score.measures.append(Measure(t, bar, mn, h["ts"]))
        t += bar
        mn += 1
    return score, names


# --------------------------------------------------------------------------
# Time map: quarters -> seconds
# --------------------------------------------------------------------------


def build_time_map(score: Score, tempo, final_rit=None, fermata_hold=1.8, fermata_part=None, step=1 / 48):
    """tempo: list of (measure_number, qpm, mode) keyframes; mode "ramp" means
    interpolate linearly from the previous keyframe up to this one."""
    keys = sorted(tempo, key=lambda k: k[0])

    def qpm_at_mn(x):
        if x <= keys[0][0]:
            return keys[0][1]
        for a, b in zip(keys, keys[1:]):
            if a[0] <= x < b[0]:
                if len(b) > 2 and b[2] == "ramp":
                    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
                return a[1]
        return keys[-1][1]

    total = score.measures[-1].start + score.measures[-1].length
    m_starts = [m.start for m in score.measures]

    fermatas = []
    for n in score.notes:
        if n.fermata and (fermata_part is None or n.part == fermata_part):
            fermatas.append((n.on, n.on + max(n.dur, 0.5)))
    fermatas.sort()

    def factor_at(q):
        f = 1.0
        for a, b in fermatas:
            if a - 1e-6 <= q < b:
                f = 1.0 / fermata_hold
                break
            if a > q:
                break
        if final_rit:
            span, end_factor = final_rit
            if q > total - span:
                x = (q - (total - span)) / span
                f *= 1.0 + (end_factor - 1.0) * x
        return f

    def qpm_at(q):
        i = max(0, bisect.bisect_right(m_starts, q + 1e-9) - 1)
        m = score.measures[i]
        x = m.mn + (q - m.start) / max(m.length, 1e-6)
        return qpm_at_mn(x) * factor_at(q)

    Q, T = [0.0], [0.0]
    q, t = 0.0, 0.0
    end = total + 16
    while q < end:
        t += step * 60.0 / qpm_at(min(q, total - 1e-6) if q < total else total - 1e-6)
        q += step
        Q.append(q)
        T.append(t)

    def to_sec(x):
        i = bisect.bisect_right(Q, x) - 1
        i = max(0, min(i, len(Q) - 2))
        return T[i] + (T[i + 1] - T[i]) * (x - Q[i]) / (Q[i + 1] - Q[i])

    return to_sec, total


def beat_grid(score: Score, to_sec):
    beats = []
    for i, m in enumerate(score.measures):
        num, den = (int(x) for x in m.ts.split("/"))
        if den == 8 and num % 3 == 0 and num > 3:
            n_beats, blen = num // 3, 1.5
        elif den == 8:
            n_beats, blen = num, 0.5
        elif den == 2:
            n_beats, blen = num, 2.0
        else:
            n_beats, blen = num, 4.0 / den
        bar_len = n_beats * blen
        offset = bar_len - m.length if (m.pickup or (i == 0 and m.length < bar_len - 1e-6)) else 0.0
        for b in range(n_beats):
            pos = b * blen - offset
            if -1e-6 <= pos < m.length - 1e-6:
                beats.append([round(to_sec(m.start + pos), 3), b, n_beats])
    return beats


# --------------------------------------------------------------------------
# Program: interpretation and orchestration of each piece
# --------------------------------------------------------------------------
# section ids (see public/js/scene/layout.js):
#   vn1 vn2 va vc cb fl ob cl bn hn tp timp harp piano
# track keys: part, section, inst, layer (secondary sample set mixed under),
#   gain (linear), transpose (semitones), chairs (subset of the section's
#   seats that play), legato (duration multiplier)

STR4 = ["Violin I", "Violin II", "Viola", "Cello"]


def string_orchestra(names, bass_double=True):
    v1, v2, va, vc = names
    t = [
        dict(part=v1, section="vn1", inst="violin", layer="strings", gain=1.0),
        dict(part=v2, section="vn2", inst="violin", layer="strings", gain=0.8),
        dict(part=va, section="va", inst="viola", layer="strings", gain=0.8),
        dict(part=vc, section="vc", inst="cello", layer="strings", gain=0.9),
    ]
    if bass_double:
        t.append(dict(part=vc, section="cb", inst="contrabass", gain=0.5, transpose=-12, min_dur=0.25, only_below=57, floor=28))
    return t


def string_quartet(names):
    v1, v2, va, vc = names
    return [
        dict(part=v1, section="vn1", inst="violin", gain=1.0, chairs=[0]),
        dict(part=v2, section="vn2", inst="violin", gain=0.8, chairs=[0]),
        dict(part=va, section="va", inst="viola", gain=0.85, chairs=[0]),
        dict(part=vc, section="vc", inst="cello", gain=0.95, chairs=[0]),
    ]


SUSTAINED = {"violin", "viola", "cello", "contrabass", "flute", "oboe", "clarinet", "bassoon", "horn", "trumpet", "choir", "voice"}


def realize(spec, only=None):
    kind = spec["src"][0]
    if kind == "m21":
        score, names = load_music21(spec["src"][1], spec.get("measures"), spec.get("repeats", True), spec.get("default_dyn", 0.45))
    elif kind == "file":
        score, names = load_music21(os.path.join(CACHE, spec["src"][1]), spec.get("measures"), spec.get("repeats", True), spec.get("default_dyn", 0.45))
    elif kind == "hand":
        score, names = load_hand(spec)
    else:
        score, names = load_dcml(spec["src"][1], spec["src"][2])

    # rebase so the first measure starts at 0
    if score.measures:
        s0 = score.measures[0].start
        if abs(s0) > 1e-9:
            for m in score.measures:
                m.start -= s0
            for n in score.notes:
                n.on -= s0

    # assign staffs for piano parts given as separate music21 parts
    if spec.get("piano") and kind in ("m21", "file"):
        pnames = [n for n in names if n.lower().startswith(("piano", "keyboard"))]
        for n in score.notes:
            if n.part in pnames:
                n.staff = 1 if n.part == pnames[0] else 2
    tracks = spec["tracks"](names)
    for t in tracks:
        if t.get("staff"):
            for n in score.notes:
                if n.part == t["part"]:
                    n.staff = t["staff"]
    if spec.get("piano") and kind == "dcml":
        for n in score.notes:
            n.staff = 1 if n.part == "Piano" else 2

    if kind == "dcml":
        phrase_dynamics(score.notes, score.measures)
    if spec.get("piano"):
        piano_notes = [n for n in score.notes if any(t["part"] == n.part and t["inst"] == "piano" for t in tracks)]
        piano_voicing(piano_notes)
        auto_pedal(piano_notes, score.measures)

    extra = spec.get("extra")
    if extra == "bass_pad":
        score.notes.extend(bass_pad([x for x in score.notes if x.part == names[1]], score.measures, "__bass", 2.0, 0.3))
    elif extra == "harp_chords":
        h = spec["src"][1]
        score.notes.extend(realize_chords(h["harp"], [("__harp_b", 36, 52, "bass"), ("__harp_t", 50, 64, "inner"), ("__harp_a", 57, 72, "inner")], 0.45, 0.9))
    elif callable(extra):
        score.notes.extend(extra(score, names))

    to_sec, total_q = build_time_map(
        score, spec["tempo"], spec.get("final_rit"), spec.get("fermata_hold", 1.8),
        fermata_part=None,
    )

    out_tracks = []
    end_time = 0.0
    for t in tracks:
        src = [n for n in score.notes if n.part == t["part"]]
        if not src:
            print(f"   ! {spec['id']}: no notes for part {t['part']!r}")
            continue
        arr = []
        inst = t["inst"]
        legato = t.get("legato", 1.0)
        graces = []
        if "range" in t:
            src = [n for n in src if t["range"][0] <= n.midi <= t["range"][1]]
        if t.get("top") or t.get("bottom"):
            # skyline: only the highest (or lowest) note of each simultaneity
            by_on = {}
            for n in src:
                k = round(n.on, 3)
                if k not in by_on or (n.midi > by_on[k].midi) == bool(t.get("top")):
                    by_on[k] = n
            src = list(by_on.values())
        for n in sorted(src, key=lambda n: (n.on, n.midi)):
            if "only_below" in t and n.midi > t["only_below"]:
                continue  # e.g. basses drop out when the cellos go high
            if "only_above" in t and n.midi < t["only_above"]:
                continue
            midi = n.midi + t.get("transpose", 0)
            if midi < t.get("floor", 0):
                midi = n.midi  # below the instrument: stay in the written octave
            if n.grace:
                graces.append((n, midi))
                continue
            ts = to_sec(n.on)
            te = to_sec(n.on + n.dur)
            d = (te - ts)
            if inst in SUSTAINED:
                d = d * 0.97 * legato if d > 0.35 else d * 0.9
                d = max(d, t.get("min_dur", 0.0))
            elif inst == "harp" or spec.get("harp_ring"):
                d = max(d, 1.2)
            vel = int(max(8, min(127, round(n.vel * 127))))
            arr.extend([round(ts, 3), round(max(0.04, d), 3), midi, vel])
            end_time = max(end_time, ts + d)
        # grace notes: just before their main note
        for g, midi in graces:
            ts = to_sec(g.on) - 0.075
            arr.extend([round(max(0.0, ts), 3), 0.08, midi, int(max(8, min(127, round((g.vel - 0.05) * 127))))])
        if graces:
            quads = [arr[i:i + 4] for i in range(0, len(arr), 4)]
            quads.sort(key=lambda q: (q[0], q[2]))
            arr = [x for q in quads for x in q]
        if not arr:
            continue
        tr = {k: t[k] for k in ("section", "inst", "layer", "gain", "chairs") if k in t}
        tr["name"] = t["part"].lstrip("_")
        tr["notes"] = arr
        out_tracks.append(tr)

    duration = max(end_time, to_sec(total_q)) + 0.2
    beats = beat_grid(score, to_sec)
    piece = {
        "id": spec["id"], "title": spec["title"], "titleKo": spec["titleKo"],
        "composer": spec["composer"], "composerKo": spec["composerKo"], "year": spec["year"],
        "ensembleKo": spec["ensembleKo"], "conducted": spec.get("conducted", True),
        "mood": spec.get("mood", "calm"), "finale": spec.get("finale", False),
        "duration": round(duration, 2), "beats": beats, "tracks": out_tracks,
        "source": {"m21": "music21 corpus", "dcml": f"DCML {spec['src'][1] if kind == 'dcml' else ''} (CC BY-NC-SA 4.0)",
                   "file": f"{str(spec['src'][1]).split('/')[0]} (CC BY-NC-SA 4.0)", "hand": "arranged for Forest Philharmonic"}[kind],
    }
    return piece


INDEX_KEYS = ("id", "title", "titleKo", "composer", "composerKo", "year", "ensembleKo", "duration", "mood", "finale", "conducted")


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for r in DCML_REPOS:
        dest = os.path.join(CACHE, r)
        if os.path.isdir(dest):
            continue
        print("cloning", r)
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"https://github.com/DCMLab/{r}.git", dest], check=True)
    for r in KERN_REPOS:
        dest = os.path.join(CACHE, r)
        if os.path.isdir(dest):
            continue
        print("cloning", r)
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"https://github.com/craigsapp/{r}.git", dest], check=True)


def main(argv):
    from program import PROGRAM
    if "--fetch" in argv:
        fetch()
        argv = [a for a in argv if a != "--fetch"]
    os.makedirs(OUT, exist_ok=True)
    index = []
    for spec in PROGRAM:
        if argv and not any(a in spec["id"] for a in argv):
            idx_path = os.path.join(OUT, f"{spec['id']}.json")
            if os.path.exists(idx_path):
                with open(idx_path) as f:
                    p = json.load(f)
                index.append({k: p.get(k) for k in INDEX_KEYS})
            continue
        piece = realize(spec)
        n_notes = sum(len(t["notes"]) // 4 for t in piece["tracks"])
        print(f"{piece['id']:32s} {piece['duration']/60:5.1f} min  {n_notes:5d} notes  "
              f"{len(piece['tracks'])} tracks  {len(piece['beats'])} beats")
        with open(os.path.join(OUT, f"{piece['id']}.json"), "w") as f:
            json.dump(piece, f, ensure_ascii=False, separators=(",", ":"))
        index.append({k: piece.get(k) for k in INDEX_KEYS})
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
