import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("preserves unrelated raw config shape when saving project preferences", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = {
      schemaVersion: 1,
      projects: [
        {
          name: "API",
          path: "/repo/root/../api/",
          favorites: ["bootRun"],
          npmOrder: ["start:dev"],
          color: "blue",
        },
        {
          name: "Admin",
          path: "/repo/admin",
          favorites: ["test"],
          customProjectField: { owner: "ops" },
        },
      ],
    };
    writeFileSync(file, JSON.stringify(original));
    const store = new FileLauncherConfigStore(file);

    const result = store.saveProjectPreferences("/repo/api", {
      favorites: ["build", "test"],
      npmOrder: ["dev", "build"],
    });

    expect(result.error).toBeNull();

    const written = JSON.parse(readFileSync(file, "utf8"));
    const { favorites, npmOrder, ...selectedRest } = written.projects[0];
    expect(favorites).toEqual(["build", "test"]);
    expect(npmOrder).toEqual(["dev", "build"]);
    expect(selectedRest).toEqual({
      name: "API",
      path: "/repo/root/../api/",
      color: "blue",
    });
    expect(written.schemaVersion).toBe(1);
    expect(written.projects[1]).toEqual(original.projects[1]);
    expect(written.projects[1]).not.toHaveProperty("npmOrder");
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

  it("removes temporary config files when writing fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = JSON.stringify({ projects: [{ name: "API", path: "/repo/api" }] });
    writeFileSync(file, original);
    const store = new FileLauncherConfigStore(file);
    const timestamp = 123456789;
    const tempPath = `${file}.${process.pid}.${timestamp}.tmp`;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(timestamp);
    const renameSync = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    try {
      const result = store.saveProjectPreferences("/repo/api", {
        favorites: ["bootRun"],
        npmOrder: ["dev"],
      });

      expect(result.error).toContain("rename failed");
      expect(existsSync(tempPath)).toBe(false);
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      renameSync.mockRestore();
      dateNow.mockRestore();
    }
  });
});
