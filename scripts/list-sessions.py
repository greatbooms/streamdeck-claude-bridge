#!/usr/bin/env python3
"""
PoC 2 준비: iTerm2 의 모든 창/탭/패인 세션을 나열하고
각 세션의 '전역 고유 ID(session_id)' 를 보여준다.

목적: "iTerm2 창이 여러 개, 한 창에 탭이 여러 개"일 때
각 세션이 고유 ID 로 확실히 구분되는지 눈으로 확인한다.
이 ID 가 곧 훅의 ITERM_SESSION_ID 의 ':' 뒤 UUID 와 일치하며,
스트림덱이 답변을 주입할 '정확한 한 세션'을 지목하는 키가 된다.

사전 준비:
  1) iTerm2 > Settings > General > Magic > "Enable Python API" 체크
  2) pip install iterm2   (또는: /Applications/iTerm.app 의 번들 파이썬 사용)
실행:
  python3 scripts/list-sessions.py
  (첫 실행 시 iTerm2 가 'Python API 접근 허용?' 팝업을 띄움 → Allow)
"""

import iterm2


async def main(connection):
    app = await iterm2.async_get_app(connection)

    print("=" * 70)
    print("iTerm2 세션 트리 (창 → 탭 → 세션)")
    print("=" * 70)

    total = 0
    seen_ids = set()
    for w_idx, window in enumerate(app.terminal_windows):
        # 창 위치 인덱스(가변) + 창 ID(고정)
        print(f"\n┌ 창[{w_idx}]  window_id={window.window_id}")
        for t_idx, tab in enumerate(window.tabs):
            print(f"│  ├ 탭[{t_idx}]  tab_id={tab.tab_id}")
            for s_idx, session in enumerate(tab.sessions):
                sid = session.session_id           # ★ 전역 고유 ID
                title = session.name or "<no name>"
                dup = "  ⚠️중복!" if sid in seen_ids else ""
                seen_ids.add(sid)
                total += 1
                print(f"│  │   └ 패인[{s_idx}] session_id={sid}{dup}")
                print(f"│  │       title={title!r}")

    print("\n" + "=" * 70)
    print(f"총 세션 수: {total}   고유 session_id 수: {len(seen_ids)}")
    if total == len(seen_ids):
        print("판정: ✅ 모든 세션이 고유하게 구분됨 (창/탭 많아도 충돌 없음)")
    else:
        print("판정: ⚠️ 중복 발견 — 위 ⚠️ 표시된 항목 확인 필요")
    print("=" * 70)
    print("\n팁: 훅에서 받은 ITERM_SESSION_ID 가 'wXtYpZ:UUID' 라면,")
    print("    ':' 뒤 UUID 가 위 session_id 중 하나와 일치한다 →")
    print("    app.get_session_by_id(UUID) 로 그 세션만 골라 키 주입 가능.")


if __name__ == "__main__":
    # run_until_complete: 끝나면 연결 종료
    iterm2.run_until_complete(main)
