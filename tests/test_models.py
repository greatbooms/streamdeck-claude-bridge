from bridge.models import normalize_session_id, question_from_hook, Question, Option


def test_normalize_strips_position_prefix():
    assert normalize_session_id("w0t1p0:ABC-123") == "ABC-123"

def test_normalize_passthrough_when_no_colon():
    assert normalize_session_id("ABC-123") == "ABC-123"

def test_normalize_empty():
    assert normalize_session_id("") == ""

def test_question_from_hook_single():
    body = {
        "iterm_session_id": "w0t1p0:UUID-1",
        "claude_session_id": "cs-9",
        "questions": [{
            "header": "작업 선택",
            "question": "무엇을?",
            "multiSelect": False,
            "options": [
                {"label": "코드 작성", "description": "새 코드"},
                {"label": "버그 수정", "description": "고치기"},
            ],
        }],
    }
    q = question_from_hook(body)
    assert q.session == "UUID-1"
    assert q.claude_session_id == "cs-9"
    assert q.header == "작업 선택"
    assert q.multiSelect is False
    assert [o.label for o in q.options] == ["코드 작성", "버그 수정"]

def test_question_from_hook_no_session_returns_none():
    assert question_from_hook({"iterm_session_id": "", "questions": [{"options": []}]}) is None

def test_question_from_hook_no_questions_returns_none():
    assert question_from_hook({"iterm_session_id": "w0:UUID", "questions": []}) is None

def test_to_dict_roundtrip_shape():
    q = Question(session="U", header="h", question="q",
                 options=[Option("a", "d")], multiSelect=True, claude_session_id="c")
    d = q.to_dict()
    assert d == {
        "session": "U", "header": "h", "question": "q",
        "multiSelect": True, "claude_session_id": "c",
        "options": [{"label": "a", "description": "d"}],
    }
