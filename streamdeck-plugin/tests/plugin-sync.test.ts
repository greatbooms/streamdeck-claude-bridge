import { describe, expect, it, vi } from "vitest";
import { syncDeckState } from "../src/plugin-sync.js";

describe("syncDeckState", () => {
  it("enters the source-specific profile and refreshes visible actions", async () => {
    const enter = vi.fn();
    const leave = vi.fn();
    const refreshAnswers = vi.fn();
    const refreshQuestion = vi.fn();

    await syncDeckState({
      active: { source: "codex" },
      switcher: { enter, leave },
      answerAction: { refreshAll: refreshAnswers },
      questionAction: { refreshAll: refreshQuestion },
      log: vi.fn(),
    });

    expect(enter).toHaveBeenCalledWith("Codex Bridge");
    expect(leave).not.toHaveBeenCalled();
    expect(refreshAnswers).toHaveBeenCalled();
    expect(refreshQuestion).toHaveBeenCalled();
  });

  it("logs async update failures without rejecting", async () => {
    const log = vi.fn();

    await expect(syncDeckState({
      active: null,
      switcher: {
        enter: vi.fn(),
        leave: vi.fn().mockRejectedValue(new Error("The request timed out")),
      },
      answerAction: {
        refreshAll: vi.fn().mockRejectedValue(new Error("action refresh failed")),
      },
      questionAction: {
        refreshAll: vi.fn(() => { throw new Error("question refresh failed"); }),
      },
      log,
    })).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("profile leave failed"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("answer refresh failed"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("question refresh failed"));
  });
});
