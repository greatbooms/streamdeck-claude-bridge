from dataclasses import dataclass, field


@dataclass
class Option:
    label: str
    description: str = ""


@dataclass
class Question:
    session: str
    header: str
    question: str
    options: list = field(default_factory=list)
    multiSelect: bool = False
    claude_session_id: str = ""

    def to_dict(self) -> dict:
        return {
            "session": self.session,
            "header": self.header,
            "question": self.question,
            "multiSelect": self.multiSelect,
            "claude_session_id": self.claude_session_id,
            "options": [{"label": o.label, "description": o.description} for o in self.options],
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
    )
