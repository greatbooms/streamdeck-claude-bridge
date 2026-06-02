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

async def test_malformed_json_does_not_drop_connection(client, store, injector):
    store.add(Question(session="U1", header="h", question="q",
                       options=[Option("A"), Option("B")], multiSelect=False))
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str("this is not json {{{")
    # connection must survive: a following valid answer still works
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": 1}))
    msg = json.loads((await ws.receive()).data)
    assert msg == {"type": "question_resolved", "session": "U1"}
    assert injector.selected == [("U1", 1)]
    await ws.close()

async def test_non_integer_index_does_not_drop_connection(client, store, injector):
    store.add(Question(session="U1", header="h", question="q",
                       options=[Option("A")], multiSelect=False))
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": "oops"}))
    # bad index ignored, no injection, connection alive → ping with cancel works
    await ws.send_str(json.dumps({"type": "cancel", "session": "U1"}))
    await asyncio.sleep(0.05)
    assert injector.selected == []
    assert injector.cancelled == ["U1"]
    await ws.close()


class RaisingInjector:
    """iTerm2 미연결 상태 모사: submit_* 가 동기적으로 RuntimeError 를 던진다."""
    def submit_select(self, session, index):
        raise RuntimeError("iTerm2 injector loop not ready")
    def submit_cancel(self, session):
        raise RuntimeError("iTerm2 injector loop not ready")


async def test_disconnected_injector_reports_error_and_keeps_connection(aiohttp_client):
    store = PendingStore()
    store.add(Question(session="U1", header="h", question="q",
                       options=[Option("A")], multiSelect=False))
    hub = Hub()
    app = web.Application()
    app.router.add_get("/ws", make_ws_handler(store, hub, RaisingInjector()))
    client = await aiohttp_client(app)
    ws = await client.ws_connect("/ws")
    await ws.receive()  # sync
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": 1}))
    msg = json.loads((await ws.receive()).data)
    assert msg["type"] == "error"
    # question NOT resolved (inject never happened)
    assert store.get("U1") is not None
    # connection still alive: a cancel must not crash it either, and a follow-up answer still gets a response
    await ws.send_str(json.dumps({"type": "cancel", "session": "U1"}))
    await ws.send_str(json.dumps({"type": "answer", "session": "U1", "index": 1}))
    msg2 = json.loads((await ws.receive()).data)
    assert msg2["type"] == "error"
    await ws.close()
