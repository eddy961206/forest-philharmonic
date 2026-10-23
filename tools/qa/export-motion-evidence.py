"""Package actual recorder output as normal-speed MP4s and a local review page.

python3 tools/qa/export-motion-evidence.py work/motion work/motion-export
Requires ffmpeg/ffprobe on PATH and Pillow. Raw WebMs remain in the input folder.
Only release-*, mobile-* and comparison-* recorder files are included.
"""
import gzip
import hashlib
import html
import json
import pathlib
import shutil
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

raw, output = (pathlib.Path(arg).resolve() for arg in sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
parts = output / '.encoding'
parts.mkdir(exist_ok=True)
font_path = next((p for p in [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
] if pathlib.Path(p).exists()), None)
font = ImageFont.truetype(font_path, 22) if font_path else ImageFont.load_default(size=22)


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, stdout=subprocess.DEVNULL)


def duration(file):
    return float(subprocess.check_output([
        'ffprobe', '-v', 'fatal', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(file),
    ]))


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


records = {}
for file in sorted(raw.glob('*.json')):
    if not file.stem.startswith(('release-', 'mobile-', 'comparison-')):
        continue
    video = file.with_suffix('.webm')
    if not video.exists():
        continue
    data = json.loads(file.read_text())
    if 'frames' not in data or 'spec' not in data:
        continue
    if data.get('errors'):
        raise RuntimeError(f'Failed recording: {file.name}: {data["errors"]}')
    if data['spec']['sid'] != 'conductor' and not any(f.get('playing') for f in data['frames']):
        raise RuntimeError(f'No playing frames: {file.name}')
    records[file.stem] = data

if not records:
    raise RuntimeError('No recorder output found')

summaries, telemetry = [], {}
for stem, data in records.items():
    frames = data['frames']
    summary = {k: v for k, v in data.items() if k != 'frames'}
    summary.update(name=stem, frames=len(frames), activeFrames=sum(bool(f.get('playing')) for f in frames),
                   duration=duration(raw / f'{stem}.webm'), rawWebMSHA256=sha(raw / f'{stem}.webm'))
    errors = [j.get('targetError') for f in frames for j in f['joints'].values() if j.get('targetError') is not None]
    summary['maxTargetError'] = max(errors, default=None)
    summaries.append(summary)
    telemetry[stem] = data
(output / 'recording-summary.json').write_text(json.dumps(summaries, indent=2))
(output / 'frame-telemetry.json.gz').write_bytes(gzip.compress(json.dumps(telemetry).encode(), mtime=0))


def render(stem, index, before=None):
    data = records[stem]
    mobile = data.get('mobile', False)
    width = 390 if mobile else 960
    title = f'{data["spec"]["id"]} | {data["spec"]["venue"]} | score {data["setup"]["start"]:.2f}s'
    inputs = ['-i', raw / f'{stem}.webm']
    seconds = duration(raw / f'{stem}.webm')
    if before:
        inputs = ['-i', raw / f'{before}.webm'] + inputs
        width = 1280
        seconds = min(seconds, duration(raw / f'{before}.webm'))
        graph = '[0:v]scale=640:486,fps=30,setpts=PTS-STARTPTS[l];[1:v]scale=640:486,fps=30,setpts=PTS-STARTPTS[r];[l][r]hstack=inputs=2,pad=iw:ih+52:0:52[v];[v][2:v]overlay=0:0,format=yuv420p[out]'
        labels = [(14, f'BEFORE | {data["spec"]["id"]}'), (654, f'AFTER | {data["spec"]["id"]}')]
        audio = '1:a:0'
    else:
        graph = f'[0:v]scale={width}:-2,fps=30,pad=iw:ih+52:0:52[v];[v][1:v]overlay=0:0,format=yuv420p[out]'
        labels = [(12, title if not mobile else f'{data["spec"]["id"]} | Chrome mobile')]
        audio = '0:a:0'
    banner = Image.new('RGB', (width, 52), '#101a23')
    draw = ImageDraw.Draw(banner)
    for x, text in labels:
        draw.text((x, 13), text, font=font, fill='#e9f3ed')
    banner_path = parts / f'banner-{index}.png'
    banner.save(banner_path)
    result = parts / f'part-{index}.mp4'
    run('ffmpeg', '-y', '-v', 'fatal', *inputs, '-i', banner_path, '-filter_complex', graph,
        '-map', '[out]', '-map', audio, '-af', 'aresample=async=1:first_pts=0,apad', '-t', seconds,
        '-c:v', 'libx264', '-crf', '25', '-preset', 'veryfast', '-threads', '2',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', result)
    return result


groups = {
    'performers-review': [s for s, d in records.items() if s.startswith('release-') and not d['spec'].get('mode')],
    'stage-transitions': [f'release-{name}' for name in ['bow', 'exit', 'entry'] if f'release-{name}' in records],
    'mobile-review': [s for s in records if s.startswith('mobile-')],
    'before-after': [f'release-{s.removeprefix("comparison-")}' for s in records if s.startswith('comparison-')],
}
chapters, counter = {}, 0
for name, stems in groups.items():
    if not stems:
        continue
    clips, entries, at = [], [], 0
    for stem in stems:
        before = f'comparison-{stem.removeprefix("release-")}' if name == 'before-after' else None
        clip = render(stem, counter, before)
        counter += 1
        length = duration(clip)
        entries.append({'case': records[stem]['spec']['id'], 'start': at, 'duration': length, 'source': stem, 'comparison': before})
        at += length
        clips.append(clip)
        print(f'{name}: {stem}', flush=True)
    listing = parts / 'concat.txt'
    listing.write_text('\n'.join(f"file '{clip.name}'" for clip in clips))
    run('ffmpeg', '-y', '-v', 'fatal', '-f', 'concat', '-safe', '0', '-i', listing,
        '-c', 'copy', '-movflags', '+faststart', output / f'{name}.mp4')
    chapters[name] = entries
(output / 'chapters.json').write_text(json.dumps(chapters, indent=2))

names = {'before-after': '수정 전후', 'performers-review': '악기별 연속 연주', 'stage-transitions': '인사 · 전체 퇴장 · 전체 입장', 'mobile-review': 'Chrome 모바일 에뮬레이션'}
sections = []
for name in ['before-after', 'performers-review', 'stage-transitions', 'mobile-review']:
    if name not in chapters:
        continue
    buttons = ''.join(f'<button data-video="{name}" data-time="{item["start"]}">{html.escape(item["case"])}</button>' for item in chapters[name])
    sections.append(f'<section><h2>{names[name]}</h2><video id="{name}" controls playsinline preload="metadata" src="{name}.mp4"></video><nav>{buttons}</nav></section>')
(output / 'review.html').write_text('''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>숲속 필하모닉 동작 검증</title><style>
body{margin:0;background:#111a18;color:#e8f0eb;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px}h1{font-size:30px}p{color:#b8c9c1}section{margin:40px 0}video{width:100%;max-height:75vh;background:#080b0a;border-radius:12px}nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}button{background:#29463b;border:1px solid #547464;color:white;padding:8px 12px;border-radius:8px;cursor:pointer}button:hover{background:#3c6554}a{color:#b2dec5}</style><main><h1>숲속 필하모닉 · 동작 검증</h1><p>실제 앱의 연주 화면과 소리를 녹화했어. 영상 아래의 악기 이름을 누르면 해당 구간으로 바로 이동해. 수정 전후는 왼쪽이 이전 커밋, 오른쪽이 수정본이야. 두 영상 모두 정상 속도야.</p><p>전체 곡의 수치 검사와 대표 연속 영상 검토를 함께 진행했어. 모바일 영상은 Mac의 Chrome 에뮬레이션이며 실제 iPhone 촬영은 아니야.</p>''' + ''.join(sections) + '''</main><script>
document.querySelectorAll('button[data-video]').forEach(b=>b.onclick=()=>{document.querySelectorAll('video').forEach(v=>v.pause());const v=document.getElementById(b.dataset.video);v.currentTime=Number(b.dataset.time);v.play();});</script></html>''')
shutil.rmtree(parts)
