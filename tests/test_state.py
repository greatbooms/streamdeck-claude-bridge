from bridge.state import PendingStore
from bridge.models import Question, Option


def mkq(session):
    return Question(session=session, header="h", question="q", options=[Option("a")])

def test_add_and_get():
    s = PendingStore()
    s.add(mkq("U1"))
    assert s.get("U1").session == "U1"

def test_add_same_session_overwrites():
    s = PendingStore()
    s.add(mkq("U1")); s.add(mkq("U1"))
    assert len(s.list()) == 1

def test_resolve_returns_true_then_false():
    s = PendingStore()
    s.add(mkq("U1"))
    assert s.resolve("U1") is True
    assert s.resolve("U1") is False
    assert s.get("U1") is None

def test_list_returns_all():
    s = PendingStore()
    s.add(mkq("U1")); s.add(mkq("U2"))
    assert {q.session for q in s.list()} == {"U1", "U2"}
