"""The concert programme: which scores, how they are interpreted, and which
animal plays what. Used by build_music.py.

Section ids (public/js/layout.js):
  vn1 vn2 va vc cb fl ob cl bn hn tp timp harp piano choir
Track keys:
  part, section, inst, layer (second sample set under the first), gain,
  transpose, chairs (subset of a section's seats), legato, staff,
  range=(lo, hi) midi filter, top/bottom (skyline of simultaneities),
  only_below/only_above, floor, min_dur
"""

# ----------------------------------------------------------- helpers

def string_orchestra(names, bass_double=True, gain=1.0):
    v1, v2, va, vc = names
    t = [
        dict(part=v1, section="vn1", inst="violin", layer="strings", gain=1.0 * gain),
        dict(part=v2, section="vn2", inst="violin", layer="strings", gain=0.8 * gain),
        dict(part=va, section="va", inst="viola", layer="strings", gain=0.8 * gain),
        dict(part=vc, section="vc", inst="cello", layer="strings", gain=0.9 * gain),
    ]
    if bass_double:
        t.append(dict(part=vc, section="cb", inst="contrabass", gain=0.5 * gain, transpose=-12, min_dur=0.25, only_below=57, floor=28))
    return t


def string_quartet(names):
    v1, v2, va, vc = names
    return [
        dict(part=v1, section="vn1", inst="violin", gain=1.0, chairs=[0]),
        dict(part=v2, section="vn2", inst="violin", gain=0.8, chairs=[0]),
        dict(part=va, section="va", inst="viola", gain=0.85, chairs=[0]),
        dict(part=vc, section="vc", inst="cello", gain=0.95, chairs=[0]),
    ]


def piano_dcml(n):
    return [dict(part=n[0], section="piano", inst="piano", gain=1.0),
            dict(part=n[1], section="piano", inst="piano", gain=1.0)]


def piano_kern(n):
    # humdrum spines run bass -> treble: n[0] is the left hand
    return [dict(part=n[1], section="piano", inst="piano", gain=1.0, staff=1),
            dict(part=n[0], section="piano", inst="piano", gain=1.0, staff=2)]


# SATB chorale: choir + the orchestra doubling (colla parte)
def chorale(n, choir_gain=0.9, orch=True):
    s, a, t, b = n[:4]
    tr = [
        dict(part=s, section="choir", inst="choir", gain=choir_gain, chairs=[0, 1, 2]),
        dict(part=a, section="choir", inst="choir", gain=choir_gain * 0.85, chairs=[3, 4, 5]),
        dict(part=t, section="choir", inst="voice", gain=choir_gain * 0.8, chairs=[6, 7, 8]),
        dict(part=b, section="choir", inst="voice", gain=choir_gain * 0.85, chairs=[9, 10, 11]),
    ]
    if orch:
        tr += [
            dict(part=s, section="vn1", inst="violin", layer="strings", gain=0.6),
            dict(part=s, section="ob", inst="oboe", gain=0.45),
            dict(part=a, section="vn2", inst="violin", layer="strings", gain=0.5),
            dict(part=t, section="va", inst="viola", layer="strings", gain=0.5),
            dict(part=b, section="vc", inst="cello", layer="strings", gain=0.6),
            dict(part=b, section="bn", inst="bassoon", gain=0.4),
            dict(part=b, section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
        ]
    return tr


# piano score played by the string orchestra: melody on top, chords split by register
def piano_to_strings(rh, lh, melody_inst=None, melody_section="vn1"):
    tr = [
        dict(part=rh, section=melody_section, inst={"vn1": "violin", "ob": "oboe", "fl": "flute", "cl": "clarinet", "hn": "horn"}[melody_section],
             layer="strings" if melody_section == "vn1" else None, gain=1.0, top=True),
        dict(part=rh, section="vn2", inst="violin", layer="strings", gain=0.6, range=(55, 84), bottom=True),
        dict(part=lh, section="vn2", inst="violin", layer="strings", gain=0.5, range=(60, 90)),
        dict(part=lh, section="va", inst="viola", layer="strings", gain=0.7, range=(48, 66)),
        dict(part=lh, section="vc", inst="cello", layer="strings", gain=0.8, range=(36, 55)),
        dict(part=lh, section="cb", inst="contrabass", gain=0.5, range=(28, 50), bottom=True, transpose=-12, floor=28),
    ]
    if melody_inst:
        tr.append(dict(part=rh, section=melody_inst[0], inst=melody_inst[1], gain=melody_inst[2], top=True))
    return [t for t in tr if t.get("layer", 1) is not None or True]


# ----------------------------------------------------------- hand-written scores

def _ode_to_joy():
    mel = ("F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4:q. E4:e E4:h | "
           "F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:q. D4:e D4:h | "
           "E4 E4 F#4 D4 | E4 F#4:e G4:e F#4 D4 | E4 F#4:e G4:e F#4 E4 | D4 E4 A3:h | "
           "F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:q. D4:e D4:h | ")
    ch = ("D D G D | D G D A | D D A D | Bm A A A | "
          "D D G D | D G D A | D D A D | A A D D | "
          "A A D Bm | A D D Bm | A D D A | D A A A | "
          "D D G D | D G D A | D D A D | A A D D | ")
    rest16 = "r:w " * 16
    verse2 = mel.replace("D4:h |", "D4:h |")  # same tune, tutti
    coda_mel = "D4:w | D4:w |"
    coda_ch = "D:w | D:w |"
    timp = rest16 + ("D3 r A2 r | " * 15) + "D3 D3 D3 D3 | " + "D3:w | D3:w |"
    return dict(
        ts="4/4",
        parts={
            "mel1": ("@q " + mel, 1, 0.55),
            "mel2": ("@q " + rest16 + verse2 + coda_mel, 1, 0.8),
            "mel2hi": ("@q " + rest16 + verse2.replace("4", "5").replace("A3", "A4") + coda_mel.replace("4", "5"), 1, 0.7),
            "timp": ("@q " + timp, 2, 0.75),
        },
        chords="@q " + ch + ch + coda_ch,
        voices=[("__bass", 38, 55, "bass"), ("__tenor", 50, 64, "inner"), ("__alto", 57, 71, "inner")],
        chord_vel=0.5,
    )


def _fur_elise():
    rh, lh = [], []
    def bar(r, l):
        rh.append(r)
        lh.append(l)
    m1 = ("E5 D#5 E5 B4 D5 C5", "r r r r r r")
    m2 = ("A4 r r C4 E4 A4", "A2 E3 A3 r r r")
    m3 = ("B4 r r E4 G#4 B4", "E2 E3 G#3 r r r")
    m4 = ("C5 r r E4 E5 D#5", "A2 E3 A3 r r r")
    m7 = ("B4 r r E4 C5 B4", "E2 E3 G#3 r r r")
    m8a = ("A4 r r r E5 D#5", "A2 E3 A3 r r r")
    m8b = ("A4 r r B4 C5 D5", "A2 E3 A3 r r r")
    m9 = ("E5 r r G4 F5 E5", "C3 G3 C4 r r r")
    m10 = ("D5 r r F4 E5 D5", "G2 G3 B3 r r r")
    m11 = ("C5 r r E4 D5 C5", "A2 E3 A3 r r r")
    m12 = ("B4 r r E4 E5 r", "E2 E3 E4 r r r")
    m13 = ("E5 D#5 E5 D#5 E5 D#5", "r r r r r r")
    m17 = ("A4 r r r E5 D#5", "A2 E3 A3 r r r")
    mend = ("A4 r r r r r", "A2 E3 A3 r r r")
    a_section = [m1, m2, m3, m4, m1, m2, m7]
    bar("r r r r E5 D#5", "r r r r r r")
    for rep in range(2):
        for m in a_section:
            bar(*m)
        bar(*(m8a if rep == 0 else m8b))
    for m in [m9, m10, m11, m12, m13, m1, m2, m7, m17]:
        bar(*m)
    for m in a_section:
        bar(*m)
    bar(*m8b)
    for m in [m9, m10, m11, m12, m13, m1, m2, m7, mend]:
        bar(*m)
    return dict(
        ts="3/8", pickup=0.75,
        parts={"rh": ("@s " + " | ".join(rh), 1, 0.42), "lh": ("@s " + " | ".join(lh), 2, 0.36)},
    )


def _greensleeves():
    verse = ("C5:q D5:e E5:q F5:e | E5:q D5:e B4:q G4:e | A4:q B4:e C5:q A4:e | A4:q G#4:e A4:q B4:e | G#4:q. E4:q A4:e | "
             "C5:q D5:e E5:q F5:e | E5:q D5:e B4:q G4:e | A4:q B4:e C5:q B4:e | A4:q G#4:e F#4:q G#4:e | A4:q. A4:q. | ")
    chorus = ("G5:q. G5:q F#5:e | E5:q D5:e B4:q G4:e | A4:q B4:e C5:q A4:e | A4:q G#4:e A4:q B4:e | G#4:q. E4:q. | "
              "G5:q. G5:q F#5:e | E5:q D5:e B4:q G4:e | A4:q B4:e C5:q B4:e | A4:q G#4:e F#4:q G#4:e | A4:q. A4:q. | ")
    vch = "Am:q. Am | G G | Am Am | E E | E E | Am Am | G G | Am Am | E E | Am Am | "
    cch = "C:q. C | G G | Am Am | E E | E E | C C | G G | Am Am | E E | Am Am | "
    mel = "r:e | " + verse + chorus + verse + chorus
    harp = "r:e | " + vch + cch + vch + cch
    return dict(
        ts="6/8", pickup=0.5,
        parts={"mel": ("@q " + mel, 1, 0.55)},
        chords="r:e | " + vch + cch + vch + cch,
        voices=[("__bass", 36, 52, "bass"), ("__tenor", 48, 62, "inner"), ("__alto", 55, 69, "inner")],
        chord_vel=0.34,
        harp=harp,
    )


def _amazing_grace():
    # New Britain (Southern Harmony, 1835), G major. Three verses: the flute
    # alone over the harp; the choir with the strings; everyone, the horn
    # on the tune, the timpani underneath.
    bars = ["G4:h B4:e G4:e", "B4:h A4:q", "G4:h E4:q", "D4:h D4:q", "G4:h B4:e G4:e", "B4:h A4:q",
            "D5:h B4:q", "D5:q. B4:e D5:e B4:e", "G4:h D4:q", "E4:q. G4:e G4:e E4:e", "D4:h D4:q",
            "G4:h B4:e G4:e", "B4:h A4:q"]
    chords = ["G:h G/B:q", "G/D:h D7:q", "Em:h C:q", "G:h G:q", "G:h G/B:q", "G/D:h D7/C:q", "G/B:h G:q",
              "G:h G:q", "G/B:h G/B:q", "C:h C:q", "G:h G/B:q", "Em:h G/D:q", "G/D:h D7:q"]
    rest = "r:h."
    def verse(last):  # the tune; the last bar holds (or leads into the next verse)
        return " | ".join(bars) + (" | G4:h." if last else " | G4:h D4:q")
    def harm(last):
        return " | ".join(chords) + (" | G:h." if last else " | G:h G:q")
    def silent():
        return " | ".join([rest] * 14)
    pick = "D4:q | "
    v1 = pick + verse(False) + " | " + silent() + " | " + silent()
    sop = "r:q | " + silent() + " | " + verse(False) + " | " + verse(True)
    hn3 = "r:q | " + silent() + " | " + silent() + " | " + verse(True)
    ch = "r:q | " + " | ".join([rest] * 14) + " | " + harm(False) + " | " + harm(True)
    hp = "G:q | " + harm(False) + " | " + " | ".join([rest] * 14) + " | " + harm(True)
    timp = "r:q | " + silent() + " | " + silent() + " | " + " | ".join(
        ["G2:h r:q", "D2:h r:q", "r:h.", "G2:h r:q", "G2:h r:q", "D2:h r:q", "G2:h r:q",
         "G2:h r:q", "r:h.", "r:h.", "G2:h r:q", "r:h.", "D2:h D2:q", "G2:h."])
    return dict(
        ts="3/4", pickup=1.0,
        parts={"v1": ("@q " + v1, 1, 0.5), "sop": ("@q " + sop, 1, 0.55), "hn3": ("@q " + hn3, 1, 0.6),
               "timp": ("@q " + timp, 2, 0.5)},
        chords="@q " + ch,
        voices=[("__bass", 38, 55, "bass"), ("__tenor", 48, 64, "inner"), ("__alto", 55, 69, "inner")],
        chord_vel=0.42,
        harp="@q " + hp,
    )


def _pomp():
    # Elgar, Pomp and Circumstance March No. 1 (1901): the trio - the tune
    # later sung as "Land of Hope and Glory" - in G, twice. First the strings
    # alone, broad and noble (as Elgar scores it); then everyone: trumpets,
    # choir and the whole orchestra, the timpani underneath.
    first = "G5:h F#5:e G5:e A5:q E5:h D5:h C5:h B4:e C5:e D5:q A4:w B4:h C#5:e D5:q E5:e A5:h D5:h G5:2.5 F#5:q E5:e D5:3.5 r:e G5:h F#5:e G5:e A5:q E5:h D5:h C5:h B4:e C5:e D5:q A4:w B4:h C#5:e D5:q E5:e A5:h D5:h C6:h C6:e B5:q A5:e B5:w E5:h F#5:e G5:q A5:e D5:h G5:h G4:h C5:e B4:q A4:e G4:w"
    second = "G5:h F#5:e G5:e A5:q E5:h D5:h C5:h B4:e C5:e D5:q A4:3.5 r:e B4:h C#5:e D5:q E5:e A5:h D5:h G5:h G5:e F#5:q E5:e D5:w G5:h F#5:e G5:e A5:q E5:h D5:h C5:h B4:e C5:e D5:q A4:w B4:h C#5:e D5:q E5:e A5:h D5:h C6:h C6:e B5:q A5:e B5:w E5:h F#5:e G5:q A5:e D5:h G5:h G4:h C5:e B4:q A4:e G4:3.5 r:e"
    harm = ["G", "D7/F#", "C", "G/B", "Am", "G/D", "D", "D7",
            "G", "A7", "D", "Bm", "C", "D/A", "D", "D",
            "G", "D7/F#", "C", "G/B", "Am", "G/D", "D", "D7",
            "G", "A7", "D", "Bm", "Am", "D7", "G", "G",
            "C", "D7", "G/B", "C", "G/D", "D7", "G", "G"]
    once = " | ".join(harm)
    rests = " | ".join(["r:h"] * 40)
    drums = {1: "G2", 7: "D2", 9: "G2", 11: "D2", 15: "D2", 17: "G2", 23: "D2", 25: "G2", 27: "D2", 31: "G2", 33: "C3", 35: "G2", 37: "D2"}
    timp = " | ".join(f"{drums[b]}:q r:q" if b in drums else "r:h" for b in range(1, 39)) + " | G2:e G2:e G2:e G2:e | G2:h"
    return dict(
        ts="2/4",
        parts={"m1": ("@q " + first + " | " + rests, 1, 0.55), "m2": ("@q " + rests + " | " + second, 1, 0.72),
               "timp": ("@q " + rests + " | " + timp, 2, 0.7)},
        chords="@h " + once + " | " + once,
        voices=[("__bass", 36, 52, "bass"), ("__tenor", 48, 62, "inner"), ("__alto", 55, 69, "inner")],
        chord_vel=0.45,
        harp="@h " + rests + " | " + once,
    )


# ----------------------------------------------------------- the programme
# Order = concert order. Famous pieces come first; moods drive lights & FX.

PROGRAM = [
    dict(
        id="beethoven-ode-to-joy", src=("hand", _ode_to_joy()),
        title='Symphony No. 9 — "Ode to Joy" (arr.)', titleKo="교향곡 9번 「합창」 — 환희의 송가 (편곡)",
        composer="L. van Beethoven", composerKo="베토벤", year=1824, ensembleKo="관현악 · 합창",
        tempo=[(1, 112)], final_rit=(6, 0.6), mood="grand", finale=True,
        tracks=lambda n: [
            dict(part="mel1", section="vn1", inst="violin", layer="strings", gain=0.9),
            dict(part="mel1", section="ob", inst="oboe", gain=0.5),
            dict(part="mel1", section="cl", inst="clarinet", gain=0.4),
            dict(part="mel2", section="vn1", inst="violin", layer="strings", gain=1.0),
            dict(part="mel2hi", section="fl", inst="flute", gain=0.8),
            dict(part="mel2", section="ob", inst="oboe", gain=0.6),
            dict(part="mel2", section="tp", inst="trumpet", gain=0.75),
            dict(part="mel2", section="choir", inst="choir", gain=1.0, chairs=[0, 1, 2]),
            dict(part="mel2", section="choir", inst="voice", gain=0.7, chairs=[6, 7, 8], transpose=-12),
            dict(part="__alto", section="choir", inst="choir", gain=0.7, chairs=[3, 4, 5]),
            dict(part="__bass", section="choir", inst="voice", gain=0.7, chairs=[9, 10, 11]),
            dict(part="__alto", section="vn2", inst="violin", layer="strings", gain=0.7),
            dict(part="__alto", section="hn", inst="horn", gain=0.5, chairs=[0]),
            dict(part="__tenor", section="va", inst="viola", layer="strings", gain=0.7),
            dict(part="__tenor", section="hn", inst="horn", gain=0.45, chairs=[1]),
            dict(part="__bass", section="vc", inst="cello", layer="strings", gain=0.9),
            dict(part="__bass", section="bn", inst="bassoon", gain=0.5),
            dict(part="__bass", section="cb", inst="contrabass", gain=0.6, transpose=-12, floor=28),
            dict(part="timp", section="timp", inst="timpani", gain=0.8),
        ],
    ),
    dict(
        id="beethoven-fur-elise", src=("hand", _fur_elise()),
        title="Bagatelle in A minor, WoO 59 — Für Elise", titleKo="엘리제를 위하여",
        composer="L. van Beethoven", composerKo="베토벤", year=1810, ensembleKo="피아노",
        tempo=[(0, 76), (8, 76), (8.6, 66, "ramp"), (9, 76), (17, 76), (17.5, 60, "ramp"), (18, 76), (26, 76), (26.6, 66, "ramp"), (27, 76), (35, 76), (35.5, 58, "ramp")],
        final_rit=(3, 0.55), conducted=False, piano=True, mood="calm",
        tracks=lambda n: [dict(part="rh", section="piano", inst="piano", gain=1.0, staff=1),
                          dict(part="lh", section="piano", inst="piano", gain=1.0, staff=2)],
    ),
    dict(
        id="debussy-clair-de-lune", src=("dcml", "debussy_suite_bergamasque", "l075-03_suite_clair"),
        title="Suite bergamasque — III. Clair de lune", titleKo="베르가마스크 모음곡 — 달빛",
        composer="Claude Debussy", composerKo="드뷔시", year=1905, ensembleKo="피아노",
        tempo=[(1, 57), (13, 57), (14.6, 48, "ramp"), (15, 61), (19, 61), (24, 72, "ramp"), (25, 68),
               (26.5, 55, "ramp"), (27, 76), (36, 81, "ramp"), (37, 85), (41, 92, "ramp"), (42, 83),
               (42.9, 68, "ramp"), (43, 68), (50, 61, "ramp"), (51, 57), (65, 55, "ramp"), (72, 37, "ramp")],
        conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="beethoven-moonlight", src=("file", "beethoven-piano-sonatas/kern/sonata14-1.krn"),
        title='Piano Sonata No. 14 "Moonlight" — I. Adagio sostenuto', titleKo="피아노 소나타 14번 「월광」 — 1악장",
        composer="L. van Beethoven", composerKo="베토벤", year=1801, ensembleKo="피아노",
        tempo=[(1, 56), (60, 56), (69, 44, "ramp")], final_rit=(6, 0.6), conducted=False, piano=True, mood="calm",
        tracks=piano_kern,
    ),
    dict(
        id="bach-prelude-c", src=("m21", "bach/bwv846.mxl"),
        title="Prelude in C major, BWV 846", titleKo="평균율 클라비어곡집 1권 — 전주곡 C장조",
        composer="J. S. Bach", composerKo="바흐", year=1722, ensembleKo="하프 · 첼로",
        tempo=[(1, 58), (31, 58), (33, 50, "ramp"), (35, 40, "ramp")], final_rit=(4, 0.7),
        conducted=False, harp_ring=True, mood="calm",
        tracks=lambda n: [
            dict(part=n[0], section="harp", inst="harp", gain=0.95),
            dict(part=n[1], section="harp", inst="harp", gain=0.95),
            dict(part="__bass", section="vc", inst="cello", gain=0.55, chairs=[0], layer="strings"),
        ],
        extra="bass_pad",
    ),
    dict(
        id="mozart-turkish-march", src=("file", "mozart-piano-sonatas/kern/sonata11-3.krn"),
        title="Piano Sonata No. 11, K. 331 — III. Rondo alla turca", titleKo="피아노 소나타 11번 — 3악장 터키 행진곡",
        composer="W. A. Mozart", composerKo="모차르트", year=1783, ensembleKo="피아노",
        tempo=[(1, 126)], final_rit=(2, 0.85), conducted=False, piano=True, mood="lively", repeats=False,
        tracks=piano_kern,
    ),
    dict(
        id="chopin-prelude-4", src=("file", "chopin-preludes/kern/prelude28-04.krn"),
        title="Prelude in E minor, Op. 28 No. 4 (arr. for oboe & strings)", titleKo="전주곡 4번 E단조 (오보에와 현악 편곡)",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1839, ensembleKo="오보에 · 현악 합주",
        tempo=[(1, 54), (16, 54), (17, 62, "ramp"), (18, 54), (21, 54), (24, 40, "ramp")], final_rit=(2, 0.7), mood="calm",
        default_dyn=0.4, tracks=lambda n: piano_to_strings(n[1], n[0], melody_section="ob")[1:] + [
            dict(part=n[1], section="ob", inst="oboe", gain=1.0, top=True, legato=1.03),
            dict(part=n[1], section="vn1", inst="violin", layer="strings", gain=0.35, top=True),
        ],
    ),
    dict(
        id="chopin-raindrop", src=("file", "chopin-preludes/kern/prelude28-15.krn"),
        title='Prelude in D-flat major, Op. 28 No. 15 "Raindrop"', titleKo="전주곡 15번 D♭장조 「빗방울」",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1839, ensembleKo="피아노",
        tempo=[(1, 72), (27, 72), (28, 66), (75, 66), (76, 72), (84, 72), (89, 50, "ramp")], final_rit=(3, 0.7),
        conducted=False, piano=True, mood="calm", tracks=piano_kern,
    ),
    dict(
        id="schumann-traumerei", src=("dcml", "schumann_kinderszenen", "n07"),
        title="Kinderszenen Op. 15 — No. 7 Träumerei", titleKo="어린이 정경 — 7번 트로이메라이 (꿈)",
        composer="Robert Schumann", composerKo="슈만", year=1838, ensembleKo="피아노",
        tempo=[(0, 54), (7.5, 54), (8.9, 40, "ramp"), (9, 54), (15.5, 54), (16.9, 38, "ramp"), (17, 54),
               (21.5, 52), (24, 30, "ramp")],
        conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="mozart-k545", src=("file", "mozart-piano-sonatas/kern/sonata15-1.krn"),
        title="Piano Sonata No. 16 in C major, K. 545 — I. Allegro", titleKo="피아노 소나타 16번 C장조 K.545 — 1악장",
        composer="W. A. Mozart", composerKo="모차르트", year=1788, ensembleKo="피아노",
        tempo=[(1, 126)], final_rit=(2, 0.85), conducted=False, piano=True, mood="lively", repeats=False,
        tracks=piano_kern,
    ),
    dict(
        id="handel-lascia", src=("m21", "handel/rinaldo/Lascia_chio_pianga.mxl"), measures=(13, 54),
        title="Rinaldo — \"Lascia ch'io pianga\"", titleKo="오페라 「리날도」 — 울게 하소서",
        composer="G. F. Handel", composerKo="헨델", year=1711, ensembleKo="오보에 · 합창 · 하프 · 현악 저음",
        tempo=[(13, 54)], final_rit=(5, 0.6), mood="calm",
        tracks=lambda n: [
            dict(part=n[0], section="ob", inst="oboe", gain=1.0, legato=1.02),
            dict(part=n[0], section="choir", inst="choir", gain=0.55, chairs=[0, 1, 2, 3, 4, 5]),
            dict(part=n[1], section="harp", inst="harp", gain=0.55),
            dict(part=n[2], section="vc", inst="cello", layer="strings", gain=0.75),
            dict(part=n[2], section="cb", inst="contrabass", gain=0.45, transpose=-12, only_below=57, floor=28),
        ],
    ),
    dict(
        id="bach-o-haupt", src=("m21", "bach/bwv244.54.mxl"),
        title='St Matthew Passion — Chorale "O Haupt voll Blut und Wunden"', titleKo="마태 수난곡 — 코랄 「오 피와 상처로 가득한 머리여」",
        composer="J. S. Bach", composerKo="바흐", year=1727, ensembleKo="합창 · 관현악",
        tempo=[(1, 58)], final_rit=(2, 0.75), fermata_hold=2.0, default_dyn=0.5, mood="calm",
        tracks=chorale,
    ),
    dict(
        id="beethoven-pathetique-adagio", src=("dcml", "beethoven_piano_sonatas", "08-2"),
        title='Piano Sonata No. 8 "Pathétique" — II. Adagio cantabile', titleKo="피아노 소나타 8번 「비창」 — 2악장 아다지오 칸타빌레",
        composer="L. van Beethoven", composerKo="베토벤", year=1798, ensembleKo="피아노",
        tempo=[(1, 34), (8.5, 34), (8.95, 28, "ramp"), (9, 34), (16.5, 34), (16.95, 28, "ramp"), (17, 36),
               (28, 36), (28.9, 30, "ramp"), (29, 34), (36.5, 34), (36.95, 28, "ramp"), (37, 38), (50, 36),
               (51, 34), (66, 34), (73, 24, "ramp")],
        conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="joplin-entertainer", src=("file", "joplin/kern/entertainer.krn"),
        title="The Entertainer", titleKo="엔터테이너",
        composer="Scott Joplin", composerKo="스콧 조플린", year=1902, ensembleKo="피아노",
        tempo=[(1, 92)], final_rit=(1, 0.9), conducted=False, piano=True, mood="lively", tracks=piano_kern,
    ),
    dict(
        id="greensleeves", src=("hand", _greensleeves()),
        title="Greensleeves (arr.)", titleKo="그린슬리브스 (편곡)",
        composer="Traditional (England)", composerKo="영국 민요", year=1580, ensembleKo="플루트 · 하프 · 현악",
        tempo=[(1, 84)], final_rit=(4, 0.6), mood="calm",
        tracks=lambda n: [
            dict(part="mel", section="fl", inst="flute", gain=0.95, legato=1.02),
            dict(part="mel", section="vn1", inst="violin", layer="strings", gain=0.3, chairs=[0]),
            dict(part="__alto", section="vn2", inst="violin", layer="strings", gain=0.55),
            dict(part="__tenor", section="va", inst="viola", layer="strings", gain=0.6),
            dict(part="__bass", section="vc", inst="cello", layer="strings", gain=0.7),
            dict(part="__harp_b", section="harp", inst="harp", gain=0.6),
            dict(part="__harp_t", section="harp", inst="harp", gain=0.5),
            dict(part="__harp_a", section="harp", inst="harp", gain=0.5),
        ],
        extra="harp_chords",
    ),
    dict(
        id="tchaikovsky-june", src=("dcml", "tchaikovsky_seasons", "op37a06"),
        title="The Seasons Op. 37a — June: Barcarolle", titleKo="사계 — 6월: 뱃노래",
        composer="P. I. Tchaikovsky", composerKo="차이콥스키", year=1876, ensembleKo="피아노",
        tempo=[(1, 70), (11.5, 70), (12, 74), (19, 74), (20, 66, "ramp"), (21, 70), (32, 78), (39, 84, "ramp"),
               (40, 120), (49, 120), (50.9, 92, "ramp"), (52, 96), (53, 70), (95, 66), (99, 44, "ramp")],
        conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="schubert-lindenbaum", src=("m21", "schubert/Lindenbaum.xml"),
        title="Winterreise D. 911 — No. 5 Der Lindenbaum", titleKo="겨울 나그네 — 5번 보리수",
        composer="Franz Schubert", composerKo="슈베르트", year=1827, ensembleKo="호른 · 피아노",
        tempo=[(1, 62)], final_rit=(6, 0.62), conducted=False, piano=True, mood="calm",
        tracks=lambda n: [
            dict(part=n[0], section="hn", inst="horn", gain=1.0, chairs=[0], legato=1.03),
            dict(part=n[1], section="piano", inst="piano", gain=0.8, staff=1),
            dict(part=n[2], section="piano", inst="piano", gain=0.8, staff=2),
        ],
    ),
    dict(
        id="grieg-wedding-day", src=("dcml", "grieg_lyric_pieces", "op65n06"),
        title="Lyric Pieces Op. 65 — No. 6 Wedding Day at Troldhaugen", titleKo="서정 소품집 — 트롤하우겐의 결혼식 날",
        composer="Edvard Grieg", composerKo="그리그", year=1897, ensembleKo="피아노",
        tempo=[(1, 112)], final_rit=(2, 0.85), conducted=False, piano=True, mood="lively", finale=True, tracks=piano_dcml,
    ),
    dict(
        id="chopin-prelude-20", src=("file", "chopin-preludes/kern/prelude28-20.krn"),
        title="Prelude in C minor, Op. 28 No. 20 (arr. for brass & strings)", titleKo="전주곡 20번 C단조 (금관과 현악 편곡)",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1839, ensembleKo="금관 · 현악 합주",
        tempo=[(1, 46)], final_rit=(2, 0.7), mood="grand", default_dyn=0.7,
        tracks=lambda n: [
            dict(part=n[1], section="tp", inst="trumpet", gain=0.8, top=True),
            dict(part=n[1], section="vn1", inst="violin", layer="strings", gain=0.9, top=True),
            dict(part=n[1], section="hn", inst="horn", gain=0.6, range=(55, 76), bottom=True),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.6, range=(55, 84), bottom=True),
            dict(part=n[1], section="va", inst="viola", layer="strings", gain=0.6, range=(48, 70)),
            dict(part=n[0], section="hn", inst="horn", gain=0.5, range=(48, 70), top=True, chairs=[1]),
            dict(part=n[0], section="vc", inst="cello", layer="strings", gain=0.9, range=(36, 62), top=True),
            dict(part=n[0], section="bn", inst="bassoon", gain=0.55, range=(36, 62), top=True),
            dict(part=n[0], section="cb", inst="contrabass", gain=0.6, bottom=True, transpose=-12, floor=28),
            dict(part=n[0], section="timp", inst="timpani", gain=0.5, bottom=True, range=(36, 50), min_dur=0.1),
        ],
    ),
    dict(
        id="liliuokalani-aloha-oe", src=("m21", "liliuokalani/aloha_oe.mxl"),
        title="Aloha ʻOe", titleKo="알로하 오에",
        composer="Liliʻuokalani", composerKo="릴리우오칼라니", year=1878, ensembleKo="플루트 · 합창 · 현악 · 하프",
        tempo=[(1, 72)], final_rit=(4, 0.6), fermata_hold=1.7, mood="calm",
        tracks=lambda n: [
            dict(part=n[4], section="fl", inst="flute", gain=1.0, legato=1.02),
            dict(part=n[0], section="choir", inst="choir", gain=0.75, chairs=[0, 1, 2]),
            dict(part=n[1], section="choir", inst="choir", gain=0.6, chairs=[3, 4, 5]),
            dict(part=n[2], section="choir", inst="voice", gain=0.55, chairs=[6, 7, 8]),
            dict(part=n[3], section="choir", inst="voice", gain=0.6, chairs=[9, 10, 11]),
            dict(part=n[0], section="vn1", inst="violin", layer="strings", gain=0.6),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.5),
            dict(part=n[2], section="va", inst="viola", layer="strings", gain=0.5),
            dict(part=n[3], section="vc", inst="cello", layer="strings", gain=0.6),
            dict(part=n[3], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[5], section="harp", inst="harp", gain=0.6),
            dict(part=n[6], section="harp", inst="harp", gain=0.6),
        ],
    ),
    dict(
        id="grieg-morning-arietta", src=("dcml", "grieg_lyric_pieces", "op12n01"),
        title="Lyric Pieces Op. 12 — No. 1 Arietta", titleKo="서정 소품집 — 아리에타",
        composer="Edvard Grieg", composerKo="그리그", year=1867, ensembleKo="피아노",
        tempo=[(1, 60)], final_rit=(3, 0.6), conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="scarlatti-k1", src=("file", "scarlatti-keyboard-sonatas/kern/L366K001.krn"),
        title="Keyboard Sonata in D minor, K. 1", titleKo="건반 소나타 D단조 K.1",
        composer="Domenico Scarlatti", composerKo="스카를라티", year=1738, ensembleKo="피아노",
        tempo=[(1, 116)], final_rit=(2, 0.8), conducted=False, piano=True, mood="lively", tracks=piano_kern,
    ),
    dict(
        id="mozart-k458-adagio", src=("m21", "mozart/k458/movement3.mxl"),
        title='String Quartet No. 17 "Hunt", K. 458 — III. Adagio', titleKo="현악 4중주 17번 「사냥」 — 3악장 아다지오",
        composer="W. A. Mozart", composerKo="모차르트", year=1784, ensembleKo="현악 합주",
        tempo=[(1, 40)], final_rit=(6, 0.62), mood="calm", tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="tchaikovsky-october", src=("dcml", "tchaikovsky_seasons", "op37a10"),
        title="The Seasons Op. 37a — October: Autumn Song", titleKo="사계 — 10월: 가을의 노래",
        composer="P. I. Tchaikovsky", composerKo="차이콥스키", year=1876, ensembleKo="피아노",
        tempo=[(1, 60)], final_rit=(5, 0.55), conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="chopin-prelude-6", src=("file", "chopin-preludes/kern/prelude28-06.krn"),
        title="Prelude in B minor, Op. 28 No. 6 (arr. for cello & strings)", titleKo="전주곡 6번 B단조 (첼로와 현악 편곡)",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1839, ensembleKo="첼로 · 현악 합주",
        tempo=[(1, 58)], final_rit=(3, 0.6), mood="calm", default_dyn=0.42,
        tracks=lambda n: [
            dict(part=n[0], section="vc", inst="cello", gain=1.0, top=True, chairs=[0], legato=1.03),
            dict(part=n[0], section="cb", inst="contrabass", gain=0.35, bottom=True, transpose=-12, floor=28, only_below=50),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.5, top=True),
            dict(part=n[1], section="va", inst="viola", layer="strings", gain=0.55, bottom=True),
        ],
    ),
    dict(
        id="joplin-maple-leaf", src=("file", "joplin/kern/mapleleaf.krn"),
        title="Maple Leaf Rag", titleKo="메이플 리프 래그",
        composer="Scott Joplin", composerKo="스콧 조플린", year=1899, ensembleKo="피아노",
        tempo=[(1, 96)], final_rit=(1, 0.9), conducted=False, piano=True, mood="lively", finale=True, tracks=piano_kern,
    ),
    dict(
        id="debussy-prelude", src=("dcml", "debussy_suite_bergamasque", "l075-01_suite_prelude"),
        title="Suite bergamasque — I. Prélude", titleKo="베르가마스크 모음곡 — 전주곡",
        composer="Claude Debussy", composerKo="드뷔시", year=1905, ensembleKo="피아노",
        tempo=[(1, 96)], final_rit=(2, 0.75), conducted=False, piano=True, mood="lively", tracks=piano_dcml,
    ),
    dict(
        id="bach-wachet-auf", src=("m21", "bach/bwv140.7.mxl"),
        title='Cantata BWV 140 "Wachet auf" — Chorale "Gloria sei dir gesungen"', titleKo="칸타타 「눈 뜨라고 부르는 소리 있어」 — 종결 코랄",
        composer="J. S. Bach", composerKo="바흐", year=1731, ensembleKo="합창 · 관현악",
        tempo=[(1, 72)], final_rit=(2, 0.75), fermata_hold=1.6, default_dyn=0.62, mood="grand",
        tracks=lambda n: chorale(n) + [dict(part=n[0], section="tp", inst="trumpet", gain=0.4)],
    ),
    dict(
        id="chopin-mazurka-7-1", src=("file", "chopin-mazurkas/kern/mazurka07-1.krn"),
        title="Mazurka in B-flat major, Op. 7 No. 1", titleKo="마주르카 Op.7-1 B♭장조",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1832, ensembleKo="피아노",
        tempo=[(1, 150)], final_rit=(2, 0.8), conducted=False, piano=True, mood="lively", tracks=piano_kern,
    ),
    dict(
        id="verdi-la-donna", src=("m21", "verdi/laDonnaEMobile.mxl"),
        title='Rigoletto — "La donna è mobile" (arr.)', titleKo="오페라 「리골레토」 — 여자의 마음 (편곡)",
        composer="Giuseppe Verdi", composerKo="베르디", year=1851, ensembleKo="호른 · 트럼펫 · 현악",
        tempo=[(1, 112)], final_rit=(2, 0.8), mood="lively", default_dyn=0.6,
        tracks=lambda n: [
            dict(part=n[0], section="hn", inst="horn", gain=0.9, top=True, chairs=[0]),
            dict(part=n[0], section="tp", inst="trumpet", gain=0.5, top=True),
            dict(part=n[0], section="vn1", inst="violin", layer="strings", gain=0.6, top=True),
            dict(part=n[0], section="vn2", inst="violin", layer="strings", gain=0.5, bottom=True, range=(55, 84)),
            dict(part=n[1], section="va", inst="viola", layer="strings", gain=0.6, range=(48, 70)),
            dict(part=n[1], section="vc", inst="cello", layer="strings", gain=0.8, range=(36, 60)),
            dict(part=n[1], section="cb", inst="contrabass", gain=0.5, bottom=True, transpose=-12, floor=28),
        ],
    ),
    dict(
        id="grieg-to-spring", src=("dcml", "grieg_lyric_pieces", "op43n06"),
        title="Lyric Pieces Op. 43 — No. 6 To Spring", titleKo="서정 소품집 — 봄에게",
        composer="Edvard Grieg", composerKo="그리그", year=1886, ensembleKo="피아노",
        tempo=[(1, 100)], final_rit=(4, 0.6), conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="beethoven-op49-2", src=("file", "beethoven-piano-sonatas/kern/sonata20-1.krn"),
        title="Piano Sonata No. 20 in G major, Op. 49 No. 2 — I. Allegro ma non troppo", titleKo="피아노 소나타 20번 G장조 — 1악장",
        composer="L. van Beethoven", composerKo="베토벤", year=1796, ensembleKo="피아노",
        tempo=[(1, 120)], final_rit=(2, 0.85), conducted=False, piano=True, mood="lively", repeats=False, tracks=piano_kern,
    ),
    dict(
        id="schumann-foreign-lands", src=("dcml", "schumann_kinderszenen", "n01"),
        title="Kinderszenen Op. 15 — No. 1 Of Foreign Lands and Peoples", titleKo="어린이 정경 — 1번 미지의 나라들",
        composer="Robert Schumann", composerKo="슈만", year=1838, ensembleKo="피아노",
        tempo=[(1, 76)], final_rit=(3, 0.6), conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="weber-clarinet-concertino", src=("m21", "weber/concertino_clarinet.mxl"),
        title="Clarinet Concertino in E-flat major, Op. 26", titleKo="클라리넷 콘체르티노 E♭장조",
        composer="Carl Maria von Weber", composerKo="베버", year=1811, ensembleKo="클라리넷 독주 · 현악 합주",
        tempo=[(1, 60), (23, 60), (24, 88), (52, 88), (56, 110), (121, 110), (122, 132)], final_rit=(2, 0.8), mood="lively",
        tracks=lambda n: [
            dict(part=n[0], section="cl", inst="clarinet", gain=1.0, legato=1.02),
            dict(part=n[1], section="vn1", inst="violin", layer="strings", gain=0.55, top=True),
            dict(part=n[1], section="vn2", inst="violin", layer="strings", gain=0.45, bottom=True, range=(55, 84)),
            dict(part=n[2], section="va", inst="viola", layer="strings", gain=0.5, range=(48, 70), top=True),
            dict(part=n[2], section="vc", inst="cello", layer="strings", gain=0.65, range=(36, 62), bottom=True),
            dict(part=n[2], section="cb", inst="contrabass", gain=0.4, bottom=True, transpose=-12, floor=28, only_below=55),
        ],
    ),
    dict(
        id="chopin-prelude-7", src=("file", "chopin-preludes/kern/prelude28-07.krn"),
        title="Prelude in A major, Op. 28 No. 7", titleKo="전주곡 7번 A장조",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1839, ensembleKo="피아노",
        tempo=[(1, 88)], final_rit=(2, 0.6), conducted=False, piano=True, mood="calm", tracks=piano_kern,
    ),
    dict(
        id="grieg-march-of-trolls", src=("dcml", "grieg_lyric_pieces", "op54n03"),
        title="Lyric Pieces Op. 54 — No. 3 March of the Trolls", titleKo="서정 소품집 — 트롤의 행진",
        composer="Edvard Grieg", composerKo="그리그", year=1891, ensembleKo="피아노",
        tempo=[(1, 126)], final_rit=(1, 0.9), conducted=False, piano=True, mood="lively", tracks=piano_dcml,
    ),
    dict(
        id="haydn-op74-1-andantino", src=("m21", "haydn/opus74no1/movement2.mxl"),
        title="String Quartet Op. 74 No. 1 — II. Andantino grazioso", titleKo="현악 4중주 Op.74-1 — 2악장 안단티노 그라치오소",
        composer="Joseph Haydn", composerKo="하이든", year=1793, ensembleKo="현악 4중주",
        tempo=[(1, 78)], final_rit=(3, 0.6), conducted=False, mood="calm", tracks=string_quartet,
    ),
    dict(
        id="tchaikovsky-troika", src=("dcml", "tchaikovsky_seasons", "op37a11"),
        title="The Seasons Op. 37a — November: Troika", titleKo="사계 — 11월: 트로이카",
        composer="P. I. Tchaikovsky", composerKo="차이콥스키", year=1876, ensembleKo="피아노",
        tempo=[(1, 88)], final_rit=(3, 0.7), conducted=False, piano=True, mood="lively", tracks=piano_dcml,
    ),
    dict(
        id="corelli-op3-1-grave", src=("m21", "corelli/opus3no1/1grave.xml"),
        title="Trio Sonata Op. 3 No. 1 — I. Grave", titleKo="트리오 소나타 Op.3-1 — 1악장 그라베",
        composer="Arcangelo Corelli", composerKo="코렐리", year=1689, ensembleKo="바이올린 2 · 첼로 · 하프 통주저음",
        tempo=[(1, 48)], final_rit=(3, 0.6), conducted=False, default_dyn=0.5, mood="calm",
        tracks=lambda n: [
            dict(part=n[0], section="vn1", inst="violin", gain=1.0, chairs=[0]),
            dict(part=n[1], section="vn2", inst="violin", gain=0.9, chairs=[0]),
            dict(part=n[2], section="vc", inst="cello", gain=0.9, chairs=[0]),
            dict(part=n[2], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[2], section="harp", inst="harp", gain=0.45),
        ],
    ),
    dict(
        id="joplin-solace", src=("file", "joplin/kern/solace.krn"),
        title="Solace — A Mexican Serenade", titleKo="솔레이스 — 멕시코 세레나데",
        composer="Scott Joplin", composerKo="스콧 조플린", year=1909, ensembleKo="피아노",
        tempo=[(1, 80)], final_rit=(2, 0.8), conducted=False, piano=True, mood="calm", tracks=piano_kern,
    ),
    dict(
        id="grieg-butterfly", src=("dcml", "grieg_lyric_pieces", "op43n01"),
        title="Lyric Pieces Op. 43 — No. 1 Butterfly", titleKo="서정 소품집 — 나비",
        composer="Edvard Grieg", composerKo="그리그", year=1886, ensembleKo="피아노",
        tempo=[(1, 132)], final_rit=(2, 0.7), conducted=False, piano=True, mood="lively", tracks=piano_dcml,
    ),
    dict(
        id="bach-brich-an", src=("m21", "bach/bwv248.12-2.mxl"),
        title='Christmas Oratorio — Chorale "Brich an, o schönes Morgenlicht"', titleKo="크리스마스 오라토리오 — 코랄 「밝아오라, 아름다운 아침 빛이여」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="합창 · 목관 · 현악",
        tempo=[(1, 60)], final_rit=(2, 0.8), fermata_hold=2.0, default_dyn=0.55, mood="calm", tracks=chorale,
    ),
    dict(
        id="mozart-k80-adagio", src=("m21", "mozart/k80/movement1.mxl"),
        title="String Quartet No. 1, K. 80 — I. Adagio", titleKo="현악 4중주 1번 K.80 — 1악장 아다지오",
        composer="W. A. Mozart", composerKo="모차르트", year=1770, ensembleKo="현악 합주",
        tempo=[(1, 54)], final_rit=(4, 0.62), repeats=False, mood="calm", tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="chopin-mazurka-68-2", src=("file", "chopin-mazurkas/kern/mazurka68-2.krn"),
        title="Mazurka in A minor, Op. 68 No. 2", titleKo="마주르카 Op.68-2 A단조",
        composer="Frédéric Chopin", composerKo="쇼팽", year=1827, ensembleKo="피아노",
        tempo=[(1, 100)], final_rit=(3, 0.6), conducted=False, piano=True, mood="calm", tracks=piano_kern,
    ),
    dict(
        id="debussy-passepied", src=("dcml", "debussy_suite_bergamasque", "l075-04_suite_passepied"),
        title="Suite bergamasque — IV. Passepied", titleKo="베르가마스크 모음곡 — 파스피에",
        composer="Claude Debussy", composerKo="드뷔시", year=1905, ensembleKo="피아노",
        tempo=[(1, 112)], final_rit=(2, 0.8), conducted=False, piano=True, mood="lively", tracks=piano_dcml,
    ),
    dict(
        id="grieg-notturno", src=("dcml", "grieg_lyric_pieces", "op54n04"),
        title="Lyric Pieces Op. 54 — No. 4 Notturno", titleKo="서정 소품집 Op.54 — 4번 녹턴",
        composer="Edvard Grieg", composerKo="그리그", year=1891, ensembleKo="피아노",
        tempo=[(1, 84), (13, 84), (14.9, 70, "ramp"), (15, 84), (21, 96), (30, 96), (31.9, 76, "ramp"),
               (34, 84), (52, 84), (53.9, 72, "ramp"), (55, 82), (59, 74), (61, 56), (66, 40, "ramp")],
        conducted=False, piano=True, mood="calm", tracks=piano_dcml,
    ),
    dict(
        id="beethoven-tempest-3", src=("file", "beethoven-piano-sonatas/kern/sonata17-3.krn"),
        title='Piano Sonata No. 17 "Tempest" — III. Allegretto', titleKo="피아노 소나타 17번 「템페스트」 — 3악장",
        composer="L. van Beethoven", composerKo="베토벤", year=1802, ensembleKo="피아노",
        tempo=[(1, 126)], final_rit=(2, 0.85), conducted=False, piano=True, mood="lively", repeats=False, tracks=piano_kern,
    ),
    dict(
        id="bach-wir-singen", src=("m21", "bach/bwv248.23-2.mxl"),
        title='Christmas Oratorio — Chorale "Wir singen dir in deinem Heer"', titleKo="크리스마스 오라토리오 — 목가풍 코랄 「우리는 주님께 노래하네」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="합창 · 플루트 · 오보에 · 현악",
        tempo=[(1, 66)], final_rit=(3, 0.7), fermata_hold=1.6, default_dyn=0.55, mood="calm",
        tracks=lambda n: chorale(n[3:7], orch=False) + [
            dict(part=n[0], section="fl", inst="flute", gain=0.85),
            dict(part=n[1], section="ob", inst="oboe", gain=0.7),
            dict(part=n[2], section="cl", inst="clarinet", gain=0.6),
            dict(part=n[3], section="vn1", inst="violin", layer="strings", gain=0.6),
            dict(part=n[4], section="vn2", inst="violin", layer="strings", gain=0.5),
            dict(part=n[5], section="va", inst="viola", layer="strings", gain=0.5),
            dict(part=n[6], section="vc", inst="cello", layer="strings", gain=0.65),
            dict(part=n[6], section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part=n[7], section="bn", inst="bassoon", gain=0.5),
        ],
    ),
    dict(
        id="beethoven-op59-2-molto-adagio", src=("m21", "beethoven/opus59no2/movement2.mxl"),
        title='String Quartet Op. 59 No. 2 "Razumovsky" — II. Molto adagio', titleKo="현악 4중주 「라주모프스키」 2번 — 2악장 몰토 아다지오",
        composer="L. van Beethoven", composerKo="베토벤", year=1806, ensembleKo="현악 합주",
        tempo=[(1, 50)], final_rit=(6, 0.6), mood="calm", tracks=lambda n: string_orchestra(n),
    ),
    dict(
        id="elgar-pomp-and-circumstance", src=("hand", _pomp()),
        title='Pomp and Circumstance March No. 1 — Trio ("Land of Hope and Glory")', titleKo="위풍당당 행진곡 1번 — 트리오 「희망과 영광의 땅」",
        composer="Edward Elgar", composerKo="엘가", year=1901, ensembleKo="관현악 · 합창",
        tempo=[(1, 76), (14, 76), (16, 66, "ramp"), (17, 76), (30, 76), (32, 66, "ramp"), (33, 76), (38, 70, "ramp"), (40, 60, "ramp"),
               (41, 82), (54, 82), (56, 72, "ramp"), (57, 82), (70, 82), (72, 72, "ramp"), (73, 82)],
        final_rit=(4, 0.5), mood="grand", finale=True,
        tracks=lambda n: [
            dict(part="m1", section="vn1", inst="violin", layer="strings", gain=0.95),
            dict(part="m1", section="vn2", inst="violin", layer="strings", gain=0.55, transpose=-12),
            dict(part="__alto", section="va", inst="viola", layer="strings", gain=0.6),
            dict(part="__tenor", section="vc", inst="cello", layer="strings", gain=0.55),
            dict(part="__bass", section="vc", inst="cello", layer="strings", gain=0.75),
            dict(part="__bass", section="cb", inst="contrabass", gain=0.55, transpose=-12, floor=28),
            dict(part="__alto", section="hn", inst="horn", gain=0.35, chairs=[0]),
            dict(part="__tenor", section="hn", inst="horn", gain=0.35, chairs=[1]),
            dict(part="__bass", section="bn", inst="bassoon", gain=0.45),
            dict(part="m2", section="vn1", inst="violin", layer="strings", gain=1.0),
            dict(part="m2", section="tp", inst="trumpet", gain=0.8),
            dict(part="m2", section="fl", inst="flute", gain=0.55, transpose=12),
            dict(part="m2", section="ob", inst="oboe", gain=0.55),
            dict(part="m2", section="choir", inst="choir", gain=0.95, chairs=[0, 1, 2]),
            dict(part="m2", section="choir", inst="voice", gain=0.7, chairs=[6, 7, 8], transpose=-12),
            dict(part="__harp_a", section="choir", inst="choir", gain=0.65, chairs=[3, 4, 5]),
            dict(part="__harp_b", section="choir", inst="voice", gain=0.7, chairs=[9, 10, 11]),
            dict(part="__harp_t", section="cl", inst="clarinet", gain=0.45),
            dict(part="__harp_b", section="harp", inst="harp", gain=0.5),
            dict(part="__harp_a", section="harp", inst="harp", gain=0.45),
            dict(part="timp", section="timp", inst="timpani", gain=0.8),
        ],
        extra="harp_chords",
    ),
    dict(
        id="amazing-grace", src=("hand", _amazing_grace()),
        title="Amazing Grace (New Britain, arr.)", titleKo="어메이징 그레이스 (편곡)",
        composer="Traditional (America)", composerKo="미국 찬송가", year=1835, ensembleKo="플루트 · 하프 · 합창 · 관현악",
        tempo=[(0, 72), (14, 70), (28, 66), (40, 54, "ramp")], final_rit=(3, 0.55), mood="calm",
        tracks=lambda n: [
            dict(part="v1", section="fl", inst="flute", gain=0.95, legato=1.03),
            dict(part="__harp_b", section="harp", inst="harp", gain=0.6),
            dict(part="__harp_t", section="harp", inst="harp", gain=0.5),
            dict(part="__harp_a", section="harp", inst="harp", gain=0.5),
            dict(part="sop", section="choir", inst="choir", gain=0.85, chairs=[0, 1, 2]),
            dict(part="__alto", section="choir", inst="choir", gain=0.65, chairs=[3, 4, 5]),
            dict(part="__tenor", section="choir", inst="voice", gain=0.6, chairs=[6, 7, 8]),
            dict(part="__bass", section="choir", inst="voice", gain=0.65, chairs=[9, 10, 11]),
            dict(part="sop", section="vn1", inst="violin", layer="strings", gain=0.45),
            dict(part="__alto", section="vn2", inst="violin", layer="strings", gain=0.5),
            dict(part="__tenor", section="va", inst="viola", layer="strings", gain=0.5),
            dict(part="__bass", section="vc", inst="cello", layer="strings", gain=0.65),
            dict(part="__bass", section="cb", inst="contrabass", gain=0.4, transpose=-12, only_below=57, floor=28),
            dict(part="hn3", section="hn", inst="horn", gain=0.7, chairs=[0], legato=1.02),
            dict(part="timp", section="timp", inst="timpani", gain=0.45),
        ],
        extra="harp_chords",
    ),
    dict(
        id="bach-nun-seid-ihr", src=("m21", "bach/bwv248.64-6.mxl"),
        title='Christmas Oratorio — Final Chorale "Nun seid ihr wohl gerochen"', titleKo="크리스마스 오라토리오 — 피날레 코랄 「이제 너희는 원수를 갚았도다」",
        composer="J. S. Bach", composerKo="바흐", year=1734, ensembleKo="합창 · 관현악 총주 (트럼펫 · 팀파니)",
        tempo=[(1, 88)], final_rit=(4, 0.62), fermata_hold=1.12, default_dyn=0.74, mood="grand", finale=True,
        tracks=lambda n: [
            dict(part=n[0], section="tp", inst="trumpet", gain=0.75),
            dict(part=n[1], section="hn", inst="horn", gain=0.55, chairs=[0]),
            dict(part=n[2], section="hn", inst="horn", gain=0.5, chairs=[1]),
            dict(part=n[3], section="timp", inst="timpani", gain=0.8),
            dict(part=n[4], section="ob", inst="oboe", gain=0.65),
            dict(part=n[6], section="vn1", inst="violin", layer="strings", gain=0.75),
            dict(part=n[7], section="vn2", inst="violin", layer="strings", gain=0.65),
            dict(part=n[8], section="va", inst="viola", layer="strings", gain=0.6),
            dict(part=n[9], section="choir", inst="choir", gain=0.9, chairs=[0, 1, 2]),
            dict(part=n[10], section="choir", inst="choir", gain=0.75, chairs=[3, 4, 5]),
            dict(part=n[11], section="choir", inst="voice", gain=0.7, chairs=[6, 7, 8]),
            dict(part=n[12], section="choir", inst="voice", gain=0.75, chairs=[9, 10, 11]),
            dict(part=n[9], section="fl", inst="flute", gain=0.6, legato=1.02),
            dict(part=n[10], section="cl", inst="clarinet", gain=0.45),
            dict(part=n[11], section="bn", inst="bassoon", gain=0.4),
            dict(part=n[13], section="vc", inst="cello", layer="strings", gain=0.8),
            dict(part=n[13], section="cb", inst="contrabass", gain=0.5, transpose=-12, only_below=57, floor=28),
        ],
    ),
]
