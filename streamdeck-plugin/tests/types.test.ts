import { describe, it, expect } from "vitest";
import type { Question, ServerMsg, ClientMsg } from "../src/types.js";

describe("types", () => {
  it("constructs a Question and messages structurally", () => {
    const q: Question = {
      session: "U1", header: "h", question: "q", multiSelect: false,
      claude_session_id: "c", source: "codex", kind: "permission",
      request_id: "r1", tool_name: "Bash",
      options: [{ label: "Approve", description: "", action: "approve" }],
    };
    const added: ServerMsg = { type: "question_added", question: q };
    const answer: ClientMsg = { type: "answer", session: "U1", index: 1 };
    expect(q.source).toBe("codex");
    expect(q.kind).toBe("permission");
    expect(q.options[0].action).toBe("approve");
    expect(added.type).toBe("question_added");
    expect(answer.type).toBe("answer");
  });
});
