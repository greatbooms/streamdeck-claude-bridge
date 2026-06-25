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

  it("renders open IntelliJ projects even when they are not in launcher config", () => {
    const state = new LauncherState({ projects: [] });
    state.applyIntelliJProjects([
      { name: "api", path: "/repo/api", basePath: "/repo/api" },
      { name: "front", path: "/repo/front", basePath: "/repo/front" },
    ]);
    state.applyProjectCapabilities("/repo/api", { hasGradle: true, npmScripts: [] });
    state.applyProjectCapabilities("/repo/front", { hasGradle: false, npmScripts: ["dev", "build"] });

    expect(state.slots()[0]).toMatchObject({ kind: "project", label: "api", path: "/repo/api", status: "OPEN" });
    expect(state.slots()[1]).toMatchObject({ kind: "project", label: "front", path: "/repo/front", status: "OPEN" });
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
    expect(slots[1]).toMatchObject({ kind: "command", label: "bootRun", command: { kind: "gradle", task: "bootRun" } });
    expect(slots[2]).toMatchObject({ kind: "command", label: "test", command: { kind: "gradle", task: "test" } });
  });

  it("uses default tasks when favorites are empty", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/admin");
    const tasks = state.slots().filter((slot) => slot.kind === "command").map((slot) => slot.label);
    expect(tasks).toEqual(["bootRun", "test", "build", "clean"]);
  });

  it("renders detected IntelliJ Gradle tasks with favorites first", () => {
    const state = new LauncherState(config);
    state.applyProjectTasks("/repo/api", ["test", ":api:bootRun", "classes"]);
    state.openProject("/repo/api");

    const tasks = state.slots().filter((slot) => slot.kind === "command").map((slot) => slot.label);

    expect(tasks).toEqual(["bootRun", "test", ":api:bootRun", "classes"]);
  });

  it("renders npm scripts as commands with preferred scripts first", () => {
    const state = new LauncherState({ projects: [] });
    state.applyIntelliJProjects([{ name: "front", path: "/repo/front", basePath: "/repo/front" }]);
    state.applyProjectCapabilities("/repo/front", {
      hasGradle: false,
      npmScripts: ["build", "start:dev", "lint", "custom", "test"],
    });
    state.openProject("/repo/front");

    const commands = state.slots().filter((slot) => slot.kind === "command");

    expect(commands.map((slot) => slot.label)).toEqual(["start:dev", "test", "build", "lint", "custom"]);
    expect(commands.every((slot) => slot.command.kind === "npm")).toBe(true);
  });

  it("renders Gradle and npm commands together for mixed projects", () => {
    const state = new LauncherState(config);
    state.applyProjectTasks("/repo/api", ["bootRun", "classes"]);
    state.applyProjectCapabilities("/repo/api", { hasGradle: true, npmScripts: ["dev", "build"] });
    state.openProject("/repo/api");

    const commands = state.slots().filter((slot) => slot.kind === "command");

    expect(commands.map((slot) => slot.label)).toEqual(["bootRun", "test", "classes", "npm dev", "npm build"]);
  });

  it("renders config errors instead of a blank launcher", () => {
    const state = new LauncherState({ projects: [] });
    state.setConfigError("launcher.json: invalid task");

    expect(state.slots()[0]).toMatchObject({
      kind: "message",
      label: "Config Error",
      detail: "launcher.json: invalid task",
    });
  });

  it("back returns to home", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/api");
    state.back();
    expect(state.currentPage()).toEqual({ kind: "home" });
  });
});
