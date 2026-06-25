import { describe, expect, it } from "vitest";
import { parseLauncherConfig } from "../src/launcher-config.js";

describe("parseLauncherConfig", () => {
  it("parses projects and defaults gradleCommand/favorites", () => {
    const config = parseLauncherConfig({
      projects: [{ name: "API", path: "/repo/root/../api/" }],
    });
    expect(config.projects).toEqual([
      { name: "API", path: "/repo/api", gradleCommand: "./gradlew", favorites: [] },
    ]);
  });

  it("rejects projects without name or path", () => {
    expect(() => parseLauncherConfig({ projects: [{ name: "", path: "/repo" }] })).toThrow("name");
    expect(() => parseLauncherConfig({ projects: [{ name: "API", path: "" }] })).toThrow("path");
  });

  it("rejects unsafe task favorites", () => {
    expect(() => parseLauncherConfig({
      projects: [{ name: "API", path: "/repo", favorites: ["bootRun --scan"] }],
    })).toThrow("Gradle task");
  });

  it("rejects relative paths", () => {
    expect(() => parseLauncherConfig({
      projects: [{ name: "API", path: "repo/api" }],
    })).toThrow("path");
  });

  it("rejects unsafe gradle commands", () => {
    for (const gradleCommand of ["./gradlew --scan", "/tmp/gradlew>out", "/tmp/gradlew<in"]) {
      expect(() => parseLauncherConfig({
        projects: [{ name: "API", path: "/repo/api", gradleCommand }],
      })).toThrow("gradleCommand");
    }
  });
});
