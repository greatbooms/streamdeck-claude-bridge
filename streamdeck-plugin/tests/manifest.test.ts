import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pluginDir = join(process.cwd(), "com.shinsanghoon.claude-bridge.sdPlugin");
const LAUNCHER_UUID = "com.shinsanghoon.claude-bridge.launcher";

function readManifest(): {
  Actions: Array<{ UUID: string; Name: string }>;
  Profiles: Array<{ Name: string }>;
} {
  return JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
}

describe("Stream Deck manifest", () => {
  it("declares separate Claude and Codex bundled profiles", () => {
    const manifest = readManifest();
    expect(manifest.Profiles.map((p: { Name: string }) => p.Name)).toEqual([
      "Claude Bridge",
      "Codex Bridge",
      "Dev Launcher",
    ]);
    expect(existsSync(join(pluginDir, "Claude Bridge.streamDeckProfile"))).toBe(true);
    expect(existsSync(join(pluginDir, "Codex Bridge.streamDeckProfile"))).toBe(true);
    expect(existsSync(join(pluginDir, "Dev Launcher.streamDeckProfile"))).toBe(true);
  });

  it("declares a Codex logo action for the Codex profile", () => {
    const manifest = readManifest();
    expect(manifest.Actions.map((a: { UUID: string }) => a.UUID)).toContain(
      "com.shinsanghoon.claude-bridge.codex-logo",
    );
  });

  it("declares Dev Launcher profile and launcher tile action", () => {
    const manifest = readManifest();
    const launcher = manifest.Actions.find((action) => action.UUID === LAUNCHER_UUID);
    expect(launcher?.Name).toBe("Project Launcher Tile");
    expect(manifest.Profiles.some((profile) => profile.Name === "Dev Launcher")).toBe(true);
  });

  it("packages the Codex profile with Codex identity and logo action", () => {
    const profile = join(pluginDir, "Codex Bridge.streamDeckProfile");
    const entries = execFileSync("unzip", ["-Z1", profile], { encoding: "utf8" })
      .trim()
      .split("\n");
    const profileManifestEntry = entries.find((entry) => entry.endsWith(".sdProfile/manifest.json"));
    expect(profileManifestEntry).toBeTruthy();
    const profileManifest = JSON.parse(
      execFileSync("unzip", ["-p", profile, profileManifestEntry!], { encoding: "utf8" }),
    );
    expect(profileManifest.Name).toBe("Codex Bridge");
    expect(entries).not.toContain("Profiles/283A5460-46F2-4D9F-98A2-59B279EC4978.sdProfile/");

    const pageManifestEntry = entries.find(
      (entry) => entry.includes(".sdProfile/Profiles/") && entry.endsWith("/manifest.json"),
    );
    const pageManifest = execFileSync("unzip", ["-p", profile, pageManifestEntry!], {
      encoding: "utf8",
    });
    expect(pageManifest).toContain("com.shinsanghoon.claude-bridge.codex-logo");
  });

  it("packages the Dev Launcher profile with launcher actions for all 15 slots", () => {
    const profile = join(pluginDir, "Dev Launcher.streamDeckProfile");
    const entries = execFileSync("unzip", ["-Z1", profile], { encoding: "utf8" })
      .trim()
      .split("\n");
    const pageManifestEntries = entries.filter(
      (entry) => entry.includes(".sdProfile/Profiles/") && entry.endsWith("/manifest.json"),
    );
    const pageManifests = pageManifestEntries.map((entry) =>
      JSON.parse(execFileSync("unzip", ["-p", profile, entry], { encoding: "utf8" })),
    );
    const launcherPage = pageManifests.find((page) =>
      page.Controllers?.some((controller: { Actions?: Record<string, { UUID?: string }> }) =>
        Object.values(controller.Actions ?? {}).some((action) => action.UUID === LAUNCHER_UUID),
      ),
    );
    expect(launcherPage).toBeTruthy();

    const keypad = launcherPage!.Controllers.find((controller: { Type?: string }) => controller.Type === "Keypad");
    const actions = Object.entries(keypad.Actions) as Array<[
      string,
      { UUID?: string; Settings?: { slot?: number } },
    ]>;
    expect(actions).toHaveLength(15);

    const slots = actions.map(([position, action]) => {
      const [column, row] = position.split(",").map(Number);
      expect(action.UUID).toBe(LAUNCHER_UUID);
      expect(action.Settings).toEqual({ slot: row * 5 + column });
      return action.Settings?.slot;
    });
    expect(slots.sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 15 }, (_, slot) => slot),
    );
  });
});
