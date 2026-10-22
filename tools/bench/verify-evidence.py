#!/usr/bin/env python3
"""ZIP 전체와 내부 payload의 SHA-256을 확인해. 파일 추출·수정은 하지 않아."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


def digest(stream):
    result = hashlib.sha256()
    while block := stream.read(1024 * 1024):
        result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    if not re.fullmatch(r'[0-9a-f]{64}', expected):
        parser.error('--expected-sha256에는 Git에 기록된 64자리 SHA-256을 지정해.')
    with args.archive.open('rb') as stream:
        actual = digest(stream)
    if actual != expected:
        raise SystemExit(f'FAIL: ZIP SHA-256 불일치: {actual}')
    with zipfile.ZipFile(args.archive) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        rows = manifest['files']
        names = [row['path'] for row in rows]
        if len(names) != len(set(names)) or len(archive.namelist()) != len(set(archive.namelist())):
            raise SystemExit('FAIL: 중복된 파일 경로')
        if set(archive.namelist()) != set(names) | {'README.txt', 'manifest.json'}:
            raise SystemExit('FAIL: manifest와 ZIP 파일 목록 불일치')
        if manifest['payloadFiles'] != len(rows) or manifest['payloadBytes'] != sum(row['bytes'] for row in rows):
            raise SystemExit('FAIL: manifest 개수·바이트 합계 불일치')
        for row in rows:
            if archive.getinfo(row['path']).file_size != row['bytes']:
                raise SystemExit(f'FAIL: 파일 크기 불일치: {row["path"]}')
            with archive.open(row['path']) as stream:
                if digest(stream) != row['sha256']:
                    raise SystemExit(f'FAIL: 파일 SHA-256 불일치: {row["path"]}')
    print(json.dumps({'status': 'PASS', 'archive': str(args.archive), 'sha256': actual,
                      'payloadFiles': len(rows), 'pngFiles': sum(name.endswith('.png') for name in names),
                      'payloadBytes': manifest['payloadBytes']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
