import pytest
from aiohttp import web
from bridge.hooks_api import make_question_handler, make_resolved_handler, make_codex_permission_handler
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
    app.router.add_post("/hook/codex/permission", make_codex_permission_handler(store, hub))
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
    assert hub.sent[0]["question"]["source"] == "claude"

async def test_codex_permission_stores_and_broadcasts(client, store, hub):
    body = {
        "iterm_session_id": "w0t1p0:C1",
        "payload": {
            "session_id": "codex-session",
            "tool_name": "Bash",
            "tool_input": {"cmd": "git commit"},
            "justification": "Commit requires approval outside sandbox",
        },
    }
    resp = await client.post("/hook/codex/permission", json=body)
    assert resp.status == 200
    q = store.get("C1")
    assert q.source == "codex"
    assert q.kind == "permission"
    assert q.options[-1].action == "decline"
    assert hub.sent[0]["type"] == "question_added"
    assert hub.sent[0]["question"]["source"] == "codex"
    assert hub.sent[0]["question"]["kind"] == "permission"

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
