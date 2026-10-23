"""Focused MIDI conversion regressions. Run with the repertoire Python venv."""
import sys
import tempfile
import unittest
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from midi_score import read_midi, realize  # noqa: E402


def midi_file(tracks):
    midi = mido.MidiFile(type=1, ticks_per_beat=480)
    for messages in tracks:
        track = mido.MidiTrack()
        track.extend(messages)
        midi.tracks.append(track)
    return midi


class MidiScoreTest(unittest.TestCase):
    def read(self, tracks):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'score.mid'
            midi_file(tracks).save(path)
            return read_midi(path)

    def test_tempo_and_compound_meter(self):
        tracks, beats, duration, info = self.read([[
            mido.MetaMessage('time_signature', numerator=6, denominator=8, time=0),
            mido.Message('note_on', note=60, velocity=90, time=0),
            mido.MetaMessage('set_tempo', tempo=1000000, time=480),
            mido.Message('note_off', note=60, velocity=0, time=480),
        ]])
        self.assertAlmostEqual(tracks[0]['notes'][0][1], 1.5)
        self.assertAlmostEqual(duration, 1.5)
        self.assertEqual(beats, [[0.0, 0, 2], [1.0, 1, 2]])
        self.assertEqual(info['tempoChanges'], 2)

    def test_port_after_program_at_tick_zero_and_port_isolation(self):
        tracks, _, _, _ = self.read([[
            mido.Message('program_change', channel=0, program=40, time=0),
            mido.MetaMessage('midi_port', port=1, time=0),
            mido.Message('note_on', channel=0, note=60, velocity=100, time=0),
            mido.Message('note_off', channel=0, note=60, time=480),
            mido.MetaMessage('midi_port', port=2, time=0),
            mido.Message('program_change', channel=0, program=73, time=0),
            mido.Message('note_on', channel=0, note=72, velocity=100, time=0),
            mido.Message('note_off', channel=0, note=72, time=480),
        ]])
        self.assertEqual([(t['port'], t['program'], t['notes'][0][2]) for t in tracks],
                         [(1, 40, 60), (2, 73, 72)])

    def test_cross_track_controller_and_pedal(self):
        tracks, _, _, _ = self.read([
            [mido.Message('program_change', channel=0, program=40, time=0),
             mido.Message('control_change', channel=0, control=64, value=127, time=0),
             mido.Message('control_change', channel=0, control=64, value=0, time=960)],
            [mido.Message('note_on', channel=0, note=60, velocity=100, time=0),
             mido.Message('note_off', channel=0, note=60, time=480)],
        ])
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0]['program'], 40)
        self.assertAlmostEqual(tracks[0]['notes'][0][1], 1.0)

    def test_type_zero_channel_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'tools/scores/score.mid'
            path.parent.mkdir(parents=True)
            midi = mido.MidiFile(type=0, ticks_per_beat=480)
            track = mido.MidiTrack([
                mido.Message('program_change', channel=0, program=40, time=0),
                mido.Message('program_change', channel=1, program=73, time=0),
                mido.Message('note_on', channel=0, note=60, velocity=90, time=0),
                mido.Message('note_on', channel=1, note=72, velocity=90, time=0),
                mido.Message('note_off', channel=0, note=60, time=480),
                mido.Message('note_off', channel=1, note=72, time=0),
            ])
            midi.tracks.append(track)
            midi.save(path)
            spec = {'id': 'fixture', 'file': 'score.mid', 'source': {'label': 'fixture'},
                    'parts': {'0:0:1': {'section': 'picc', 'inst': 'piccolo'}}}
            piece = realize(spec, root)
            self.assertEqual({(t['sourceChannel'], t['section'], t['inst']) for t in piece['tracks']},
                             {(0, 'vn1', 'violin'), (1, 'picc', 'piccolo')})

    def test_overlapping_same_pitch_note_ons_are_both_retained(self):
        tracks, _, _, _ = self.read([[
            mido.Message('note_on', note=60, velocity=80, time=0),
            mido.Message('note_on', note=60, velocity=90, time=240),
            mido.Message('note_off', note=60, time=240),
            mido.Message('note_off', note=60, time=240),
        ]])
        self.assertEqual(len(tracks[0]['notes']), 2)
        self.assertEqual([n[3] for n in tracks[0]['notes']], [80, 90])

    def test_channel_expression_and_velocity_zero_note_off(self):
        tracks, _, _, _ = self.read([[
            mido.Message('control_change', channel=0, control=11, value=64, time=0),
            mido.Message('note_on', channel=0, note=60, velocity=100, time=0),
            mido.Message('note_on', channel=0, note=60, velocity=0, time=480),
            mido.Message('note_on', channel=1, note=64, velocity=100, time=0),
            mido.Message('note_off', channel=1, note=64, time=480),
        ]])
        by_channel = {t['channel']: t['notes'] for t in tracks}
        self.assertEqual(by_channel[0][0][3], round(100 * 64 / 127))
        self.assertEqual(by_channel[1][0][3], 100)

    def test_pitchwheel_rpn_and_excerpt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'tools/scores/score.mid'
            path.parent.mkdir(parents=True)
            midi_file([[
                mido.Message('control_change', control=101, value=0, time=0),
                mido.Message('control_change', control=100, value=0, time=0),
                mido.Message('control_change', control=6, value=12, time=0),
                mido.Message('pitchwheel', pitch=4096, time=0),
                mido.Message('note_on', note=60, velocity=90, time=0),
                mido.Message('pitchwheel', pitch=0, time=480),
                mido.Message('pitchwheel', pitch=-4096, time=480),
                mido.Message('note_off', note=60, time=480),
            ]]).save(path)
            parts, _, _, _ = read_midi(path)
            self.assertEqual(parts[0]['bends'], [[0.0, 600.0], [0.5, 0.0], [1.0, -600.0]])
            piece = realize({'id': 'fixture', 'file': 'score.mid', 'source': {'label': 'fixture'},
                             'excerptSeconds': [0.25, 1.5], 'tempoScale': 2}, root)
            self.assertEqual(piece['tracks'][0]['bends'], [[0, 600.0], [0.125, 0.0], [0.375, -600.0]])


if __name__ == '__main__':
    unittest.main()
