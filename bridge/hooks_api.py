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
