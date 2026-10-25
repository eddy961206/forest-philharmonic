#!/usr/bin/env python3
"""Reproduce two documented outdoor editions from committed source MIDI.

Requires mido==1.3.3. Run from any directory. --check reproduces in memory
and checks committed bytes without changing the MIDI, catalog or JSON scores.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import mido

ROOT = Path(__file__).resolve().parent.parent
SCORES = ROOT / 'tools' / 'scores'
PROOF = ROOT / 'tools' / 'outdoor-chamber-proof.json'


def thais(source):
    midi = mido.MidiFile(source)
    for index, track in enumerate(midi.tracks):
        for msg in track:
            if msg.type in ('note_on', 'note_off'):
                msg.note += 28 if index == 0 else 4
            if msg.type == 'program_change' and index == 0:
                msg.program = 40
            if msg.type == 'track_name' and index == 0:
                msg.name = 'Violin'
            if msg.type == 'key_signature':
                msg.key = 'D'
    return midi


def boccherini(source):
    midi = mido.MidiFile(source)
    tpq = midi.ticks_per_beat
    for track in midi.tracks:
        absolute = []
        tick = 0
        for msg in track:
            tick += msg.time
            if msg.type != 'end_of_track':
                absolute.append((tick, msg.copy(time=0)))
        appended = []
        for tick, msg in absolute:
            if tick == 0 and msg.type in ('program_change', 'control_change', 'pitchwheel', 'set_tempo'):
                appended.append((312 * tpq, msg.copy()))
        # First eight bars once, then bars 9–24 once. The original MIDI
        # already expands both repeat sections, so skip their second passes.
        for begin, end, destination in [(0, 24, 312), (48, 96, 336)]:
            for tick, msg in absolute:
                closing_note = tick == end * tpq and (msg.type == 'note_off' or msg.type == 'note_on' and msg.velocity == 0)
                if begin * tpq <= tick < end * tpq or closing_note:
                    if not msg.is_meta or msg.type == 'set_tempo':
                        appended.append((destination * tpq + tick - begin * tpq, msg.copy()))
        sequence = sorted(absolute + appended, key=lambda entry: entry[0])
        track.clear()
        previous = 0
        for tick, msg in sequence:
            track.append(msg.copy(time=tick - previous))
            previous = tick
        track.append(mido.MetaMessage('end_of_track', time=max(0, 384 * tpq - previous)))
    return midi


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify exact reproduction without writing files')
    args = parser.parse_args()
    proof = json.loads(PROOF.read_text())
    for ident, transform in [('massenet-thais-meditation', thais), ('boccherini-minuet', boccherini)]:
        entry = proof[ident]
        source = SCORES / f'{ident}-source.mid'
        target = SCORES / f'{ident}.mid'
        if sha(source.read_bytes()) != entry['sourceSha256']:
            raise ValueError(f'{ident}: source hash differs from documented edition')
        buffer = io.BytesIO()
        transform(source).save(file=buffer)
        data = buffer.getvalue()
        if sha(data) != entry['outputSha256']:
            raise ValueError(f'{ident}: generated hash differs from documented edition')
        if args.check:
            if target.read_bytes() != data:
                raise ValueError(f'{ident}: committed MIDI differs from reproduction')
        else:
            target.write_bytes(data)
        print(f'{ident}: {sha(data)} ({"verified" if args.check else "written"})')


if __name__ == '__main__':
    main()
