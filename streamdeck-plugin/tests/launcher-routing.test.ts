import { describe, expect, it } from "vitest";
import { GradleBridgeClient, runLauncherCommand } from "../src/gradle-bridge-client.js";

describe("GradleBridgeClient", () => {
  it("posts Gradle iTerm fallback requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new GradleBridgeClient("http://bridge", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 202 });
    }, () => "secret");

    await client.runGradleInIterm("/repo/api", "./gradlew", ":api:bootRun");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://bridge/run/gradle/iterm");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-StreamDeck-Bridge-Token": "secret",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      cwd: "/repo/api",
      gradleCommand: "./gradlew",
      task: ":api:bootRun",
    });
  });

  it("posts npm iTerm fallback requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new GradleBridgeClient("http://bridge", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 202 });
    }, () => "secret");

    await client.runNpmInIterm("/repo/web", "start:dev");

    expect(calls[0].url).toBe("http://bridge/run/npm/iterm");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ cwd: "/repo/web", script: "start:dev" });
  });

  it("throws bridge response details on non-ok responses", async () => {
    const client = new GradleBridgeClient("http://bridge", async () => new Response(JSON.stringify({ ok: false, error: "iTerm is unavailable" }), { status: 503 }), () => "secret");

    await expect(client.runGradleInIterm("/repo/api", "./gradlew", "test")).rejects.toThrow("Bridge iTerm fallback failed: 503 iTerm is unavailable");
  });
});

describe("runLauncherCommand", () => {
  it("uses IntelliJ when project is open", async () => {
    const events: string[] = [];
    await runLauncherCommand(
      { kind: "gradle", projectPath: "/repo/api", task: "bootRun", gradleCommand: "./gradlew", status: "OPEN" },
      {
        intellij: { runGradle: async (path, task) => { events.push(`intellij:${path}:${task}`); return true; } },
        bridge: { runGradleInIterm: async () => { events.push("bridge"); } },
      },
    );

    expect(events).toEqual(["intellij:/repo/api:bootRun"]);
  });

  it("falls back to bridge when IntelliJ reports not open", async () => {
    const events: string[] = [];
    await runLauncherCommand(
      { kind: "gradle", projectPath: "/repo/api", task: "bootRun", gradleCommand: "./gradlew", status: "OPEN" },
      {
        intellij: { runGradle: async () => false },
        bridge: { runGradleInIterm: async (path, gradleCommand, task) => { events.push(`bridge:${path}:${gradleCommand}:${task}`); } },
      },
    );

    expect(events).toEqual(["bridge:/repo/api:./gradlew:bootRun"]);
  });

  it("uses bridge directly when status is iTerm", async () => {
    const events: string[] = [];
    await runLauncherCommand(
      { kind: "gradle", projectPath: "/repo/admin", task: "test", gradleCommand: "./gradlew", status: "iTerm" },
      {
        intellij: { runGradle: async () => { events.push("intellij"); return true; } },
        bridge: { runGradleInIterm: async (path, gradleCommand, task) => { events.push(`bridge:${path}:${gradleCommand}:${task}`); } },
      },
    );

    expect(events).toEqual(["bridge:/repo/admin:./gradlew:test"]);
  });

  it("uses IntelliJ npm run configuration before iTerm fallback", async () => {
    const events: string[] = [];
    await runLauncherCommand(
      { kind: "npm", projectPath: "/repo/front", script: "start:dev", status: "OPEN" },
      {
        intellij: {
          runGradle: async () => false,
          runNpm: async (path, script) => { events.push(`intellij-npm:${path}:${script}`); return true; },
        },
        bridge: {
          runGradleInIterm: async () => { events.push("gradle-bridge"); },
          runNpmInIterm: async () => { events.push("npm-bridge"); },
        },
      },
    );

    expect(events).toEqual(["intellij-npm:/repo/front:start:dev"]);
  });

  it("falls back to iTerm when IntelliJ has no npm run configuration", async () => {
    const events: string[] = [];
    await runLauncherCommand(
      { kind: "npm", projectPath: "/repo/front", script: "dev", status: "OPEN" },
      {
        intellij: {
          runGradle: async () => false,
          runNpm: async () => false,
        },
        bridge: {
          runGradleInIterm: async () => { events.push("gradle-bridge"); },
          runNpmInIterm: async (path, script) => { events.push(`npm-bridge:${path}:${script}`); },
        },
      },
    );

    expect(events).toEqual(["npm-bridge:/repo/front:dev"]);
  });
});
