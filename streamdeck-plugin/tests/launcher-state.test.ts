import { describe, expect, it } from "vitest";
import { LauncherState } from "../src/launcher-state.js";
import type { LauncherConfig, IntelliJProject } from "../src/launcher-types.js";

const config: LauncherConfig = {
  projects: [
    { name: "API", path: "/repo/api", gradleCommand: "./gradlew", favorites: ["bootRun", "test"] },
    { name: "Admin", path: "/repo/admin", gradleCommand: "./gradlew", favorites: [] },
  ],
};

const openProjects: IntelliJProject[] = [{ name: "api", path: "/repo/api", basePath: "/repo/api" }];

describe("LauncherState", () => {
  it("renders home project slots with open/iTerm status", () => {
    const state = new LauncherState(config);
    state.applyIntelliJProjects(openProjects);
    const slots = state.slots();
    expect(slots[0]).toMatchObject({ kind: "project", label: "API", status: "OPEN" });
    expect(slots[1]).toMatchObject({ kind: "project", label: "Admin", status: "iTerm" });
    expect(slots[2]).toMatchObject({ kind: "control", action: "refresh" });
    expect(slots).toHaveLength(15);
  });

  it("normalizes configured and open IntelliJ project paths before matching", () => {
    const state = new LauncherState({
      projects: [{ name: "API", path: "/repo/root/../api/", gradleCommand: "./gradlew", favorites: [] }],
    });
    state.applyIntelliJProjects([{ name: "api", path: "/repo/api", basePath: "/repo/api" }]);
    expect(state.slots()[0]).toMatchObject({ kind: "project", label: "API", path: "/repo/api", status: "OPEN" });
  });

  it("enters project detail and renders favorite task slots", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/root/../api/");
    const slots = state.slots();
    expect(slots[0]).toMatchObject({ kind: "control", action: "back" });
    expect(slots[1]).toMatchObject({ kind: "task", task: "bootRun" });
    expect(slots[2]).toMatchObject({ kind: "task", task: "test" });
  });

  it("uses default tasks when favorites are empty", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/admin");
    const tasks = state.slots().filter((slot) => slot.kind === "task").map((slot) => slot.task);
    expect(tasks).toEqual(["bootRun", "test", "build", "clean"]);
  });

  it("back returns to home", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/api");
    state.back();
    expect(state.currentPage()).toEqual({ kind: "home" });
  });
});
