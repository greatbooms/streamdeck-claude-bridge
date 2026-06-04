import { describe, it, expect } from "vitest";
import type { Question, ServerMsg, ClientMsg } from "../src/types.js";

describe("types", () => {
  it("constructs a Question and messages structurally", () => {
    const q: Question = {
      session: "U1", header: "h", question: "q", multiSelect: false,
      claude_session_id: "c", options: [{ label: "A", description: "" }],
    };
    const added: ServerMsg = { type: "question_added", question: q };
    const answer: ClientMsg = { type: "answer", session: "U1", index: 1 };
    expect(q.options[0].label).toBe("A");
    expect(added.type).toBe("question_added");
    expect(answer.type).toBe("answer");
  });
});
