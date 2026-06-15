from bridge.models import normalize_session_id, question_from_hook, codex_permission_from_hook, Question, Option


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
    assert q.source == "claude"
    assert q.kind == "question"
    assert q.claude_session_id == "cs-9"
    assert q.header == "작업 선택"
    assert q.multiSelect is False
    assert [o.label for o in q.options] == ["코드 작성", "버그 수정"]

def test_codex_permission_from_hook_shell_request():
    body = {
        "iterm_session_id": "w0t1p0:CODEX-UUID",
        "payload": {
            "session_id": "codex-session-1",
            "hook_event_name": "PermissionRequest",
            "tool_name": "Bash",
            "tool_input": {"cmd": "npm install"},
            "justification": "Need network to install dependencies",
            "prefix_rule": ["npm", "install"],
        },
    }
    q = codex_permission_from_hook(body)
    assert q is not None
    assert q.session == "CODEX-UUID"
    assert q.source == "codex"
    assert q.kind == "permission"
    assert q.claude_session_id == "codex-session-1"
    assert q.header == "CODEX PERMISSION"
    assert "Bash" in q.question
    assert "npm install" in q.question
    assert "Need network" in q.question
    assert [o.label for o in q.options] == [
        "Approve",
        "Approve session",
        "Approve prefix",
        "Decline",
    ]
    assert [o.action for o in q.options] == [
        "approve",
        "approve_for_session",
        "approve_for_prefix",
        "decline",
    ]

def test_question_from_hook_no_session_returns_none():
    assert question_from_hook({"iterm_session_id": "", "questions": [{"options": []}]}) is None

def test_question_from_hook_no_questions_returns_none():
    assert question_from_hook({"iterm_session_id": "w0:UUID", "questions": []}) is None

def test_to_dict_roundtrip_shape():
    q = Question(session="U", header="h", question="q",
                 options=[Option("a", "d", action="approve")], multiSelect=True,
                 claude_session_id="c", source="codex", kind="permission",
                 request_id="r1", tool_name="Bash")
    d = q.to_dict()
    assert d == {
        "session": "U", "header": "h", "question": "q",
        "multiSelect": True, "claude_session_id": "c",
        "source": "codex", "kind": "permission",
        "request_id": "r1", "tool_name": "Bash",
        "options": [{"label": "a", "description": "d", "action": "approve"}],
    }
