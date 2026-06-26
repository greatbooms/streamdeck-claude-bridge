import { describe, expect, it } from "vitest";
import { launcherCommandErrorMessage } from "../src/launcher-error.js";

describe("launcherCommandErrorMessage", () => {
  it("formats Error instances for Stream Deck logs", () => {
    expect(launcherCommandErrorMessage(new Error("iTerm is unavailable"))).toBe(
      "Launcher command failed: iTerm is unavailable",
    );
  });

  it("formats non-Error failures", () => {
    expect(launcherCommandErrorMessage("denied")).toBe("Launcher command failed: denied");
  });
});
