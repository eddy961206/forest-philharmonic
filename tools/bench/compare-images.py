#!/usr/bin/env python3
"""같은 해상도의 스크린샷 두 장을 비교해. 앱/GPU는 실행하지 않아.

개발 환경에만 Pillow와 NumPy가 필요해. RMSE/MAE는 8-bit RGB 값 단위야.
SSIM: RGB 채널별 7x7 균일 창, K1=.01, K2=.03, data_range=255,
표본 공분산 49/48, valid 창만 사용(가장자리 3px 제외), 채널/창 평균.
"""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('--output', type=Path, help='JSON을 저장할 경로야. 생략하면 표준 출력에만 써.')
    parser.add_argument('--threshold', type=int, default=0, help='변경 픽셀 판정: RGB 중 한 채널이라도 이 값보다 많이 달라야 해. 기본값 0.')
    parser.add_argument('--crop', help='같은 영역만 비교하려면 x,y,width,height를 지정해. 자동 정렬/크기 조절은 하지 않아.')
    args = parser.parse_args()
    if not 0 <= args.threshold <= 255:
        parser.error('--threshold는 0~255여야 해.')
    try:
        import numpy as np
        from PIL import Image
    except ImportError as error:
        raise SystemExit('별도 개발 환경에 Pillow와 NumPy를 설치해 줘: python3 -m pip install Pillow numpy') from error

    def load(filename):
        with Image.open(filename) as source:
            # PNG alpha를 무시하지 않고 두 이미지 모두 검정 배경에 합성해.
            rgba = source.convert('RGBA')
            rgb = Image.alpha_composite(Image.new('RGBA', rgba.size, (0, 0, 0, 255)), rgba).convert('RGB')
            return np.asarray(rgb, dtype=np.float64)

    a, b = load(args.before), load(args.after)
    if a.shape != b.shape:
        parser.error(f'해상도가 달라: {a.shape} vs {b.shape}. 같은 크기로 다시 캡처해 줘.')
    original_size = [a.shape[1], a.shape[0]]
    crop = None
    if args.crop:
        try:
            crop = [int(n) for n in args.crop.split(',')]
            if len(crop) != 4:
                raise ValueError()
            x, y, w, h = crop
            if min(x, y) < 0 or min(w, h) <= 0 or x + w > a.shape[1] or y + h > a.shape[0]:
                raise ValueError()
        except ValueError:
            parser.error('--crop은 이미지 안의 x,y,width,height 정수 네 개여야 해.')
        a, b = a[y:y+h, x:x+w], b[y:y+h, x:x+w]
    if min(a.shape[:2]) < 7:
        parser.error('SSIM을 계산할 영역의 가로와 세로가 각각 7px 이상이어야 해.')

    # Integral images compute the same 7x7 uniform average without constructing
    # a large H x W x 3 x 7 x 7 sliding-window allocation.
    def mean7(array):
        integral = np.pad(array, ((1, 0), (1, 0), (0, 0))).cumsum(axis=0).cumsum(axis=1)
        return (integral[7:, 7:] - integral[:-7, 7:] - integral[7:, :-7] + integral[:-7, :-7]) / 49.0

    ux, uy = mean7(a), mean7(b)
    covariance_scale = 49.0 / 48.0
    vx = covariance_scale * (mean7(a * a) - ux * ux)
    vy = covariance_scale * (mean7(b * b) - uy * uy)
    vxy = covariance_scale * (mean7(a * b) - ux * uy)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ssim_map = ((2 * ux * uy + c1) * (2 * vxy + c2)) / ((ux * ux + uy * uy + c1) * (vx + vy + c2))
    diff = np.abs(a - b)
    changed = np.any(diff > args.threshold, axis=2)
    result = {
        'before': str(args.before), 'after': str(args.after),
        'sha256': [hashlib.sha256(p.read_bytes()).hexdigest() for p in (args.before, args.after)],
        'sourceSize': original_size, 'comparedSize': [a.shape[1], a.shape[0]], 'crop': crop,
        'colorPolicy': '8-bit encoded RGB; alpha composited over black; no linear-light conversion, resizing or alignment',
        'mae': float(diff.mean()), 'rmse': float(np.sqrt((diff * diff).mean())),
        'maxChannelDifference': float(diff.max()),
        'changedPixelPercent': float(changed.mean() * 100), 'changedPixelCount': int(changed.sum()),
        'changedThreshold': args.threshold,
        'ssimUniform7': float(ssim_map.mean()),
        'ssimChannels': [float(x) for x in ssim_map.mean(axis=(0, 1))],
        'ssimDefinition': {'window': [7, 7], 'weights': 'uniform', 'dataRange': 255, 'K1': 0.01, 'K2': 0.03, 'covariance': 'sample 49/48', 'border': 'valid windows; exclude outer 3 pixels', 'channels': 'mean of RGB channel SSIM'},
        'interpretation': '수치는 픽셀 차이의 크기야. 음악 시각·카메라·노출·프리셋·DPR·폰트·시나리오 순서·프레임 수를 맞추고 두 이미지를 직접 봐. SSIM 하나로 품질 통과/실패를 판정하지 않아.',
    }
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
    print(text, end='')


if __name__ == '__main__':
    main()
