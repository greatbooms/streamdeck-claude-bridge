import { describe, expect, it } from "vitest";
import { parseLauncherEditorRequest } from "../src/launcher-editor.js";

describe("parseLauncherEditorRequest", () => {
  it("parses ready requests", () => {
    expect(parseLauncherEditorRequest({ type: "launcherEditorReady" })).toEqual({
      type: "launcherEditorReady",
    });
  });

  it("parses refresh requests with optional project path", () => {
    expect(parseLauncherEditorRequest({
      type: "launcherEditorRefresh",
      projectPath: "/repo/api",
    })).toEqual({
      type: "launcherEditorRefresh",
      projectPath: "/repo/api",
    });

    expect(parseLauncherEditorRequest({ type: "launcherEditorRefresh" })).toEqual({
      type: "launcherEditorRefresh",
    });

    expect(parseLauncherEditorRequest({
      type: "launcherEditorRefresh",
      projectPath: "   ",
    })).toEqual({
      type: "launcherEditorRefresh",
    });
  });

  it("parses save requests and trims arrays", () => {
    expect(parseLauncherEditorRequest({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: [" bootRun ", "", "test"],
      npmOrder: [" dev ", "build"],
    })).toEqual({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: ["bootRun", "test"],
      npmOrder: ["dev", "build"],
    });
  });

  it("returns null for malformed payloads", () => {
    expect(parseLauncherEditorRequest(null)).toBeNull();
    expect(parseLauncherEditorRequest({ type: "saveProjectPreferences", projectPath: "/repo/api" })).toBeNull();
    expect(parseLauncherEditorRequest({ type: "unknown" })).toBeNull();
  });

  it("returns null for save requests with non-string array entries", () => {
    expect(parseLauncherEditorRequest({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: [123],
      npmOrder: ["dev"],
    })).toBeNull();

    expect(parseLauncherEditorRequest({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: ["bootRun"],
      npmOrder: ["dev", null],
    })).toBeNull();
  });
});
