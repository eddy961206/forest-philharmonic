#!/usr/bin/env python3
"""Build added performances and the expanded Elgar march from checked-in source MIDI.

python3 -m pip install -r tools/requirements-music.txt
python3 tools/build_repertoire.py
python3 tools/build_repertoire.py --check  # deterministic verification
"""
from pathlib import Path
import hashlib
import json
import sys
from midi_score import realize
ROOT=Path(__file__).resolve().parent.parent
INDEX_KEYS=('id','title','titleKo','composer','composerKo','year','ensembleKo','duration','mood','finale','conducted','referenceUrl','editionKo')

def build(existing, filters=(), check=False):
    catalog=json.loads((ROOT/'tools/repertoire.json').read_text())
    ids={p['id'] for p in catalog};index=[p for p in existing if p['id'] not in ids]
    for spec in catalog:
        source=ROOT/'tools/scores'/spec['file']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=spec['source']['sha256']:
            raise ValueError('Source checksum mismatch: '+spec['file'])
        target=ROOT/'public/music'/f"{spec['id']}.json"
        if filters and not any(x in spec['id'] for x in filters) and target.exists():
            p=json.loads(target.read_text())
        else:
            p=realize(spec,ROOT)
            content=json.dumps(p,ensure_ascii=False,separators=(',',':'))+'\n'
            if check:
                if not target.exists() or target.read_text()!=content:raise ValueError('Generated score differs: '+str(target))
            else:target.write_text(content)
            print(f"{p['id']:34s} {p['duration']:7.1f}s {len(p['tracks']):2d} tracks {sum(len(t['notes'])//4 for t in p['tracks']):6d} notes")
        index.append({k:p[k] for k in INDEX_KEYS if k in p})
    return index

def main():
    path=ROOT/'public/music/index.json';old=json.loads(path.read_text());check='--check' in sys.argv
    index=build(old,[x for x in sys.argv[1:] if x!='--check'],check=check)
    if check:
        if old!=index:raise ValueError('Index differs')
    else:path.write_text(json.dumps(index,ensure_ascii=False,indent=1)+'\n')
if __name__=='__main__':main()
