import { describe, expect, it } from "vitest";
import { LAUNCHER_REFRESH_INTERVAL_MS } from "../src/launcher-refresh-policy.js";

describe("launcher refresh policy", () => {
  it("does not poll IntelliJ aggressively while the launcher is visible", () => {
    expect(LAUNCHER_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
  });
});
