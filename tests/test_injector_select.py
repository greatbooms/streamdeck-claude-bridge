import pytest
import iterm2
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


class FakeTab:
    def __init__(self, session):
        self.current_session = session


class FakeWindow:
    def __init__(self, session):
        self.current_tab = FakeTab(session)


class FakeWindowApp(FakeApp):
    def __init__(self, session):
        super().__init__({})
        self.window = FakeWindow(session)

    async def async_create_window(self):
        return self.window


async def test_select_sends_keys_separately():
    # 방향키와 Enter 를 붙여 보내면 TUI 가 down 을 놓치므로, 개별 전송이어야 한다.
    sess = FakeSession()
    inj = ItermInjector(key_delay=0)
    inj._app = FakeApp({"U1": sess})
    await inj._select("U1", 3)
    assert sess.sent == ["\x1b[B", "\x1b[B", "\r"]

async def test_select_index_one_is_just_enter():
    sess = FakeSession()
    inj = ItermInjector(key_delay=0)
    inj._app = FakeApp({"U1": sess})
    await inj._select("U1", 1)
    assert sess.sent == ["\r"]

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


async def test_run_command_opens_window_and_sends_command():
    sess = FakeSession()
    inj = ItermInjector()
    inj._app = FakeWindowApp(sess)
    await inj._run_command("cd /tmp && ./gradlew test")
    assert sess.sent == ["cd /tmp && ./gradlew test\n"]


async def test_run_command_uses_window_api_when_app_has_no_create_window(monkeypatch):
    sess = FakeSession()
    connection = object()

    async def create_window(actual_connection):
        assert actual_connection is connection
        return FakeWindow(sess)

    monkeypatch.setattr(iterm2.Window, "async_create", create_window)
    inj = ItermInjector()
    inj._app = FakeApp({})
    inj._connection = connection

    await inj._run_command("cd /tmp && npm run start:dev")

    assert sess.sent == ["cd /tmp && npm run start:dev\n"]
