"""그림 정리 (6단계): assets_src/<파일>.png → client/public/art/<파일>.webp, manifest.json

실행: npm run art
      npm run art -- --only cards/t2_jeok_3 patrons/heo_jun   (몇 장만)

바나나 프로 원본(붓으로 그린 동양풍, 아무 크기)을 받아서
  1) 맞는 비율로 가운데를 자르고
  2) 게임 크기로 부드럽게 줄이고 (붓 자국·번짐이 살게)
  3) 토큰은 동그랗게 잘라 바깥을 투명하게 하고 (가장자리 부드럽게)
  4) 가벼운 webp로 저장한다.
목록·크기는 tools/art_spec.json (npm run art:list 가 만든다).
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
EXTS = ('.png', '.jpg', '.jpeg', '.webp')
QUALITY = 86  # webp 품질. 그림 78장이 합쳐 몇 MB 안쪽이 되게


def find_src(src_dir: Path, path: str) -> Path | None:
    for ext in EXTS:
        f = src_dir / f'{path}{ext}'
        if f.exists():
            return f
    return None


def center_crop(img: Image.Image, w: int, h: int) -> Image.Image:
    """목표 비율(w:h)로 가운데를 자른다"""
    iw, ih = img.size
    if iw * h > ih * w:  # 너무 넓다
        nw = ih * w // h
        x = (iw - nw) // 2
        return img.crop((x, 0, x + nw, ih))
    nh = iw * h // w
    y = (ih - nh) // 2
    return img.crop((0, y, iw, y + nh))


def shrink(img: Image.Image, w: int, h: int) -> Image.Image:
    return img.resize((w, h), Image.Resampling.LANCZOS)


def round_mask(img: Image.Image) -> Image.Image:
    w, h = img.size
    # 4배로 그린 동그라미를 줄여서 가장자리를 부드럽게
    big = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, w * 4 - 1, h * 4 - 1), fill=255)
    mask = big.resize((w, h), Image.Resampling.LANCZOS)
    alpha = Image.composite(img.getchannel('A'), Image.new('L', (w, h), 0), mask)
    img = img.copy()
    img.putalpha(alpha)
    return img


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')  # Windows 콘솔에서 한글이 깨지지 않게
    ap = argparse.ArgumentParser(description='바나나 프로 원본(붓 그림) → 게임 그림')
    ap.add_argument('--src', default=str(ROOT / 'assets_src'))
    ap.add_argument('--out', default=str(ROOT / 'client' / 'public' / 'art'))
    ap.add_argument('--only', nargs='*', help='이 그림만 (예: cards/t2_jeok_3)')
    args = ap.parse_args()
    src_dir, out_dir = Path(args.src), Path(args.out)

    spec = json.loads((ROOT / 'tools' / 'art_spec.json').read_text(encoding='utf-8'))
    items = spec['items']
    if args.only:
        items = [s for s in items if s['path'] in args.only]

    made, missing = [], []
    for s in items:
        src = find_src(src_dir, s['path'])
        if not src:
            missing.append(s['path'])
            continue
        w, h = s['size']
        img = Image.open(src).convert('RGBA')
        img = shrink(center_crop(img, w, h), w, h)
        if s.get('round'):
            img = round_mask(img)
        dest = out_dir / f"{s['path']}.webp"
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, 'WEBP', quality=QUALITY, method=6)
        made.append(s['path'])

    # 화면은 manifest에 있는 그림만 불러온다 (없으면 코드 그림)
    have = [s['path'] for s in spec['items'] if (out_dir / f"{s['path']}.webp").exists()]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'manifest.json').write_text(json.dumps({'files': have}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    print(f'정리함 {len(made)}장, 게임에 있는 그림 {len(have)}/{len(spec["items"])}장')
    for p in made:
        print(f'  + {p}')
    if missing and not args.only:
        print(f'아직 없는 원본 {len(missing)}장 (docs/그림_목록.md)')


if __name__ == '__main__':
    main()
