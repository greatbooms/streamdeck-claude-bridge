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
