#!/usr/bin/env python3
"""각 iTerm2 세션의 화면 마지막 N줄을 덤프 — 주입이 어느 세션에 들어갔는지 교차 확인용."""
import sys
import iterm2

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4


async def main(connection):
    app = await iterm2.async_get_app(connection)
    for w_idx, window in enumerate(app.terminal_windows):
        for t_idx, tab in enumerate(window.tabs):
            for session in tab.sessions:
                contents = await session.async_get_screen_contents()
                # 그리드 전체에서 '비어있지 않은' 줄만 모아 마지막 N개를 보여준다
                # (zsh 화면은 내용이 위쪽에 있고 아래가 빈 줄인 경우가 많음)
                nonblank = []
                for i in range(contents.number_of_lines):
                    s = contents.line(i).string.rstrip()
                    if s:
                        nonblank.append(s)
                print(f"--- 창[{w_idx}]탭[{t_idx}] {session.session_id} ---")
                for ln in nonblank[-N:]:
                    print(f"    {ln}")


iterm2.run_until_complete(main)
