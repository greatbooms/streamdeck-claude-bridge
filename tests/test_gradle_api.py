import concurrent.futures
import asyncio

import pytest
from bridge.gradle_runner import GradleRunRequest, ItermGradleRunner
from bridge.server import make_app


class FakeInjector:
    def submit_select(self, *a): ...
    def submit_cancel(self, *a): ...


class FakeGradleRunner:
    def __init__(self):
        self.commands = []

    async def run(self, req):
        self.commands.append(req)
        return {"ok": True, "command": f"{req.gradle_command} {req.task}"}


@pytest.fixture
async def client(aiohttp_client, tmp_path):
    from bridge.state import PendingStore
    from bridge.ws import Hub
    runner = FakeGradleRunner()
    app = make_app(PendingStore(), Hub(), FakeInjector(), gradle_runner=runner)
    app["fake_gradle_runner"] = runner
    app["project_dir"] = tmp_path
    return await aiohttp_client(app)


async def test_gradle_iterm_endpoint_runs_valid_request(client):
    project = client.app["project_dir"] / "api"
    project.mkdir()
    resp = await client.post("/run/gradle/iterm", json={"cwd": str(project), "task": "bootRun"})
    assert resp.status == 200
    assert await resp.json() == {"ok": True, "command": "./gradlew bootRun"}
    assert client.app["fake_gradle_runner"].commands[0].task == "bootRun"


async def test_gradle_iterm_endpoint_rejects_invalid_request(client):
    resp = await client.post("/run/gradle/iterm", json={"cwd": "/missing", "task": "bootRun; bad"})
    assert resp.status == 400
    body = await resp.json()
    assert body["ok"] is False
    assert "error" in body


async def test_gradle_iterm_endpoint_rejects_malformed_json(client):
    resp = await client.post("/run/gradle/iterm", data="{", headers={"Content-Type": "application/json"})
    assert resp.status == 400
    body = await resp.json()
    assert body["ok"] is False
    assert "error" in body


async def test_gradle_iterm_endpoint_reports_runner_unavailable(aiohttp_client, tmp_path):
    class FailingRunner:
        async def run(self, req):
            raise RuntimeError("iTerm2 injector loop not ready")

    from bridge.state import PendingStore
    from bridge.ws import Hub

    project = tmp_path / "api"
    project.mkdir()
    app = make_app(PendingStore(), Hub(), FakeInjector(), gradle_runner=FailingRunner())
    client = await aiohttp_client(app)
    resp = await client.post("/run/gradle/iterm", json={"cwd": str(project), "task": "bootRun"})
    assert resp.status == 503
    body = await resp.json()
    assert body == {"ok": False, "error": "iTerm2 injector loop not ready"}


async def test_iterm_gradle_runner_waits_for_threadsafe_future(tmp_path):
    class FakeInjector:
        def __init__(self):
            self.future = concurrent.futures.Future()
            self.command = None

        def submit_run_command(self, command):
            self.command = command
            return self.future

    project = tmp_path / "api"
    project.mkdir()
    injector = FakeInjector()
    runner = ItermGradleRunner(injector)
    task = asyncio.create_task(runner.run(GradleRunRequest(project, "./gradlew", "test")))
    await asyncio.sleep(0)
    assert not task.done()

    injector.future.set_result(None)
    result = await task

    assert result == {"ok": True, "command": f"cd {project} && ./gradlew test"}
    assert injector.command == f"cd {project} && ./gradlew test"
