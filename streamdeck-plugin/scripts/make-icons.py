#!/usr/bin/env python3
"""Stream Deck 플러그인 아이콘/배너 생성 (Pillow).

생성물 (com.shinsanghoon.claude-bridge.sdPlugin/imgs 하위):
  actions/answer/{key,icon}{,@2x}.png   답변 버튼(다크 배경 + 하단 코랄 바)
  actions/cancel/{key,icon}{,@2x}.png   취소 버튼(코랄 ✕ + Esc)
  actions/logo/{key,icon}{,@2x}.png     단일 Claude Code 로고
  banner/{1..5}{,@2x}.png               첫 줄 스팬용 5조각 배너
  plugin/{category-icon,marketplace}{,@2x}.png

브랜드: bg #1a1714, 코랄 #D97757, 크림 #F1 E9 DD.
실행: python3 scripts/make-icons.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..",
                    "com.shinsanghoon.claude-bridge.sdPlugin", "imgs")

BG = (26, 23, 20)          # #1a1714
CORAL = (217, 119, 87)     # #D97757
CREAM = (241, 233, 221)    # #F1E9DD
RED = (192, 70, 60)        # cancel ✕

FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


def base(size, bg=BG):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = max(8, size // 9)
    d.rounded_rectangle([2, 2, size - 3, size - 3], radius=r, fill=bg)
    return img, d


def draw_spark(d, cx, cy, R, color, points=6, inner=0.32, width=0):
    """N갈래 스파클(✻)을 채워진 별로 그린다."""
    pts = []
    for i in range(points * 2):
        ang = math.pi * i / points - math.pi / 2
        rad = R if i % 2 == 0 else R * inner
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, fill=color)


def center_text(d, box, text, fnt, fill, stroke=0, stroke_fill=None):
    l, t, r, b = d.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    w, h = r - l, b - t
    x = box[0] + (box[2] - box[0] - w) / 2 - l
    y = box[1] + (box[3] - box[1] - h) / 2 - t
    d.text((x, y), text, font=fnt, fill=fill, stroke_width=stroke,
           stroke_fill=stroke_fill)


def save(img, path_2x):
    """144 마스터 저장 + 72 다운스케일 저장."""
    os.makedirs(os.path.dirname(path_2x), exist_ok=True)
    img.save(path_2x)
    one = path_2x.replace("@2x", "")
    img.resize((72, 72), Image.LANCZOS).save(one)


def answer_key():
    img, d = base(144)
    d.rounded_rectangle([2, 118, 141, 141], radius=10, fill=BG)
    d.rectangle([14, 128, 130, 134], fill=CORAL)  # 하단 코랄 바
    return img


def answer_icon():
    img, d = base(144)
    draw_spark(d, 72, 60, 30, CORAL)
    center_text(d, (0, 96, 144, 132), "Answer", font(26), CREAM)
    return img


def cancel_key():
    img, d = base(144)
    cx, cy = 72, 58
    d.line([cx - 26, cy - 26, cx + 26, cy + 26], fill=RED, width=14)
    d.line([cx - 26, cy + 26, cx + 26, cy - 26], fill=RED, width=14)
    center_text(d, (0, 96, 144, 134), "Esc", font(30), CREAM)
    return img


def cancel_icon():
    return cancel_key()


def logo_single():
    img, d = base(144)
    draw_spark(d, 72, 50, 28, CORAL)
    center_text(d, (0, 84, 144, 110), "CLAUDE", font(22), CREAM)
    center_text(d, (0, 108, 144, 134), "CODE", font(22), CORAL)
    return img


def banner_tiles():
    """720x144 스트립에 ✻ CLAUDE CODE 를 그려 5조각으로 자른다."""
    W, H = 720, 144
    strip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(strip)
    d.rounded_rectangle([2, 2, W - 3, H - 3], radius=16, fill=BG)
    draw_spark(d, 120, 72, 44, CORAL)
    f = font(64)
    # "CLAUDE CODE" 를 스파크 오른쪽에 배치
    d.text((196, 40), "CLAUDE ", font=f, fill=CREAM)
    cl_w = d.textlength("CLAUDE ", font=f)
    d.text((196 + cl_w, 40), "CODE", font=f, fill=CORAL)
    tiles = []
    for i in range(5):
        tiles.append(strip.crop((i * 144, 0, (i + 1) * 144, 144)))
    return tiles


def main():
    # actions
    save(answer_key(), os.path.join(ROOT, "actions/answer/key@2x.png"))
    save(answer_icon(), os.path.join(ROOT, "actions/answer/icon@2x.png"))
    save(cancel_key(), os.path.join(ROOT, "actions/cancel/key@2x.png"))
    save(cancel_icon(), os.path.join(ROOT, "actions/cancel/icon@2x.png"))
    save(logo_single(), os.path.join(ROOT, "actions/logo/key@2x.png"))
    save(logo_single(), os.path.join(ROOT, "actions/logo/icon@2x.png"))
    # plugin chrome
    save(logo_single(), os.path.join(ROOT, "plugin/category-icon@2x.png"))
    save(logo_single(), os.path.join(ROOT, "plugin/marketplace@2x.png"))
    # banner tiles
    for i, tile in enumerate(banner_tiles(), start=1):
        save(tile, os.path.join(ROOT, f"banner/{i}@2x.png"))
    print("icons generated under", os.path.normpath(ROOT))


if __name__ == "__main__":
    main()
