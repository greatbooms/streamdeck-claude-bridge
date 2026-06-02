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
    resp = await client.post("/hook/question", json={"iterm_session_id": "", "questions": []})
    assert resp.status == 200
