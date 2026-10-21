#!/usr/bin/env python3
"""기준 3f 원본은 읽기만 하고, 작은 Git 검증 묶음과 무결성 manifest를 만들어."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

SELECTED = [
    'full-hall-high-desktop-sync-front',
    'full-hall-high-desktop-sync-wide',
    'full-sphere-high-desktop-sync-dome',
    'full-sphere-high-desktop-sync-forest',
    'full-sphere-high-desktop-sync-crossfade',
    'full-sphere-high-desktop-sync-broadcast',
]


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--qa-root', type=Path, required=True)
    p.add_argument('--analysis-root', type=Path, required=True)
    p.add_argument('--repo-root', type=Path, required=True)
    p.add_argument('--output-root', type=Path, required=True)
    p.add_argument('--candidate-commit', required=True)
    args = p.parse_args()
    source, analysis, repo, target = [x.resolve() for x in (args.qa_root,args.analysis_root,args.repo_root,args.output_root)]
    assert source != target and source not in target.parents
    assert not target.exists() or not list(target.iterdir()), '기존 큐레이션은 덮어쓰지 않아.'
    keep_png = {f'{side}-{stem}.png' for stem in SELECTED for side in ['baseline','after']}
    inventory, copied = [], []
    for original in sorted(source.rglob('*')):
        if not original.is_file():
            continue
        assert not original.is_symlink()
        relative = original.relative_to(source)
        keep = original.suffix != '.png' or original.name in keep_png
        row = {'file':relative.as_posix(),'bytes':original.stat().st_size,'sha256':digest(original),'includedInGitBundle':keep}
        inventory.append(row)
        if keep:
            out = target / relative
            out.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(original,out)
            assert digest(out) == row['sha256'] and out.stat().st_size == row['bytes']
            copied.append(row['file'])
    for name in ['summary.json','summary.csv','collector.stdout.log','collector.stderr.log','image-analysis.stdout.log','image-analysis.stderr.log']:
        dest=target/'analysis'/name
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(analysis/name,dest)
    shutil.copytree(analysis/'comparisons',target/'analysis/comparisons')
    shutil.copytree(analysis/'visual-metrics',target/'analysis/visual-metrics')
    for name in ['compare-3f-images.py','curate-3f.py']:
        dest=target/'recovery'/name
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(analysis/name,dest)
    save(target/'original-inventory.json',{
        'schema':1,'sourceRootAtRecovery':str(source),'allOriginalFiles':len(inventory),
        'allOriginalBytes':sum(r['bytes'] for r in inventory),'copiedFiles':len(copied),
        'originalPngCount':sum(r['file'].endswith('.png') for r in inventory),
        'copiedPngCount':sum(n.endswith('.png') for n in copied),'selectedPngPairs':SELECTED,
        'selectionReason':'Git에는 대표 6쌍만 보존해. 3f plan에는 foyer가 없어 그 대신 hall wide를 보존했어. 나머지 원본 PNG는 전체 증거 압축본의 같은 qa-3f/render 경로에 있어. 이미지 63쌍의 지표는 모두 재계산해 analysis에 남겨.',
        'files':inventory,
    })
    initial=json.loads((source/'source-manifest.json').read_text())
    proof=[]
    for f in initial['files']:
        entry={'file':f['file']}
        for side,revision in [('baseline',initial['baseline']),('candidate',args.candidate_commit)]:
            expected=f.get(side+'Sha256')
            result=subprocess.run(['git','show',f'{revision}:{f["file"]}'],cwd=repo,capture_output=True)
            if expected is None:
                match=result.returncode != 0
                actual=None if match else hashlib.sha256(result.stdout).hexdigest()
            else:
                assert result.returncode == 0, result.stderr.decode()
                actual=hashlib.sha256(result.stdout).hexdigest()
                match=actual == expected
            entry[side]={'revision':revision,'expectedSha256':expected,'actualSha256':actual,'match':match}
        proof.append(entry)
    tools=[]
    for t in initial['tools']:
        rel=Path(t['file']).relative_to('qa-3f')
        actual=digest(source/rel)
        tools.append({'file':rel.as_posix(),'expectedSha256':t['sha256'],'actualSha256':actual,'match':actual==t['sha256']})
    status='PASS' if all(r[side]['match'] for r in proof for side in ['baseline','candidate']) and all(t['match'] for t in tools) else 'FAIL'
    save(target/'recovery/candidate-recovery-check.json',{
        'status':status,'baseline':initial['baseline'],'candidateRawLabel':initial['candidate'],
        'recoveredCandidateCommit':args.candidate_commit,'sourceFiles':proof,'frozenTools':tools,
        'note':'원래 측정의 revision 라벨은 변경하지 않았어. 나중에 복구한 Git 커밋의 bytes가 당시 source-manifest와 일치하는지 별도 검사했어. 최신 main 통합본의 성능을 증명하는 검사는 아니야.',
    })
    assert status=='PASS','복구 커밋/원본 snapshot 불일치가 있어.'
    # Record hashes of curated payloads; this file cannot hash itself.
    manifest=[]
    for out in sorted(target.rglob('*')):
        if out.is_file():
            manifest.append({'file':out.relative_to(target).as_posix(),'bytes':out.stat().st_size,'sha256':digest(out),'kind':'bytecopy-original' if out.relative_to(target).as_posix() in copied else 'recovery-derived'})
    save(target/'manifest.json',{
        'schema':1,'baseline':initial['baseline'],'candidateRecoveryCommit':args.candidate_commit,
        'copyIntegrity':'PASS','sourceUnmodified':True,'payloadFiles':len(manifest),
        'payloadBytes':sum(x['bytes'] for x in manifest),'originalInventory':'original-inventory.json',
        'note':'모든 copied original 파일은 복사 직후 bytes와 SHA-256이 일치했어. 이 manifest 자체와 나중에 작성한 README는 자기참조 해시에서 제외해. 무결성 PASS는 기능/성능 PASS가 아니야.',
        'files':manifest,
    })
    print(json.dumps({'status':status,'payloadFiles':len(manifest),'copiedOriginals':len(copied),'sourceFiles':len(proof),'frozenTools':len(tools),'pngPairs':len(SELECTED)},ensure_ascii=False))


if __name__=='__main__':
    main()
