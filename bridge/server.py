import json
import logging
from pathlib import Path
from aiohttp import web

from bridge.state import PendingStore
from bridge.ws import Hub, make_ws_handler
from bridge.hooks_api import make_question_handler, make_resolved_handler, make_codex_permission_handler
from bridge.injector import ItermInjector
from bridge.gradle_runner import (
    GradleRequestError,
    ItermGradleRunner,
    parse_gradle_run_request,
)

WEBCLIENT_DIR = Path(__file__).resolve().parent.parent / "webclient"


async def _index(request):
    return web.FileResponse(WEBCLIENT_DIR / "index.html")


def make_gradle_iterm_handler(gradle_runner):
    async def handler(request):
        try:
            body = await request.json()
        except json.JSONDecodeError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

        try:
            req = parse_gradle_run_request(body)
        except GradleRequestError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

        try:
            result = await gradle_runner.run(req)
        except RuntimeError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=503)

        return web.json_response(result)
    return handler


def make_app(store, hub, injector, gradle_runner=None) -> web.Application:
    app = web.Application()
    app.router.add_post("/hook/question", make_question_handler(store, hub))
    app.router.add_post("/hook/codex/permission", make_codex_permission_handler(store, hub))
    app.router.add_post("/hook/resolved", make_resolved_handler(store, hub))
    app.router.add_post("/run/gradle/iterm", make_gradle_iterm_handler(gradle_runner or ItermGradleRunner(injector)))
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
