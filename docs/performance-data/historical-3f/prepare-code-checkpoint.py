"""Prepare an integration checkpoint on top of the published tooling commit."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent.parent
repo = root / 'forest-integration-3f'
parent = 'd3b81da0ca07aa6a9c475cdc1545a8171c4af720'
baseline = '3f1655b0c035a630adbcfbf19582dd9363386f34'
def git(*args):
    return subprocess.check_output(['git', '-C', str(repo), *args])
old = {}
for raw in git('ls-tree', '-rz', parent).split(b'\0'):
    if not raw:
        continue
    meta, name = raw.split(b'\t', 1)
    mode, kind, sha = meta.decode().split()
    old[name.decode()] = (mode, kind, sha)
names = sorted({x.decode() for x in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0') if x})
entries, manifest = [], []
for name in names:
    if name not in {'.gitignore', 'README.md', 'package.json', 'server.js'} and not name.startswith(('public/', 'server/', 'tests/')):
        continue
    target = repo / name
    if target.is_symlink() or not target.is_file():
        raise ValueError(name)
    data = target.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    previous = old.get(name)
    if previous and previous[2] == blob:
        continue
    mode = previous[0] if previous else '100644'
    entries.append({'path': name, 'mode': mode, 'type': 'blob', 'content': data.decode('utf-8')})
    manifest.append({'path': name, 'mode': mode, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'gitBlobSha': blob})
out = root / 'qa-3f-code-checkpoint-final'
out.mkdir(exist_ok=True)
if any(out.iterdir()):
    raise ValueError('Refuse to replace existing checkpoint payload')
chunks, batch, size = [], [], 0
for entry in entries:
    count = len(json.dumps(entry, ensure_ascii=False).encode())
    if batch and size + count > 70000:
        chunks.append(batch)
        batch, size = [], 0
    batch.append(entry)
    size += count
if batch:
    chunks.append(batch)
for i, batch in enumerate(chunks):
    (out / f'entries-{i}.json').write_text(json.dumps(batch, ensure_ascii=False), encoding='utf-8')
record = {'parent': parent, 'additionalParent': baseline, 'files': manifest, 'chunks': len(chunks)}
(out / 'manifest.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
for entry in manifest:
    if hashlib.sha256((repo / entry['path']).read_bytes()).hexdigest() != entry['sha256']:
        raise ValueError('Source changed while snapshotting: ' + entry['path'])
print(json.dumps({'parent': parent, 'additionalParent': baseline, 'files': len(manifest), 'chunks': len(chunks), 'bytes': sum(e['bytes'] for e in manifest), 'paths': [e['path'] for e in manifest]}, ensure_ascii=False))
