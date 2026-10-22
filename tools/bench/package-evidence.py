#!/usr/bin/env python3
"""선택한 증거 폴더를 원본 그대로 ZIP에 넣고 모든 payload 해시를 검증해.

python3 tools/bench/package-evidence.py --output evidence.zip --label '고정 기준선'
    --include qa=/absolute/path/to/qa --include docs=/absolute/path/to/docs

--include의 왼쪽은 ZIP 안의 상대 경로, 오른쪽은 로컬 파일/폴더야.
이미 있는 ZIP을 덮어쓰지 않아. 원본 파일과 메타데이터는 수정하지 않아.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def digest(stream):
    value = hashlib.sha256()
    while block := stream.read(1024 * 1024):
        value.update(block)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--label', required=True)
    parser.add_argument('--include', required=True, action='append', metavar='ZIP_PATH=LOCAL_PATH')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        parser.error('기존 ZIP을 덮어쓰지 않아. 새 이름을 지정해 줘.')
    entries = {}
    for item in args.include:
        name, separator, local = item.partition('=')
        archive_root = PurePosixPath(name)
        if not separator or not name or archive_root.is_absolute() or '..' in archive_root.parts or '\\' in name:
            parser.error('--include는 안전한 상대 ZIP_PATH=LOCAL_PATH 형식이어야 해.')
        source = Path(local).resolve(strict=True)
        files = sorted(source.rglob('*')) if source.is_dir() else [source]
        for path in files:
            if path.is_symlink():
                parser.error(f'심볼릭 링크는 자동 추적하지 않아: {path}')
            if not path.is_file():
                continue
            if path.resolve() == output:
                parser.error('출력 ZIP을 입력으로 포함할 수 없어.')
            relative = archive_root / path.relative_to(source).as_posix() if source.is_dir() else archive_root
            key = str(relative)
            if key in entries or key in ['README.txt', 'manifest.json']:
                parser.error(f'중복 ZIP 경로: {key}')
            entries[key] = path
    if not entries:
        parser.error('포함할 파일이 없어.')
    output.parent.mkdir(parents=True, exist_ok=True)
    inventory = []
    # PNG/JPEG and compressed media are already compressed. Storing those
    # unchanged avoids spending minutes recompressing screenshots.
    compressed = {'.png', '.jpg', '.jpeg', '.webp', '.mp3', '.zip', '.gz', '.woff2'}
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
        for name, source in sorted(entries.items()):
            stat = source.stat()
            with source.open('rb') as stream:
                sha = digest(stream)
            archive.write(source, name, compress_type=zipfile.ZIP_STORED if source.suffix.lower() in compressed else zipfile.ZIP_DEFLATED)
            current = source.stat()
            if (stat.st_size, stat.st_mtime_ns) != (current.st_size, current.st_mtime_ns):
                raise RuntimeError(f'보관 중 원본이 바뀌었어. 이 ZIP을 사용하지 마: {name}')
            inventory.append({'path': name, 'bytes': stat.st_size, 'sha256': sha})
        manifest = {
            'schema': 1, 'label': args.label, 'createdAt': datetime.now(timezone.utc).isoformat(),
            'payloadFiles': len(inventory), 'payloadBytes': sum(row['bytes'] for row in inventory),
            'policy': 'Original payload bytes; selected directory mapping is explicit. A historical PASS, FAIL, or unexecuted plan retains its original meaning. This archive does not establish new test results.',
            'files': inventory,
        }
        archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        archive.writestr('README.txt', f'''{args.label}

manifest.json은 payload 전체의 상대 경로·바이트 수·SHA-256 목록이야.
수치의 기준 버전과 실행 조건은 각 원본 JSON/로그/보고서를 함께 확인해.
실패 결과와 미실행 계획도 원래 상태 그대로 포함할 수 있어.
과거 결과를 최신 main의 실행 결과로 해석하면 안 돼.
소프트웨어 GPU와 모바일 viewport 에뮬레이션을 실물 기기로 해석하면 안 돼.

압축 해제 뒤 Python hashlib.sha256으로 manifest의 각 파일을 대조할 수 있어.
ZIP 생성기는 모든 payload를 ZIP에서 다시 읽어 해시 일치를 확인했어.
''')
    with zipfile.ZipFile(output) as archive:
        for row in inventory:
            with archive.open(row['path']) as stream:
                if digest(stream) != row['sha256']:
                    raise RuntimeError(f'ZIP 검증 실패: {row["path"]}')
    with output.open('rb') as stream:
        archive_sha = digest(stream)
    result = {'status': 'PASS', 'file': str(output), 'bytes': output.stat().st_size,
              'sha256': archive_sha, 'payloadFiles': len(inventory), 'payloadBytes': manifest['payloadBytes']}
    output.with_suffix(output.suffix + '.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
