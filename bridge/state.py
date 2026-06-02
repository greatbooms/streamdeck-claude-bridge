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
