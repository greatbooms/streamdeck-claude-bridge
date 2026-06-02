import json
import asyncio
import logging
from aiohttp import web, WSMsgType

log = logging.getLogger("bridge.ws")


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


async def _send(ws, msg: dict):
    if not ws.closed:
        await ws.send_str(json.dumps(msg))


async def _handle_answer(ws, data, store, hub, injector):
    session = data.get("session", "")
    index = int(data.get("index", 0))
    q = store.get(session)
    if q is None:
        return
    # 에러는 요청한 클라이언트에게만, 해소(resolved)는 모든 클라이언트에게 브로드캐스트.
    if q.multiSelect:
        await _send(ws, {"type": "error", "session": session,
                         "message": "다중선택은 터미널에서 직접 선택하세요"})
        return
    try:
        fut = injector.submit_select(session, index)
        await asyncio.wrap_future(fut)
    except Exception as e:  # noqa: BLE001
        await _send(ws, {"type": "error", "session": session, "message": str(e)})
        return
    store.resolve(session)
    await hub.broadcast({"type": "question_resolved", "session": session})


async def _handle_cancel(data, injector):
    session = data.get("session", "")
    if not session:
        return
    try:
        injector.submit_cancel(session)
    except Exception as e:  # noqa: BLE001
        log.warning("cancel 제출 실패(iTerm2 미연결 가능): %s", e)


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
                try:
                    data = json.loads(msg.data)
                    mtype = data.get("type")
                    if mtype == "answer":
                        await _handle_answer(ws, data, store, hub, injector)
                    elif mtype == "cancel":
                        await _handle_cancel(data, injector)
                except (json.JSONDecodeError, ValueError, TypeError, KeyError):
                    continue
        finally:
            hub.unregister(ws)
        return ws
    return handler
