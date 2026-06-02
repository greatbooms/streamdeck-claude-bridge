#!/usr/bin/env python3
"""
PoC 2: iTerm2 의 '특정 세션에만' 키 시퀀스를 주입한다.

세션은 UUID(또는 'wXtYpZ:UUID' 전체 ITERM_SESSION_ID)로 지목한다.
async_send_text 는 포커스와 무관하게 해당 세션 객체로 직접 전송하므로,
백그라운드 탭/다른 창에 있어도 정확히 그 세션에만 들어간다.

목적:
  1) "정확한 한 세션에만 키가 들어가는가" 실증 (오발사 없음 확인)
  2) AskUserQuestion CLI 메뉴를 '무슨 키로' 고르는지 실측으로 찾기
     (방향키↓+Enter? 숫자키? multiSelect 는 Space?)

사전조건:
  - iTerm2 Settings > General > Magic > "Enable Python API" 체크
  - pip install iterm2  (설치 완료됨)

사용 예:
  # zsh 세션에 안전하게 텍스트 한 줄 (어느 탭에 들어가는지 눈으로 확인)
  python3 scripts/inject-keys.py --session 90A8511B-... --keys "echo HELLO_FROM_STREAMDECK,enter"

  # AskUserQuestion 에서 3번째 선택지 시도: 방향키 아래 2번 + Enter
  python3 scripts/inject-keys.py --session 3BDEAF5E-... --keys "down,down,enter"

  # 직전 훅 이벤트가 기록한 세션으로 자동 타겟 (logs/hook-events.jsonl 마지막 항목)
  python3 scripts/inject-keys.py --from-last-hook --keys "down,enter"

--keys 토큰 규칙 (콤마로 구분):
  up/down/left/right  방향키 이스케이프
  enter/return        \r
  space               스페이스
  tab                 \t
  esc                 \x1b
  delN (예: del100ms) 다음 키까지 N밀리초 대기  ← 메뉴 렌더 타이밍용
  그 외 토큰          글자 그대로 (예: echo HELLO, 1, y)
"""

import argparse
import asyncio
import json
import os
import re
import sys

import iterm2

KEYMAP = {
    "up": "\x1b[A",
    "down": "\x1b[B",
    "right": "\x1b[C",
    "left": "\x1b[D",
    "enter": "\r",
    "return": "\r",
    "space": " ",
    "tab": "\t",
    "esc": "\x1b",
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSONL = os.path.join(SCRIPT_DIR, "..", "logs", "hook-events.jsonl")


def normalize_session_id(raw: str) -> str:
    """'wXtYpZ:UUID' 면 ':' 뒤 UUID 만, 아니면 그대로."""
    if raw and ":" in raw:
        return raw.split(":", 1)[1]
    return raw


def last_hook_session() -> str:
    """logs/hook-events.jsonl 마지막 줄의 iterm_session_id 반환."""
    if not os.path.exists(JSONL):
        sys.exit(f"훅 로그 없음: {JSONL}")
    last = None
    with open(JSONL, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                last = line
    if not last:
        sys.exit("훅 로그가 비어 있음")
    sid = json.loads(last).get("iterm_session_id", "")
    if not sid:
        sys.exit("직전 훅 이벤트에 iterm_session_id 가 비어 있음 "
                 "(iTerm2 CLI 세션에서 발생한 훅인지 확인)")
    return sid


def parse_keys(spec: str):
    """콤마 구분 토큰 → (kind, value) 리스트. kind: 'text' | 'delay'."""
    out = []
    for tok in spec.split(","):
        t = tok.strip()
        if not t:
            continue
        low = t.lower()
        m = re.fullmatch(r"del(\d+)ms", low)
        if m:
            out.append(("delay", int(m.group(1)) / 1000.0))
        elif low in KEYMAP:
            out.append(("text", KEYMAP[low]))
        else:
            out.append(("text", t))  # 글자 그대로
    return out


async def run(connection, target_uuid: str, steps, dry: bool):
    app = await iterm2.async_get_app(connection)
    session = app.get_session_by_id(target_uuid)
    if session is None:
        ids = []
        for w in app.terminal_windows:
            for tb in w.tabs:
                for s in tb.sessions:
                    ids.append(s.session_id)
        sys.exit(f"세션을 못 찾음: {target_uuid}\n현재 세션들: {ids}")

    name = session.name
    print(f"타겟 세션: {target_uuid}\n  title={name!r}")
    print(f"주입 시퀀스: {steps}")
    if dry:
        print("[--dry: 실제 전송 안 함]")
        return

    for kind, val in steps:
        if kind == "delay":
            await asyncio.sleep(val)
        else:
            await session.async_send_text(val)
    print("전송 완료.")


def main():
    ap = argparse.ArgumentParser(description="iTerm2 특정 세션에 키 시퀀스 주입")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--session", help="대상 세션 UUID 또는 wXtYpZ:UUID")
    g.add_argument("--from-last-hook", action="store_true",
                   help="logs/hook-events.jsonl 마지막 항목의 세션으로 타겟")
    ap.add_argument("--keys", required=True, help="콤마 구분 키 시퀀스")
    ap.add_argument("--dry", action="store_true", help="타겟만 확인하고 전송 안 함")
    args = ap.parse_args()

    raw = last_hook_session() if args.from_last_hook else args.session
    target = normalize_session_id(raw)
    steps = parse_keys(args.keys)

    iterm2.run_until_complete(
        lambda conn: run(conn, target, steps, args.dry)
    )


if __name__ == "__main__":
    main()
