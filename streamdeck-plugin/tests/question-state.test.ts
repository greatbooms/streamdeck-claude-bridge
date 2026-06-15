import { describe, it, expect } from "vitest";
import { QuestionState } from "../src/question-state.js";
import type { Question } from "../src/types.js";

function q(
  session: string,
  opts: string[] = ["A"],
  multiSelect = false,
  source: Question["source"] = "claude",
): Question {
  return {
    session, header: "h", question: "q", multiSelect, claude_session_id: "c",
    source, kind: source === "codex" ? "permission" : "question",
    options: opts.map((label) => ({ label, description: "" })),
  };
}

describe("QuestionState", () => {
  it("active() is null when empty", () => {
    expect(new QuestionState().active()).toBeNull();
  });

  it("applyAdded makes it active; most-recent wins", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    expect(s.activeSession()).toBe("U2");
  });

  it("re-adding an existing session moves it to most-recent", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    s.applyAdded(q("U1"));
    expect(s.activeSession()).toBe("U1");
  });

  it("applyResolved falls back to next most-recent, then null", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    s.applyResolved("U2");
    expect(s.activeSession()).toBe("U1");
    s.applyResolved("U1");
    expect(s.active()).toBeNull();
  });

  it("applySync replaces all", () => {
    const s = new QuestionState();
    s.applyAdded(q("OLD"));
    s.applySync([q("U1"), q("U2")]);
    expect(s.activeSession()).toBe("U2");
  });

  it("labelFor returns option label by 1-based index, else null", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1", ["커피", "차", "물"]));
    expect(s.labelFor(1)).toBe("커피");
    expect(s.labelFor(2)).toBe("차");
    expect(s.labelFor(4)).toBeNull();
  });

  it("questionText returns active question body, else null", () => {
    const s = new QuestionState();
    expect(s.questionText()).toBeNull();
    s.applyAdded(q("U1"));
    expect(s.questionText()).toBe("q");
  });

  it("isMultiSelect reflects active question", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1", ["A"], true));
    expect(s.isMultiSelect()).toBe(true);
  });

  it("activeSource returns the active item's source", () => {
    const s = new QuestionState();
    expect(s.activeSource()).toBeNull();
    s.applyAdded(q("U1", ["A"], false, "claude"));
    expect(s.activeSource()).toBe("claude");
    s.applyAdded(q("U2", ["Approve"], false, "codex"));
    expect(s.activeSource()).toBe("codex");
  });
});
