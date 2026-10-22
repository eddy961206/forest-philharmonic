"""Recheck the recorded byte-equality claims from archived source files."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent
metadata = json.loads((root / 'source-comparison.json').read_text())

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

def extract(text, start, end=None):
    assert text.count(start) == 1, start
    tail = text.split(start, 1)[1]
    if end is not None:
        assert tail.count(end) == 1, end
        tail = tail.split(end, 1)[0]
    return start + tail

for entry in metadata['exactRegionComparisons']:
    name = entry['name']
    filename = 'crowd' if name.startswith('Full crowd') else 'performance' if name.startswith('Entire transport') else 'engine'
    first = (root / 'product-sources' / f'e741811-{filename}.js').read_text()
    second = (root / 'product-sources' / f'6c78172-{filename}.js').read_text()
    if entry['start']:
        first = extract(first, entry['start'], entry['end'])
        second = extract(second, entry['start'], entry['end'])
    assert first == second
    assert digest(first) == entry['baselineSha256'] == entry['candidateSha256']
    print('PASS exact source region:', name)

gate = metadata['originalTwoSecondGate']
before = (root.parent / 'snapshots' / 'audio-resume.mjs').read_text()
after = (root / 'tool-sources' / 'audio-resume.mjs').read_text()
first = extract(before, gate['start'], gate['end'])
second = extract(after, gate['start'], gate['end'])
assert first == second and digest(first) == gate['sha256']
print('PASS original two-second resume gate and FAIL classification retained byte for byte')
