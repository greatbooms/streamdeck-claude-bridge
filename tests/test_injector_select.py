import pytest
from bridge.injector import ItermInjector, SessionNotFound


class FakeSession:
    def __init__(self):
        self.sent = []
    async def async_send_text(self, text):
        self.sent.append(text)

class FakeApp:
    def __init__(self, sessions):
        self._sessions = sessions
    def get_session_by_id(self, sid):
        return self._sessions.get(sid)


async def test_select_sends_key_sequence():
    sess = FakeSession()
    inj = ItermInjector()
    inj._app = FakeApp({"U1": sess})
    await inj._select("U1", 3)
    assert sess.sent == ["\x1b[B\x1b[B\r"]

async def test_select_unknown_session_raises():
    inj = ItermInjector()
    inj._app = FakeApp({})
    with pytest.raises(SessionNotFound):
        await inj._select("U1", 1)

async def test_cancel_sends_esc():
    sess = FakeSession()
    inj = ItermInjector()
    inj._app = FakeApp({"U1": sess})
    await inj._cancel("U1")
    assert sess.sent == ["\x1b"]

async def test_select_without_app_raises():
    inj = ItermInjector()
    with pytest.raises(RuntimeError):
        await inj._select("U1", 1)
