import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pluginDir = join(process.cwd(), "com.shinsanghoon.claude-bridge.sdPlugin");

describe("Stream Deck manifest", () => {
  it("declares separate Claude and Codex bundled profiles", () => {
    const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
    expect(manifest.Profiles.map((p: { Name: string }) => p.Name)).toEqual([
      "Claude Bridge",
      "Codex Bridge",
    ]);
    expect(existsSync(join(pluginDir, "Claude Bridge.streamDeckProfile"))).toBe(true);
    expect(existsSync(join(pluginDir, "Codex Bridge.streamDeckProfile"))).toBe(true);
  });

  it("declares a Codex logo action for the Codex profile", () => {
    const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
    expect(manifest.Actions.map((a: { UUID: string }) => a.UUID)).toContain(
      "com.shinsanghoon.claude-bridge.codex-logo",
    );
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
});
