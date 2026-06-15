import json
from dataclasses import dataclass, field


@dataclass
class Option:
    label: str
    description: str = ""
    action: str = ""


@dataclass
class Question:
    session: str
    header: str
    question: str
    options: list = field(default_factory=list)
    multiSelect: bool = False
    claude_session_id: str = ""
    source: str = "claude"
    kind: str = "question"
    request_id: str = ""
    tool_name: str = ""

    def to_dict(self) -> dict:
        return {
            "session": self.session,
            "header": self.header,
            "question": self.question,
            "multiSelect": self.multiSelect,
            "claude_session_id": self.claude_session_id,
            "source": self.source,
            "kind": self.kind,
            "request_id": self.request_id,
            "tool_name": self.tool_name,
            "options": [
                {"label": o.label, "description": o.description, "action": o.action}
                for o in self.options
            ],
        }


def normalize_session_id(raw: str) -> str:
    if raw and ":" in raw:
        return raw.split(":", 1)[1]
    return raw or ""


def question_from_hook(body: dict):
    session = normalize_session_id(body.get("iterm_session_id", ""))
    if not session:
        return None
    questions = body.get("questions") or []
    if not questions:
        return None
    q = questions[0]
    options = [Option(label=o.get("label", ""), description=o.get("description", ""))
               for o in (q.get("options") or [])]
    return Question(
        session=session,
        header=q.get("header", ""),
        question=q.get("question", ""),
        options=options,
        multiSelect=bool(q.get("multiSelect", False)),
        claude_session_id=body.get("claude_session_id", ""),
        source="claude",
        kind="question",
    )


def _first_str(*values) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _compact(value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return " ".join(str(v) for v in value)
    if isinstance(value, dict):
        for key in ("cmd", "command", "description", "input", "query"):
            text = _compact(value.get(key))
            if text:
                return text
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def codex_permission_from_hook(body: dict):
    session = normalize_session_id(body.get("iterm_session_id", ""))
    if not session:
        return None

    payload = body.get("payload")
    if not isinstance(payload, dict):
        payload = body

    tool_input = payload.get("tool_input") or payload.get("toolInput") or payload.get("arguments") or {}
    if not isinstance(tool_input, dict):
        tool_input = {"input": tool_input}

    tool_name = _first_str(
        payload.get("tool_name"),
        payload.get("toolName"),
        payload.get("tool"),
        payload.get("name"),
        "Codex",
    )
    summary = _compact(
        payload.get("command")
        or payload.get("cmd")
        or payload.get("input")
        or tool_input.get("command")
        or tool_input.get("cmd")
        or tool_input
    )
    reason = _first_str(
        payload.get("justification"),
        payload.get("reason"),
        payload.get("message"),
        tool_input.get("justification"),
        tool_input.get("reason"),
    )
    request_id = _first_str(
        payload.get("approval_id"),
        payload.get("approvalId"),
        payload.get("call_id"),
        payload.get("callId"),
        payload.get("hook_run_id"),
        payload.get("turn_id"),
    )
    codex_session_id = _first_str(payload.get("session_id"), payload.get("sessionId"))

    lines = [f"{tool_name}: {summary}" if summary else tool_name]
    if reason:
        lines.append(f"Reason: {reason}")

    options = [
        Option("Approve", "Approve this request once", "approve"),
        Option("Approve session", "Approve matching requests for this session", "approve_for_session"),
    ]
    if payload.get("prefix_rule") or payload.get("prefixRule") or tool_input.get("prefix_rule"):
        options.append(Option("Approve prefix", "Approve this command prefix", "approve_for_prefix"))
    options.append(Option("Decline", "Deny this request", "decline"))

    return Question(
        session=session,
        header="CODEX PERMISSION",
        question="\n".join(lines),
        options=options,
        multiSelect=False,
        claude_session_id=codex_session_id,
        source="codex",
        kind="permission",
        request_id=request_id,
        tool_name=tool_name,
    )
