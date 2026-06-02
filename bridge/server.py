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
