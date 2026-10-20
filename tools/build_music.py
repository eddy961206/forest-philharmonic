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
    from music21 import articulations, corpus, dynamics, expressions, meter

    s = corpus.parse(path)
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
            grace = bool(n["gracenote"])
            tied = n["tied"].strip()
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


PROGRAM = [
    dict(
        id="bach-prelude-c", src=("m21", "bach/bwv846.mxl"),
        title="Prelude in C major, BWV 846", titleKo="평균율 클라비어곡집 1권 — 전주곡 C장조",
        composer="J. S. Bach", composerKo="바흐", year=1722, ensembleKo="하프 · 첼로",
        tempo=[(1, 58), (31, 58), (33, 50, "ramp"), (35, 40, "ramp")], final_rit=(4, 0.7),
        conducted=False, harp_ring=True,
        tracks=lambda n: [
            dict(part=n[0], section="harp", inst="harp", gain=0.95),
            dict(part=n[1], section="harp", inst="harp", gain=0.95),
            dict(part="__bass", section="vc", inst="cello", gain=0.55, chairs=[0], layer="strings"),
        ],
        extra=lambda s, n: bass_pad([x for x in s.notes if x.part == n[1]], s.measures, "__bass", 2.0, 0.3),
    ),
    dict(
        id="mozart-k458-adagio", src=("m21", "mozart/k458/movement3.mxl"),
        title='String Quartet No. 17 "Hunt", K. 458 — III. Adagio', titleKo="현악 4중주 17번 「사냥」 — 3악장 아다지오",
        composer="W. A. Mozart", composerKo="모차르트", year=1784, ensembleKo="현악 합주",
        tempo=[(1, 40)], final_rit=(6, 0.62), tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="debussy-clair-de-lune", src=("dcml", "debussy_suite_bergamasque", "l075-03_suite_clair"),
        title="Suite bergamasque — III. Clair de lune", titleKo="베르가마스크 모음곡 — 달빛",
        composer="Claude Debussy", composerKo="드뷔시", year=1905, ensembleKo="피아노",
        tempo=[(1, 52), (13, 52), (14.6, 44, "ramp"), (15, 56), (19, 56), (24, 66, "ramp"), (25, 62),
               (26.5, 50, "ramp"), (27, 70), (36, 74, "ramp"), (37, 78), (41, 84, "ramp"), (42, 76),
               (42.9, 62, "ramp"), (43, 62), (50, 56, "ramp"), (51, 52), (65, 50, "ramp"), (72, 34, "ramp")],
        conducted=False, piano=True,
        tracks=lambda n: [dict(part=n[0], section="piano", inst="piano", gain=1.0),
                          dict(part=n[1], section="piano", inst="piano", gain=1.0)],
    ),
    dict(
        id="handel-lascia", src=("m21", "handel/rinaldo/Lascia_chio_pianga.mxl"), measures=(13, 54),
        title="Rinaldo — \"Lascia ch'io pianga\"", titleKo="오페라 「리날도」 — 울게 하소서",
        composer="G. F. Handel", composerKo="헨델", year=1711, ensembleKo="오보에 · 하프 · 현악 저음",
        tempo=[(13, 54)], final_rit=(5, 0.6),
        tracks=lambda n: [
            dict(part=n[0], section="ob", inst="oboe", gain=1.0, legato=1.02),
            dict(part=n[1], section="harp", inst="harp", gain=0.55),
            dict(part=n[2], section="vc", inst="cello", layer="strings", gain=0.75),
            dict(part=n[2], section="cb", inst="contrabass", gain=0.45, transpose=-12, only_below=57, floor=28),
        ],
    ),
    dict(
        id="bach-brich-an", src=("m21", "bach/bwv248.12-2.mxl"),
        title='Christmas Oratorio — Chorale "Brich an, o schönes Morgenlicht"', titleKo="크리스마스 오라토리오 — 코랄 「밝아오라, 아름다운 아침 빛이여」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="목관 · 호른 · 현악",
        tempo=[(1, 60)], final_rit=(2, 0.8), fermata_hold=2.0, default_dyn=0.55,
        tracks=lambda n: [
            dict(part=n[0], section="vn1", inst="violin", layer="strings", gain=0.85),
            dict(part=n[0], section="ob", inst="oboe", gain=0.7),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.7),
            dict(part=n[1], section="cl", inst="clarinet", gain=0.6),
            dict(part=n[2], section="va", inst="viola", layer="strings", gain=0.75),
            dict(part=n[2], section="hn", inst="horn", gain=0.5, chairs=[0]),
            dict(part=n[3], section="vc", inst="cello", layer="strings", gain=0.8),
            dict(part=n[3], section="bn", inst="bassoon", gain=0.55),
            dict(part=n[3], section="cb", inst="contrabass", gain=0.45, transpose=-12, only_below=57, floor=28),
        ],
    ),
    dict(
        id="haydn-op74-1-andantino", src=("m21", "haydn/opus74no1/movement2.mxl"),
        title="String Quartet Op. 74 No. 1 — II. Andantino grazioso", titleKo="현악 4중주 Op.74-1 — 2악장 안단티노 그라치오소",
        composer="Joseph Haydn", composerKo="하이든", year=1793, ensembleKo="현악 4중주",
        tempo=[(1, 78)], final_rit=(3, 0.6), conducted=False, tracks=lambda n: string_quartet(n),
    ),
    dict(
        id="schumann-traumerei", src=("dcml", "schumann_kinderszenen", "n07"),
        title="Kinderszenen Op. 15 — No. 7 Träumerei", titleKo="어린이 정경 — 7번 트로이메라이 (꿈)",
        composer="Robert Schumann", composerKo="슈만", year=1838, ensembleKo="피아노",
        tempo=[(0, 54), (7.5, 54), (8.9, 40, "ramp"), (9, 54), (15.5, 54), (16.9, 38, "ramp"), (17, 54),
               (21.5, 52), (24, 30, "ramp")],
        conducted=False, piano=True,
        tracks=lambda n: [dict(part=n[0], section="piano", inst="piano", gain=1.0),
                          dict(part=n[1], section="piano", inst="piano", gain=1.0)],
    ),
    dict(
        id="schubert-lindenbaum", src=("m21", "schubert/Lindenbaum.xml"),
        title="Winterreise D. 911 — No. 5 Der Lindenbaum", titleKo="겨울 나그네 — 5번 보리수",
        composer="Franz Schubert", composerKo="슈베르트", year=1827, ensembleKo="호른 · 피아노",
        tempo=[(1, 62)], final_rit=(6, 0.62), conducted=False, piano=True,
        tracks=lambda n: [
            dict(part=n[0], section="hn", inst="horn", gain=1.0, chairs=[0], legato=1.03),
            dict(part=n[1], section="piano", inst="piano", gain=0.8, staff=1),
            dict(part=n[2], section="piano", inst="piano", gain=0.8, staff=2),
        ],
    ),
    dict(
        id="liliuokalani-aloha-oe", src=("m21", "liliuokalani/aloha_oe.mxl"),
        title="Aloha ʻOe", titleKo="알로하 오에",
        composer="Liliʻuokalani", composerKo="릴리우오칼라니", year=1878, ensembleKo="플루트 · 현악 · 하프",
        tempo=[(1, 72)], final_rit=(4, 0.6), fermata_hold=1.7,
        tracks=lambda n: [
            dict(part=n[4], section="fl", inst="flute", gain=1.0, legato=1.02),
            dict(part=n[0], section="vn1", inst="violin", layer="strings", gain=0.8),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.6),
            dict(part=n[2], section="va", inst="viola", layer="strings", gain=0.6),
            dict(part=n[3], section="vc", inst="cello", layer="strings", gain=0.7),
            dict(part=n[3], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[5], section="harp", inst="harp", gain=0.6),
            dict(part=n[6], section="harp", inst="harp", gain=0.6),
        ],
    ),
    dict(
        id="tchaikovsky-june", src=("dcml", "tchaikovsky_seasons", "op37a06"),
        title="The Seasons Op. 37a — June: Barcarolle", titleKo="사계 — 6월: 뱃노래",
        composer="P. I. Tchaikovsky", composerKo="차이콥스키", year=1876, ensembleKo="피아노",
        tempo=[(1, 70), (11.5, 70), (12, 74), (19, 74), (20, 66, "ramp"), (21, 70), (32, 78), (39, 84, "ramp"),
               (40, 120), (49, 120), (50.9, 92, "ramp"), (52, 96), (53, 70), (95, 66), (99, 44, "ramp")],
        conducted=False, piano=True,
        tracks=lambda n: [dict(part=n[0], section="piano", inst="piano", gain=1.0),
                          dict(part=n[1], section="piano", inst="piano", gain=1.0)],
    ),
    dict(
        id="corelli-op3-1-grave", src=("m21", "corelli/opus3no1/1grave.xml"),
        title="Trio Sonata Op. 3 No. 1 — I. Grave", titleKo="트리오 소나타 Op.3-1 — 1악장 그라베",
        composer="Arcangelo Corelli", composerKo="코렐리", year=1689, ensembleKo="바이올린 2 · 첼로 · 하프 통주저음",
        tempo=[(1, 48)], final_rit=(3, 0.6), conducted=False, default_dyn=0.5,
        tracks=lambda n: [
            dict(part=n[0], section="vn1", inst="violin", gain=1.0, chairs=[0]),
            dict(part=n[1], section="vn2", inst="violin", gain=0.9, chairs=[0]),
            dict(part=n[2], section="vc", inst="cello", gain=0.9, chairs=[0]),
            dict(part=n[2], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[2], section="harp", inst="harp", gain=0.45),
        ],
    ),
    dict(
        id="mozart-k80-adagio", src=("m21", "mozart/k80/movement1.mxl"),
        title="String Quartet No. 1, K. 80 — I. Adagio", titleKo="현악 4중주 1번 K.80 — 1악장 아다지오",
        composer="W. A. Mozart", composerKo="모차르트", year=1770, ensembleKo="현악 합주",
        tempo=[(1, 54)], final_rit=(4, 0.62), repeats=False, tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="grieg-notturno", src=("dcml", "grieg_lyric_pieces", "op54n04"),
        title="Lyric Pieces Op. 54 — No. 4 Notturno", titleKo="서정 소품집 Op.54 — 4번 녹턴",
        composer="Edvard Grieg", composerKo="그리그", year=1891, ensembleKo="피아노",
        tempo=[(1, 84), (13, 84), (14.9, 70, "ramp"), (15, 84), (21, 96), (30, 96), (31.9, 76, "ramp"),
               (34, 84), (52, 84), (53.9, 72, "ramp"), (55, 82), (59, 74), (61, 56), (66, 40, "ramp")],
        conducted=False, piano=True,
        tracks=lambda n: [dict(part=n[0], section="piano", inst="piano", gain=1.0),
                          dict(part=n[1], section="piano", inst="piano", gain=1.0)],
    ),
    dict(
        id="bach-wir-singen", src=("m21", "bach/bwv248.23-2.mxl"),
        title='Christmas Oratorio — Chorale "Wir singen dir in deinem Heer"', titleKo="크리스마스 오라토리오 — 목가풍 코랄 「우리는 주님께 노래하네」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="플루트 · 오보에 · 현악 · 바순",
        tempo=[(1, 66)], final_rit=(3, 0.7), fermata_hold=1.6, default_dyn=0.55,
        tracks=lambda n: [
            dict(part=n[0], section="fl", inst="flute", gain=0.85),
            dict(part=n[1], section="ob", inst="oboe", gain=0.75),
            dict(part=n[2], section="cl", inst="clarinet", gain=0.7),
            dict(part=n[3], section="vn1", inst="violin", layer="strings", gain=0.85),
            dict(part=n[4], section="vn2", inst="violin", layer="strings", gain=0.65),
            dict(part=n[5], section="va", inst="viola", layer="strings", gain=0.65),
            dict(part=n[6], section="vc", inst="cello", layer="strings", gain=0.75),
            dict(part=n[6], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[7], section="bn", inst="bassoon", gain=0.5, staff_low=True),
        ],
    ),
    dict(
        id="beethoven-pathetique-adagio", src=("dcml", "beethoven_piano_sonatas", "08-2"),
        title='Piano Sonata No. 8 "Pathétique" — II. Adagio cantabile', titleKo="피아노 소나타 8번 「비창」 — 2악장 아다지오 칸타빌레",
        composer="L. van Beethoven", composerKo="베토벤", year=1798, ensembleKo="피아노",
        tempo=[(1, 34), (8.5, 34), (8.95, 28, "ramp"), (9, 34), (16.5, 34), (16.95, 28, "ramp"), (17, 36),
               (28, 36), (28.9, 30, "ramp"), (29, 34), (36.5, 34), (36.95, 28, "ramp"), (37, 38), (50, 36),
               (51, 34), (66, 34), (73, 24, "ramp")],
        conducted=False, piano=True,
        tracks=lambda n: [dict(part=n[0], section="piano", inst="piano", gain=1.0),
                          dict(part=n[1], section="piano", inst="piano", gain=1.0)],
    ),
    dict(
        id="beethoven-op59-2-molto-adagio", src=("m21", "beethoven/opus59no2/movement2.mxl"),
        title='String Quartet Op. 59 No. 2 "Razumovsky" — II. Molto adagio', titleKo="현악 4중주 「라주모프스키」 2번 — 2악장 몰토 아다지오",
        composer="L. van Beethoven", composerKo="베토벤", year=1806, ensembleKo="현악 합주",
        tempo=[(1, 50)], final_rit=(6, 0.6), tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="bach-nun-seid-ihr", src=("m21", "bach/bwv248.64-6.mxl"),
        title='Christmas Oratorio — Final Chorale "Nun seid ihr wohl gerochen"', titleKo="크리스마스 오라토리오 — 피날레 코랄 「이제 너희는 원수를 갚았도다」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="관현악 총주 (트럼펫 · 팀파니)",
        tempo=[(1, 88)], final_rit=(4, 0.62), fermata_hold=1.12, default_dyn=0.74,
        tracks=lambda n: [
            dict(part=n[0], section="tp", inst="trumpet", gain=0.75),
            dict(part=n[1], section="hn", inst="horn", gain=0.55, chairs=[0]),
            dict(part=n[2], section="hn", inst="horn", gain=0.5, chairs=[1]),
            dict(part=n[3], section="timp", inst="timpani", gain=0.8),
            dict(part=n[4], section="ob", inst="oboe", gain=0.65),
            dict(part=n[6], section="vn1", inst="violin", layer="strings", gain=0.75),
            dict(part=n[7], section="vn2", inst="violin", layer="strings", gain=0.65),
            dict(part=n[8], section="va", inst="viola", layer="strings", gain=0.6),
            dict(part=n[9], section="fl", inst="flute", gain=0.85, legato=1.02),
            dict(part=n[10], section="cl", inst="clarinet", gain=0.55),
            dict(part=n[11], section="bn", inst="bassoon", gain=0.5),
            dict(part=n[13], section="vc", inst="cello", layer="strings", gain=0.8),
            dict(part=n[13], section="cb", inst="contrabass", gain=0.5, transpose=-12, only_below=57, floor=28),
        ],
    ),
]

SUSTAINED = {"violin", "viola", "cello", "contrabass", "flute", "oboe", "clarinet", "bassoon", "horn", "trumpet"}


def realize(spec, only=None):
    kind = spec["src"][0]
    if kind == "m21":
        score, names = load_music21(spec["src"][1], spec.get("measures"), spec.get("repeats", True), spec.get("default_dyn", 0.45))
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
    for n in score.notes:
        if spec.get("piano") and kind == "m21":
            n.staff = 1
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

    if "extra" in spec:
        score.notes.extend(spec["extra"](score, names))

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
        for n in sorted(src, key=lambda n: (n.on, n.midi)):
            if "only_below" in t and n.midi > t["only_below"]:
                continue  # e.g. basses drop out when the cellos go high
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
        tr = {k: t[k] for k in ("section", "inst", "layer", "gain", "chairs") if k in t}
        tr["name"] = t["part"] if not t["part"].startswith("__") else "bass"
        tr["notes"] = arr
        out_tracks.append(tr)

    duration = max(end_time, to_sec(total_q)) + 0.2
    beats = beat_grid(score, to_sec)
    piece = {
        "id": spec["id"], "title": spec["title"], "titleKo": spec["titleKo"],
        "composer": spec["composer"], "composerKo": spec["composerKo"], "year": spec["year"],
        "ensembleKo": spec["ensembleKo"], "conducted": spec.get("conducted", True),
        "duration": round(duration, 2), "beats": beats, "tracks": out_tracks,
        "source": "music21 corpus" if kind == "m21" else f"DCML {spec['src'][1]} (CC BY-NC-SA 4.0)",
    }
    return piece


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for r in DCML_REPOS:
        dest = os.path.join(CACHE, r)
        if os.path.isdir(dest):
            continue
        print("cloning", r)
        subprocess.run(["git", "clone", "-q", "--depth", "1", f"https://github.com/DCMLab/{r}.git", dest], check=True)


def main(argv):
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
                index.append({k: p[k] for k in ("id", "title", "titleKo", "composer", "composerKo", "year", "ensembleKo", "duration")})
            continue
        piece = realize(spec)
        n_notes = sum(len(t["notes"]) // 4 for t in piece["tracks"])
        print(f"{piece['id']:32s} {piece['duration']/60:5.1f} min  {n_notes:5d} notes  "
              f"{len(piece['tracks'])} tracks  {len(piece['beats'])} beats")
        with open(os.path.join(OUT, f"{piece['id']}.json"), "w") as f:
            json.dump(piece, f, ensure_ascii=False, separators=(",", ":"))
        index.append({k: piece[k] for k in ("id", "title", "titleKo", "composer", "composerKo", "year", "ensembleKo", "duration")})
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
