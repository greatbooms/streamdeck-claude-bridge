import { describe, expect, it } from "vitest";
import { IntelliJClient } from "../src/intellij-client.js";

describe("IntelliJClient", () => {
  it("fetches open projects", async () => {
    const calls: string[] = [];
    const client = new IntelliJClient("http://idea", async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ projects: [{ name: "api", path: "/repo/api", basePath: "/repo/api" }] }), { status: 200 });
    }, () => "secret");

    await expect(client.projects()).resolves.toEqual([{ name: "api", path: "/repo/api", basePath: "/repo/api" }]);
    expect(calls).toEqual(["http://idea/projects"]);
  });

  it("returns empty projects on malformed body or non-ok response", async () => {
    const malformed = new IntelliJClient("http://idea", async () => new Response(JSON.stringify({ projects: "nope" }), { status: 200 }));
    await expect(malformed.projects()).resolves.toEqual([]);

    const failed = new IntelliJClient("http://idea", async () => new Response("unavailable", { status: 500 }));
    await expect(failed.projects()).resolves.toEqual([]);
  });

  it("fetches tasks for an encoded project path and keeps string tasks only", async () => {
    const calls: string[] = [];
    const client = new IntelliJClient("http://idea", async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ tasks: ["bootRun", 12, ":api:test", null] }), { status: 200 });
    }, () => "secret");

    await expect(client.tasks("/repo/my api")).resolves.toEqual(["bootRun", ":api:test"]);
    expect(calls).toEqual(["http://idea/projects/tasks?path=%2Frepo%2Fmy%20api"]);
  });

  it("returns empty tasks on malformed body or non-ok response", async () => {
    const malformed = new IntelliJClient("http://idea", async () => new Response(JSON.stringify({ tasks: "bootRun" }), { status: 200 }));
    await expect(malformed.tasks("/repo/api")).resolves.toEqual([]);

    const failed = new IntelliJClient("http://idea", async () => new Response("missing", { status: 404 }));
    await expect(failed.tasks("/repo/api")).resolves.toEqual([]);
  });

  it("posts Gradle run requests and returns true on ok", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new IntelliJClient("http://idea", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 200 });
    }, () => "secret");

    await expect(client.runGradle("/repo/api", "bootRun")).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://idea/projects/run");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-StreamDeck-Bridge-Token": "secret",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ path: "/repo/api", task: "bootRun" });
  });

  it("returns empty projects and tasks when IntelliJ is unreachable", async () => {
    const client = new IntelliJClient("http://idea", async () => {
      throw new TypeError("connection refused");
    }, () => "secret");

    await expect(client.projects()).resolves.toEqual([]);
    await expect(client.tasks("/repo/api")).resolves.toEqual([]);
  });

  it("returns false from runGradle when IntelliJ is unreachable so callers can fall back", async () => {
    const client = new IntelliJClient("http://idea", async () => {
      throw new TypeError("connection refused");
    }, () => "secret");

    await expect(client.runGradle("/repo/api", "bootRun")).resolves.toBe(false);
  });

  it("returns false when run receives project-not-open responses", async () => {
    const notFound = new IntelliJClient("http://idea", async () => new Response("not open", { status: 404 }));
    await expect(notFound.runGradle("/repo/api", "bootRun")).resolves.toBe(false);

    const conflict = new IntelliJClient("http://idea", async () => new Response("busy", { status: 409 }));
    await expect(conflict.runGradle("/repo/api", "bootRun")).resolves.toBe(false);
  });

  it("throws when run receives other non-ok responses", async () => {
    const client = new IntelliJClient("http://idea", async () => new Response("error", { status: 500 }));

    await expect(client.runGradle("/repo/api", "bootRun")).rejects.toThrow("IntelliJ Gradle run failed: 500");
  });
});
