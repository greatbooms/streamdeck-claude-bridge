import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjectCapabilities, orderedNpmScripts } from "../src/project-detector.js";

describe("project detector", () => {
  it("detects Gradle files and npm scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-project-"));
    writeFileSync(join(dir, "settings.gradle.kts"), "");
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { build: "vite build", "start:dev": "nest start --watch", lint: "eslint .", custom: "node tool.js" },
    }));

    expect(detectProjectCapabilities(dir)).toEqual({
      hasGradle: true,
      npmScripts: ["start:dev", "build", "lint", "custom"],
    });
  });

  it("orders common npm scripts first", () => {
    expect(orderedNpmScripts(["custom", "build", "start:dev", "dev", "test"])).toEqual([
      "start:dev",
      "dev",
      "test",
      "build",
      "custom",
    ]);
  });

  it("orders npm scripts with project-specific preference first", () => {
    expect(orderedNpmScripts(["build", "start:dev", "lint", "dev"], ["dev", "build"])).toEqual([
      "dev",
      "build",
      "lint",
      "start:dev",
    ]);
  });
});
