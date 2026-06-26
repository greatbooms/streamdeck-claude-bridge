import { describe, expect, it } from "vitest";
import { DEFAULT_NPM_ORDER, loadLauncherConfigFromText, parseLauncherConfig } from "../src/launcher-config.js";

describe("parseLauncherConfig", () => {
  it("parses projects and defaults gradleCommand/favorites/npmOrder", () => {
    const config = parseLauncherConfig({
      projects: [{ name: "API", path: "/repo/root/../api/" }],
    });
    expect(config.projects).toEqual([
      {
        name: "API",
        path: "/repo/api",
        gradleCommand: "./gradlew",
        favorites: [],
        npmOrder: DEFAULT_NPM_ORDER,
      },
    ]);
  });

  it("parses custom npm order and removes duplicates", () => {
    const config = parseLauncherConfig({
      projects: [{
        name: "API",
        path: "/repo/api",
        npmOrder: ["start:dev", "build", "start:dev", "lint"],
      }],
    });

    expect(config.projects[0].npmOrder).toEqual(["start:dev", "build", "lint"]);
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

  it("rejects unsafe npm script names", () => {
    for (const script of ["start dev", "dev && whoami", "build;rm", "@scope/build", "./dev", ":dev", "", 123]) {
      expect(() => parseLauncherConfig({
        projects: [{ name: "API", path: "/repo/api", npmOrder: [script] }],
      })).toThrow("npm script");
    }
  });

  it("rejects relative paths", () => {
    expect(() => parseLauncherConfig({
      projects: [{ name: "API", path: "repo/api" }],
    })).toThrow("path");
  });

  it("rejects unsafe gradle commands", () => {
    for (const gradleCommand of ["./gradlew --scan", "/tmp/gradlew>out", "/tmp/gradlew<in", "", "   ", 123]) {
      expect(() => parseLauncherConfig({
        projects: [{ name: "API", path: "/repo/api", gradleCommand }],
      })).toThrow("gradleCommand");
    }
  });

  it("loads config from JSON text", () => {
    const config = loadLauncherConfigFromText(
      '{"projects":[{"name":"API","path":"/repo/api","favorites":["bootRun"],"npmOrder":["start:dev"]}]}',
    );

    expect(config.projects[0]).toEqual({
      name: "API",
      path: "/repo/api",
      gradleCommand: "./gradlew",
      favorites: ["bootRun"],
      npmOrder: ["start:dev"],
    });
  });
});
