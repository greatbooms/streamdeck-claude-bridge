"""iTerm2 키 주입: 순수 키시퀀스 빌더 + (Task 7) 연결 관리 클래스."""

DOWN = "\x1b[B"
UP = "\x1b[A"
ENTER = "\r"
ESC = "\x1b"


def key_sequence(index: int) -> str:
    """메뉴 N번째 선택 = 아래화살표 ×(N-1) + Enter. index는 1-based."""
    if index < 1:
        raise ValueError("index must be >= 1")
    return DOWN * (index - 1) + ENTER
