# 브릿지 서버 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클로드코드(iTerm2 CLI)의 AskUserQuestion 질문을 로컬 브릿지로 미러링하고, 클라이언트 버튼으로 단일선택 답을 해당 iTerm2 세션에 주입하는 Python 서버를 만든다.

**Architecture:** 순수 Python 단일 프로세스. aiohttp가 메인 스레드에서 HTTP(훅 수신)+WebSocket(클라이언트)+정적 서빙을 담당하고, iTerm2 제어는 전용 스레드에서 `iterm2.run_until_complete`로 상시 연결을 유지한다. 두 루프는 `asyncio.run_coroutine_threadsafe`로 연결한다.

**Tech Stack:** Python 3.10+, aiohttp, iterm2(Python API), pytest / pytest-asyncio / pytest-aiohttp.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `pyproject.toml` | 패키지/의존성/pytest 설정 |
| `bridge/__init__.py` | 패키지 마커 |
| `bridge/models.py` | `Option`, `Question` 데이터모델 + `normalize_session_id` + `question_from_hook` |
| `bridge/state.py` | `PendingStore` (UUID키 보류 질문 저장소) |
| `bridge/injector.py` | `key_sequence`(순수) + `ItermInjector`(iTerm2 연결/주입, 전용 스레드) |
| `bridge/ws.py` | `Hub`(클라 레지스트리/브로드캐스트) + `make_ws_handler` |
| `bridge/hooks_api.py` | `/hook/question`, `/hook/resolved` HTTP 핸들러 |
| `bridge/server.py` | `make_app` 라우트 와이어링 + `run` 진입 |
| `bridge/__main__.py` | `python -m bridge` 진입점 |
| `webclient/index.html`, `webclient/app.js` | 브라우저 테스트 클라이언트 |
| `.claude/hooks/on-question.sh`, `on-resolved.sh` | curl 훅 |
| `.claude/settings.json` | 훅 등록(기존 교체) |
| `tests/test_*.py` | 단위/통합 테스트 |

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `pyproject.toml`
- Create: `bridge/__init__.py`
- Create: `tests/test_smoke.py`

- [ ] **Step 1: pyproject.toml 작성**

```toml
[project]
name = "streamdeck-claude-bridge"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["aiohttp>=3.9", "iterm2>=2.0"]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23", "pytest-aiohttp>=1.0"]

[tool.setuptools]
packages = ["bridge"]

[tool.pytest.ini_options]
asyncio_mode = "auto"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [ ] **Step 2: 패키지 마커와 스모크 테스트 작성**

`bridge/__init__.py`:
```python
"""streamdeck-claude-bridge: 클로드 질문 미러링 + iTerm2 답변 주입 브릿지."""
```

`tests/test_smoke.py`:
```python
def test_package_imports():
    import bridge
    assert bridge is not None
```

- [ ] **Step 3: 개발 모드 설치**

Run: `python3 -m pip install -e ".[dev]"`
Expected: 성공(aiohttp, iterm2, pytest 설치/확인).

- [ ] **Step 4: 스모크 테스트 통과 확인**

Run: `python3 -m pytest tests/test_smoke.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml bridge/__init__.py tests/test_smoke.py
git commit -m "chore: scaffold bridge package and test setup"
```

---

## Task 2: 데이터 모델 + 훅 페이로드 파싱

**Files:**
- Create: `bridge/models.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_models.py`:
```python
from bridge.models import normalize_session_id, question_from_hook, Question, Option


def test_normalize_strips_position_prefix():
    assert normalize_session_id("w0t1p0:ABC-123") == "ABC-123"

def test_normalize_passthrough_when_no_colon():
    assert normalize_session_id("ABC-123") == "ABC-123"

def test_normalize_empty():
    assert normalize_session_id("") == ""

def test_question_from_hook_single():
    body = {
        "iterm_session_id": "w0t1p0:UUID-1",
        "claude_session_id": "cs-9",
        "questions": [{
            "header": "작업 선택",
            "question": "무엇을?",
            "multiSelect": False,
            "options": [
                {"label": "코드 작성", "description": "새 코드"},
                {"label": "버그 수정", "description": "고치기"},
            ],
        }],
    }
    q = question_from_hook(body)
    assert q.session == "UUID-1"
    assert q.claude_session_id == "cs-9"
    assert q.header == "작업 선택"
    assert q.multiSelect is False
    assert [o.label for o in q.options] == ["코드 작성", "버그 수정"]

def test_question_from_hook_no_session_returns_none():
    assert question_from_hook({"iterm_session_id": "", "questions": [{"options": []}]}) is None

def test_question_from_hook_no_questions_returns_none():
    assert question_from_hook({"iterm_session_id": "w0:UUID", "questions": []}) is None

def test_to_dict_roundtrip_shape():
    q = Question(session="U", header="h", question="q",
                 options=[Option("a", "d")], multiSelect=True, claude_session_id="c")
    d = q.to_dict()
    assert d == {
        "session": "U", "header": "h", "question": "q",
        "multiSelect": True, "claude_session_id": "c",
        "options": [{"label": "a", "description": "d"}],
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_models.py -v`
Expected: FAIL ("No module named 'bridge.models'")

- [ ] **Step 3: 구현 작성**

`bridge/models.py`:
```python
from dataclasses import dataclass, field


@dataclass
class Option:
    label: str
    description: str = ""


@dataclass
class Question:
    session: str
    header: str
    question: str
    options: list = field(default_factory=list)
    multiSelect: bool = False
    claude_session_id: str = ""

    def to_dict(self) -> dict:
        return {
            "session": self.session,
            "header": self.header,
            "question": self.question,
            "multiSelect": self.multiSelect,
            "claude_session_id": self.claude_session_id,
            "options": [{"label": o.label, "description": o.description} for o in self.options],
        }


def normalize_session_id(raw: str) -> str:
    if raw and ":" in raw:
        return raw.split(":", 1)[1]
    return raw or ""


def question_from_hook(body: dict):
    session = normalize_session_id(body.get("iterm_session_id", ""))
    if not session:
        return None
    questions = body.get("questions") or []
    if not questions:
        return None
    q = questions[0]
    options = [Option(label=o.get("label", ""), description=o.get("description", ""))
               for o in (q.get("options") or [])]
    return Question(
        session=session,
        header=q.get("header", ""),
        question=q.get("question", ""),
        options=options,
        multiSelect=bool(q.get("multiSelect", False)),
        claude_session_id=body.get("claude_session_id", ""),
    )
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_models.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/models.py tests/test_models.py
git commit -m "feat: question model and hook payload parsing"
```

---

## Task 3: 키 시퀀스 순수 함수

**Files:**
- Create: `bridge/injector.py`
- Create: `tests/test_key_sequence.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_key_sequence.py`:
```python
import pytest
from bridge.injector import key_sequence


def test_first_option_is_just_enter():
    assert key_sequence(1) == "\r"

def test_third_option_two_downs_then_enter():
    assert key_sequence(3) == "\x1b[B\x1b[B\r"

def test_index_must_be_positive():
    with pytest.raises(ValueError):
        key_sequence(0)
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_key_sequence.py -v`
Expected: FAIL ("cannot import name 'key_sequence'")

- [ ] **Step 3: 구현 작성**

`bridge/injector.py` (이 파일은 Task 7에서 클래스가 추가된다. 지금은 순수 함수만):
```python
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_key_sequence.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/injector.py tests/test_key_sequence.py
git commit -m "feat: key_sequence builder for menu selection"
```

---

## Task 4: 보류 질문 저장소

**Files:**
- Create: `bridge/state.py`
- Create: `tests/test_state.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_state.py`:
```python
from bridge.state import PendingStore
from bridge.models import Question, Option


def mkq(session):
    return Question(session=session, header="h", question="q", options=[Option("a")])

def test_add_and_get():
    s = PendingStore()
    s.add(mkq("U1"))
    assert s.get("U1").session == "U1"

def test_add_same_session_overwrites():
    s = PendingStore()
    s.add(mkq("U1")); s.add(mkq("U1"))
    assert len(s.list()) == 1

def test_resolve_returns_true_then_false():
    s = PendingStore()
    s.add(mkq("U1"))
    assert s.resolve("U1") is True
    assert s.resolve("U1") is False
    assert s.get("U1") is None

def test_list_returns_all():
    s = PendingStore()
    s.add(mkq("U1")); s.add(mkq("U2"))
    assert {q.session for q in s.list()} == {"U1", "U2"}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_state.py -v`
Expected: FAIL ("No module named 'bridge.state'")

- [ ] **Step 3: 구현 작성**

`bridge/state.py`:
```python
from bridge.models import Question


class PendingStore:
    """세션 UUID 별 현재 보류 중인 질문 1개를 보관."""

    def __init__(self):
        self._items: dict[str, Question] = {}

    def add(self, q: Question) -> None:
        self._items[q.session] = q

    def resolve(self, session: str) -> bool:
        return self._items.pop(session, None) is not None

    def get(self, session: str):
        return self._items.get(session)

    def list(self) -> list:
        return list(self._items.values())
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_state.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/state.py tests/test_state.py
git commit -m "feat: pending question store"
```

---

## Task 5: 훅 HTTP 핸들러

**Files:**
- Create: `bridge/hooks_api.py`
- Create: `tests/test_hooks_api.py`

핸들러는 팩토리 함수로 만들어 `store`와 `hub`(브로드캐스트 인터페이스 `async broadcast(dict)`)를 주입받는다. 테스트는 `hub`를 페이크로 대체한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_hooks_api.py`:
```python
import pytest
from aiohttp import web
from bridge.hooks_api import make_question_handler, make_resolved_handler
from bridge.state import PendingStore


class FakeHub:
    def __init__(self):
        self.sent = []
    async def broadcast(self, msg):
        self.sent.append(msg)


@pytest.fixture
def store():
    return PendingStore()

@pytest.fixture
def hub():
    return FakeHub()

@pytest.fixture
async def client(aiohttp_client, store, hub):
    app = web.Application()
    app.router.add_post("/hook/question", make_question_handler(store, hub))
    app.router.add_post("/hook/resolved", make_resolved_handler(store, hub))
    return await aiohttp_client(app)


async def test_question_stores_and_broadcasts(client, store, hub):
    body = {"iterm_session_id": "w0t1p0:U1", "claude_session_id": "c",
            "questions": [{"header": "h", "question": "q", "multiSelect": False,
                           "options": [{"label": "A"}, {"label": "B"}]}]}
    resp = await client.post("/hook/question", json=body)
    assert resp.status == 200
    assert store.get("U1").options[0].label == "A"
    assert hub.sent[0]["type"] == "question_added"
    assert hub.sent[0]["question"]["session"] == "U1"

async def test_question_without_session_is_noop_200(client, store, hub):
    resp = await client.post("/hook/question", json={"iterm_session_id": "", "questions": []})
    assert resp.status == 200
    assert store.list() == []
    assert hub.sent == []

async def test_resolved_removes_and_broadcasts(client, store, hub):
    from bridge.models import Question
    store.add(Question(session="U1", header="h", question="q", options=[]))
    resp = await client.post("/hook/resolved", json={"iterm_session_id": "w0t1p0:U1"})
    assert resp.status == 200
    assert store.get("U1") is None
    assert hub.sent[-1] == {"type": "question_resolved", "session": "U1"}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_hooks_api.py -v`
Expected: FAIL ("No module named 'bridge.hooks_api'")

- [ ] **Step 3: 구현 작성**

`bridge/hooks_api.py`:
```python
from aiohttp import web
from bridge.models import question_from_hook, normalize_session_id


def make_question_handler(store, hub):
    async def handler(request):
        body = await request.json()
        q = question_from_hook(body)
        if q is None:
            return web.json_response({"ok": False, "reason": "no session/question"})
        store.add(q)
        await hub.broadcast({"type": "question_added", "question": q.to_dict()})
        return web.json_response({"ok": True})
    return handler


def make_resolved_handler(store, hub):
    async def handler(request):
        body = await request.json()
        session = normalize_session_id(body.get("iterm_session_id", ""))
        if session and store.resolve(session):
            await hub.broadcast({"type": "question_resolved", "session": session})
        return web.json_response({"ok": True})
    return handler
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_hooks_api.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/hooks_api.py tests/test_hooks_api.py
git commit -m "feat: hook HTTP endpoints for question/resolved"
```

---

## Task 6: WebSocket 허브 + 핸들러

**Files:**
- Create: `bridge/ws.py`
- Create: `tests/test_ws.py`

`Hub`는 클라이언트 레지스트리/브로드캐스트. `make_ws_handler(store, hub, injector)`는 연결 시 `sync` 전송, `answer`/`cancel` 메시지 처리. `injector`는 `submit_select(session, index) -> concurrent.futures.Future` 와 `submit_cancel(session) -> Future` 를 제공하는 인터페이스(실제 구현은 Task 7). 테스트는 페이크 injector 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_ws.py`:
```python
import json
import asyncio
import concurrent.futures
import pytest
from aiohttp import web
from bridge.ws import Hub, make_ws_handler
from bridge.state import PendingStore
from bridge.models import Question, Option


class FakeInjector:
    def __init__(self):
        self.selected = []
        self.cancelled = []
    def submit_select(self, session, index):
        self.selected.append((session, index))
        f = concurrent.futures.Future(); f.set_result(None); return f
    def submit_cancel(self, session):
        self.cancelled.append(session)
        f = concurrent.futures.Future(); f.set_result(None); return f


@pytest.fixture
def store():
    return PendingStore()

@pytest.fixture
def injector():
    return FakeInjector()

@pytest.fixture
async def client(aiohttp_client, store, injector):
    hub = Hub()
    app = web.Application()
    app["hub"] = hub
    app.router.add_get("/ws", make_ws_handler(store, hub, injector))
    return await aiohttp_client(app)


async def test_sync_on_connect(client, store):
    store.add(Question(session="U1", header="h", question="q", options=[Option("A")]))
    ws = await client.ws_connect("/ws")
    msg = json.loads((await ws.receive()).data)
    assert msg["type"] == "sync"
    assert msg["questions"][0]["session"] == "U1"
    await ws.close()

async def test_answer_single_select_injects_and_resolves(client, store, injector):
    store.add(Question(session="U1", header="h", question="q",
                       options=[Option("A"), Option("B")], multiSelect=False))
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": 2}))
    msg = json.loads((await ws.receive()).data)
    assert injector.selected == [("U1", 2)]
    assert msg == {"type": "question_resolved", "session": "U1"}
    assert store.get("U1") is None
    await ws.close()

async def test_answer_multiselect_does_not_inject(client, store, injector):
    store.add(Question(session="U1", header="h", question="q",
                       options=[Option("A")], multiSelect=True))
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": 1}))
    msg = json.loads((await ws.receive()).data)
    assert injector.selected == []
    assert msg["type"] == "error"
    await ws.close()

async def test_cancel_injects_esc(client, store, injector):
    store.add(Question(session="U1", header="h", question="q", options=[Option("A")]))
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str(json.dumps({"type": "cancel", "session": "U1"}))
    await asyncio.sleep(0.05)
    assert injector.cancelled == ["U1"]
    await ws.close()
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_ws.py -v`
Expected: FAIL ("No module named 'bridge.ws'")

- [ ] **Step 3: 구현 작성**

`bridge/ws.py`:
```python
import json
import asyncio
from aiohttp import web, WSMsgType


class Hub:
    def __init__(self):
        self._clients: set = set()

    def register(self, ws):
        self._clients.add(ws)

    def unregister(self, ws):
        self._clients.discard(ws)

    async def broadcast(self, msg: dict):
        data = json.dumps(msg)
        for ws in list(self._clients):
            if not ws.closed:
                await ws.send_str(data)


async def _handle_answer(data, store, hub, injector):
    session = data.get("session", "")
    index = int(data.get("index", 0))
    q = store.get(session)
    if q is None:
        return
    if q.multiSelect:
        await hub.broadcast({"type": "error", "session": session,
                             "message": "다중선택은 터미널에서 직접 선택하세요"})
        return
    fut = injector.submit_select(session, index)
    try:
        await asyncio.wrap_future(fut)
    except Exception as e:  # noqa: BLE001
        await hub.broadcast({"type": "error", "session": session, "message": str(e)})
        return
    store.resolve(session)
    await hub.broadcast({"type": "question_resolved", "session": session})


async def _handle_cancel(data, injector):
    session = data.get("session", "")
    if session:
        injector.submit_cancel(session)


def make_ws_handler(store, hub, injector):
    async def handler(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        hub.register(ws)
        await ws.send_str(json.dumps(
            {"type": "sync", "questions": [q.to_dict() for q in store.list()]}))
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                data = json.loads(msg.data)
                if data.get("type") == "answer":
                    await _handle_answer(data, store, hub, injector)
                elif data.get("type") == "cancel":
                    await _handle_cancel(data, injector)
        finally:
            hub.unregister(ws)
        return ws
    return handler
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_ws.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/ws.py tests/test_ws.py
git commit -m "feat: websocket hub and answer/cancel handling"
```

---

## Task 7: iTerm2 인젝터 (전용 스레드)

**Files:**
- Modify: `bridge/injector.py` (Task 3 파일에 클래스 추가)
- Create: `tests/test_injector_select.py`

`ItermInjector`는 전용 스레드에서 iTerm2 연결을 유지한다. 코루틴 `_select`/`_cancel`은 `self._app`(테스트에서 페이크 주입 가능)을 사용하므로 iTerm2 없이 단위 테스트한다. `submit_*`은 스레드세이프 제출만 담당하므로 통합 테스트 대상이 아니다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_injector_select.py`:
```python
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_injector_select.py -v`
Expected: FAIL ("cannot import name 'ItermInjector'")

- [ ] **Step 3: 구현 추가**

`bridge/injector.py` 끝에 추가:
```python
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_injector_select.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add bridge/injector.py tests/test_injector_select.py
git commit -m "feat: iTerm2 injector with dedicated connection thread"
```

---

## Task 8: 서버 와이어링

**Files:**
- Create: `bridge/server.py`
- Create: `tests/test_server_app.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_server_app.py`:
```python
import pytest
from bridge.server import make_app


class FakeInjector:
    def submit_select(self, *a): ...
    def submit_cancel(self, *a): ...


@pytest.fixture
async def client(aiohttp_client):
    from bridge.state import PendingStore
    from bridge.ws import Hub
    app = make_app(PendingStore(), Hub(), FakeInjector())
    return await aiohttp_client(app)


async def test_index_served(client):
    resp = await client.get("/")
    assert resp.status == 200
    text = await resp.text()
    assert "Claude" in text

async def test_routes_exist(client):
    # 잘못된 본문이어도 핸들러가 존재하면 500이 아닌 4xx/2xx
    resp = await client.post("/hook/question", json={"iterm_session_id": "", "questions": []})
    assert resp.status == 200
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `python3 -m pytest tests/test_server_app.py -v`
Expected: FAIL ("No module named 'bridge.server'")

- [ ] **Step 3: 구현 작성**

`bridge/server.py`:
```python
import os
import logging
from pathlib import Path
from aiohttp import web

from bridge.state import PendingStore
from bridge.ws import Hub, make_ws_handler
from bridge.hooks_api import make_question_handler, make_resolved_handler
from bridge.injector import ItermInjector

WEBCLIENT_DIR = Path(__file__).resolve().parent.parent / "webclient"


async def _index(request):
    return web.FileResponse(WEBCLIENT_DIR / "index.html")


def make_app(store, hub, injector) -> web.Application:
    app = web.Application()
    app.router.add_post("/hook/question", make_question_handler(store, hub))
    app.router.add_post("/hook/resolved", make_resolved_handler(store, hub))
    app.router.add_get("/ws", make_ws_handler(store, hub, injector))
    app.router.add_get("/", _index)
    app.router.add_static("/static", WEBCLIENT_DIR)
    return app


def run(port: int = 8787):
    logging.basicConfig(level=logging.INFO)
    store = PendingStore()
    hub = Hub()
    injector = ItermInjector()
    injector.start()
    app = make_app(store, hub, injector)
    logging.getLogger("bridge").info("브릿지 시작: http://127.0.0.1:%d", port)
    web.run_app(app, host="127.0.0.1", port=port)
```

- [ ] **Step 4: webclient 임시 파일로 테스트 통과 준비**

이 태스크 테스트는 `webclient/index.html` 존재를 요구한다. Task 11에서 정식 작성하므로, 여기서는 최소 스텁을 만든다(Task 11에서 덮어씀):

`webclient/index.html`:
```html
<!doctype html><meta charset="utf-8"><title>Claude 질문 브릿지</title>
<body><h1>Claude 질문 브릿지</h1></body>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `python3 -m pytest tests/test_server_app.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add bridge/server.py tests/test_server_app.py webclient/index.html
git commit -m "feat: aiohttp app wiring and run entrypoint"
```

---

## Task 9: 실행 진입점

**Files:**
- Create: `bridge/__main__.py`

- [ ] **Step 1: 진입점 작성**

`bridge/__main__.py`:
```python
import os
from bridge.server import run

if __name__ == "__main__":
    run(port=int(os.environ.get("BRIDGE_PORT", "8787")))
```

- [ ] **Step 2: 임포트 동작 확인 (서버 기동은 하지 않음)**

Run: `python3 -c "import bridge.__main__"`
Expected: 에러 없이 임포트(즉시 종료). `if __name__` 가드로 run 미실행.

- [ ] **Step 3: 전체 테스트 스위트 통과 확인**

Run: `python3 -m pytest -q`
Expected: 모든 테스트 PASS.

- [ ] **Step 4: Commit**

```bash
git add bridge/__main__.py
git commit -m "feat: python -m bridge entrypoint"
```

---

## Task 10: 훅 스크립트 + settings.json 교체

**Files:**
- Create: `.claude/hooks/on-question.sh`
- Create: `.claude/hooks/on-resolved.sh`
- Modify: `.claude/settings.json` (기존 dump-hook.sh 등록을 교체)

- [ ] **Step 1: on-question.sh 작성**

`.claude/hooks/on-question.sh`:
```bash
#!/usr/bin/env bash
# PreToolUse(AskUserQuestion): env ITERM_SESSION_ID + stdin 질문을 브릿지로 POST.
# 브릿지가 꺼져 있어도 claude 를 막지 않도록 항상 exit 0.
set -euo pipefail
RAW="$(cat)"
BODY="$(jq -nc \
  --arg iterm "${ITERM_SESSION_ID:-}" \
  --argjson payload "$RAW" \
  '{iterm_session_id: $iterm,
    claude_session_id: ($payload.session_id // ""),
    questions: ($payload.tool_input.questions // [])}')"
curl -s --max-time 2 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT:-8787}/hook/question" \
  -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
exit 0
```

- [ ] **Step 2: on-resolved.sh 작성**

`.claude/hooks/on-resolved.sh`:
```bash
#!/usr/bin/env bash
# PostToolUse(AskUserQuestion): 답변 완료 → 브릿지 보류 상태 정리.
set -euo pipefail
cat >/dev/null  # stdin 비움
BODY="$(jq -nc --arg iterm "${ITERM_SESSION_ID:-}" '{iterm_session_id: $iterm}')"
curl -s --max-time 2 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT:-8787}/hook/resolved" \
  -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
exit 0
```

- [ ] **Step 3: 실행 권한 부여**

Run: `chmod +x .claude/hooks/on-question.sh .claude/hooks/on-resolved.sh`
Expected: 에러 없음.

- [ ] **Step 4: settings.json 교체**

`.claude/settings.json` (전체 내용 교체):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-question.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/on-resolved.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: 훅 스크립트 단독 동작 점검 (브릿지 꺼진 상태에서도 exit 0)**

Run:
```bash
echo '{"session_id":"cs","tool_input":{"questions":[{"header":"h","question":"q","options":[{"label":"A"}]}]}}' | ITERM_SESSION_ID="w0t1p0:U1" .claude/hooks/on-question.sh; echo "exit=$?"
```
Expected: `exit=0` (브릿지 미기동이어도 차단 없음).

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/on-question.sh .claude/hooks/on-resolved.sh .claude/settings.json
git commit -m "feat: bridge hooks for question/resolved, replace dump-hook"
```

---

## Task 11: 브라우저 테스트 클라이언트

**Files:**
- Modify: `webclient/index.html` (Task 8 스텁 교체)
- Create: `webclient/app.js`

- [ ] **Step 1: index.html 작성**

`webclient/index.html` (전체 교체):
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Claude 질문 브릿지</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    #status { color: #888; font-size: .9rem; margin-bottom: 1rem; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
    .q { font-weight: 600; margin-bottom: .6rem; }
    .note { color: #b36b00; font-size: .85rem; margin-bottom: .5rem; }
    .opt { display: block; width: 100%; text-align: left; padding: .6rem .8rem; margin: .3rem 0;
           border: 1px solid #ccc; border-radius: 8px; background: #fafafa; cursor: pointer; font-size: 1rem; }
    .opt:hover { background: #eef; }
    .opt.ro { cursor: default; background: #f3f3f3; color: #555; }
    .empty { color: #aaa; }
  </style>
</head>
<body>
  <h1>🔔 Claude 질문 브릿지</h1>
  <div id="status">연결 중…</div>
  <div id="questions"></div>
  <script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: app.js 작성**

`webclient/app.js`:
```javascript
const qEl = document.getElementById('questions');
const statusEl = document.getElementById('status');
const pending = new Map();
let ws;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { statusEl.textContent = '연결됨'; };
  ws.onclose = () => { statusEl.textContent = '끊김 — 재연결 중…'; setTimeout(connect, 1000); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function handle(msg) {
  if (msg.type === 'sync') {
    pending.clear();
    msg.questions.forEach(q => pending.set(q.session, q));
  } else if (msg.type === 'question_added') {
    pending.set(msg.question.session, msg.question);
    notify(msg.question);
  } else if (msg.type === 'question_resolved') {
    pending.delete(msg.session);
  } else if (msg.type === 'error') {
    statusEl.textContent = '오류: ' + msg.message;
  }
  render();
}

function notify(q) {
  if (window.Notification && Notification.permission === 'granted') {
    new Notification('Claude 질문', { body: `[${q.header}] ${q.question}` });
  }
}

function render() {
  qEl.innerHTML = '';
  if (pending.size === 0) {
    const d = document.createElement('div'); d.className = 'empty';
    d.textContent = '대기 중인 질문이 없습니다.';
    qEl.appendChild(d); return;
  }
  for (const q of pending.values()) {
    const card = document.createElement('div'); card.className = 'card';
    const h = document.createElement('div'); h.className = 'q';
    h.textContent = `[${q.header}] ${q.question}`;
    card.appendChild(h);
    if (q.multiSelect) {
      const note = document.createElement('div'); note.className = 'note';
      note.textContent = '다중선택 — 터미널에서 직접 선택하세요';
      card.appendChild(note);
      q.options.forEach((o, i) => {
        const b = document.createElement('div'); b.className = 'opt ro';
        b.textContent = `${i + 1}. ${o.label}`; card.appendChild(b);
      });
    } else {
      q.options.forEach((o, i) => {
        const b = document.createElement('button'); b.className = 'opt';
        b.textContent = `${i + 1}. ${o.label}`;
        b.onclick = () => ws.send(JSON.stringify({ type: 'answer', session: q.session, index: i + 1 }));
        card.appendChild(b);
      });
    }
    qEl.appendChild(card);
  }
}

if (window.Notification && Notification.permission === 'default') {
  Notification.requestPermission();
}
connect();
```

- [ ] **Step 3: 정적 서빙 확인 (서버 수동 기동)**

Run:
```bash
(python3 -m bridge &) ; sleep 2 ; curl -s http://127.0.0.1:8787/static/app.js | head -1 ; curl -s http://127.0.0.1:8787/ | grep -o '질문 브릿지' ; pkill -f "python3 -m bridge"
```
Expected: app.js 첫 줄과 `질문 브릿지` 출력(정적/인덱스 서빙 정상).

- [ ] **Step 4: Commit**

```bash
git add webclient/index.html webclient/app.js
git commit -m "feat: browser test client for question mirroring"
```

---

## Task 12: 통합 수동 검증 + README 갱신

**Files:**
- Modify: `README.md` (실행/사용 섹션 추가)

- [ ] **Step 1: README 실행 섹션 추가**

`README.md` 의 "## scripts" 섹션 위에 아래 블록 삽입:
```markdown
## 브릿지 서버 실행

\`\`\`bash
python3 -m pip install -e ".[dev]"   # 최초 1회
python3 -m bridge                     # http://localhost:8787
open http://localhost:8787/           # 테스트 클라이언트
\`\`\`

사전조건: iTerm2 > Settings > General > Magic > Enable Python API.

### 수동 e2e 체크리스트
1. 브릿지 기동 + 브라우저로 테스트 클라이언트 열기.
2. iTerm2 에서 이 폴더로 \`claude\` 실행(훅 로드 승인).
3. claude 가 단일선택 AskUserQuestion 을 내게 유도.
4. 테스트 클라이언트에 질문 카드 + 선택지 버튼이 뜨는지 확인.
5. 버튼 N 클릭 → iTerm2 메뉴에서 N 번째가 선택되고 claude 가 진행되는지 확인.
6. multiSelect 질문은 "터미널에서 직접 선택" 안내만 뜨는지 확인.
\`\`\`
```

- [ ] **Step 2: 전체 자동 테스트 재확인**

Run: `python3 -m pytest -q`
Expected: 전체 PASS.

- [ ] **Step 3: 실제 e2e 수동 수행**

위 체크리스트 1~6 을 직접 수행하고 결과를 기록. (단일선택 주입 + multiSelect 알림 동작 확인.)
Expected: 5번에서 선택지 주입 성공, 6번에서 알림 전용 표시.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: bridge run instructions and manual e2e checklist"
```

---

## Self-Review 결과

- **Spec coverage:** §3 아키텍처(Task 7,8) / §4 모듈 전부(Task 2~11) / §5 프로토콜(Task 2,5,6) / §6 유형별 동작(Task 6 multiSelect 분기, Task 11 클라) / §7 에러처리(Task 5 noop200, Task 7 재연결/SessionNotFound, Task 10 exit0) / §9 테스트(각 Task TDD) / §10 실행(Task 9,12) 모두 태스크로 커버됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TBD/TODO 없음.
- **Type consistency:** `question_from_hook`/`to_dict`/`normalize_session_id`(Task 2), `key_sequence`(Task 3), `PendingStore.{add,resolve,get,list}`(Task 4), `Hub.broadcast`/`submit_select`/`submit_cancel`(Task 6,7), `make_app`(Task 8) 시그니처가 태스크 간 일치.
