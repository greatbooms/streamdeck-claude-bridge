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
});
