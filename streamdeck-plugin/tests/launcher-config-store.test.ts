import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileLauncherConfigStore } from "../src/launcher-config-store.js";

describe("FileLauncherConfigStore", () => {
  it("loads missing config as empty config", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const store = new FileLauncherConfigStore(join(dir, "missing", "launcher.json"));

    expect(store.load()).toEqual({ config: { projects: [] }, error: null });
  });

  it("saves preferences for the selected project only", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "app", "launcher.json");
    const store = new FileLauncherConfigStore(file);
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(file, JSON.stringify({
      projects: [
        { name: "API", path: "/repo/api", favorites: ["bootRun"], npmOrder: ["start:dev"] },
        { name: "Admin", path: "/repo/admin", favorites: ["test"], npmOrder: ["dev"] },
      ],
    }), { encoding: "utf8", flag: "wx" });

    const result = store.saveProjectPreferences("/repo/api", {
      favorites: ["build", "build", "test"],
      npmOrder: ["dev", "build", "dev"],
    });

    expect(result.error).toBeNull();
    expect(result.config.projects[0]).toMatchObject({
      name: "API",
      path: "/repo/api",
      favorites: ["build", "test"],
      npmOrder: ["dev", "build"],
    });
    expect(result.config.projects[1]).toMatchObject({
      name: "Admin",
      path: "/repo/admin",
      favorites: ["test"],
      npmOrder: ["dev"],
    });

    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written.projects[0].favorites).toEqual(["build", "test"]);
    expect(written.projects[0].npmOrder).toEqual(["dev", "build"]);
  });

  it("returns an error and leaves the file unchanged for unknown projects", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = JSON.stringify({ projects: [{ name: "API", path: "/repo/api" }] });
    writeFileSync(file, original);
    const store = new FileLauncherConfigStore(file);

    const result = store.saveProjectPreferences("/repo/missing", {
      favorites: ["bootRun"],
      npmOrder: ["dev"],
    });

    expect(result.error).toContain("Project is not configured");
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("returns an error and leaves the file unchanged for invalid preferences", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = JSON.stringify({ projects: [{ name: "API", path: "/repo/api" }] });
    writeFileSync(file, original);
    const store = new FileLauncherConfigStore(file);

    const result = store.saveProjectPreferences("/repo/api", {
      favorites: ["bootRun --scan"],
      npmOrder: ["dev"],
    });

    expect(result.error).toContain("Gradle task");
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});
