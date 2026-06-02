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


import asyncio
import threading
import logging

log = logging.getLogger("bridge.injector")


class SessionNotFound(Exception):
    pass


class ItermInjector:
    """전용 스레드에서 iTerm2 연결을 유지하고, 다른 루프에서 제출된 주입을 실행한다."""

    def __init__(self):
        self._app = None
        self._loop = None
        self._thread = None
        self._ready = threading.Event()

    # --- 주입 코루틴 (단위 테스트 대상) ---
    async def _select(self, session: str, index: int):
        if self._app is None:
            raise RuntimeError("iTerm2 app not connected")
        s = self._app.get_session_by_id(session)
        if s is None:
            raise SessionNotFound(session)
        await s.async_send_text(key_sequence(index))

    async def _cancel(self, session: str):
        if self._app is None:
            raise RuntimeError("iTerm2 app not connected")
        s = self._app.get_session_by_id(session)
        if s is None:
            raise SessionNotFound(session)
        await s.async_send_text(ESC)

    # --- 스레드세이프 제출 (메인 루프에서 호출) ---
    def submit_select(self, session: str, index: int):
        return asyncio.run_coroutine_threadsafe(self._select(session, index), self._require_loop())

    def submit_cancel(self, session: str):
        return asyncio.run_coroutine_threadsafe(self._cancel(session), self._require_loop())

    def _require_loop(self):
        if self._loop is None:
            raise RuntimeError("iTerm2 injector loop not ready")
        return self._loop

    # --- 연결 스레드 ---
    def start(self, ready_timeout: float = 5.0):
        self._thread = threading.Thread(target=self._run, name="iterm-injector", daemon=True)
        self._thread.start()
        self._ready.wait(timeout=ready_timeout)  # 비치명적: 타임아웃돼도 진행

    def _run(self):
        import iterm2

        async def main(connection):
            self._app = await iterm2.async_get_app(connection)
            self._loop = asyncio.get_event_loop()
            self._ready.set()
            while True:
                await asyncio.sleep(3600)

        while True:
            try:
                iterm2.run_until_complete(main)
            except Exception as e:  # noqa: BLE001
                log.warning("iTerm2 연결 실패/끊김, 3초 후 재연결: %s", e)
                self._app = None
                import time
                time.sleep(3)
