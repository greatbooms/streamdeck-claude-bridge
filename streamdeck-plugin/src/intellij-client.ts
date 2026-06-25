import type { IntelliJProject } from "./launcher-types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class IntelliJClient {
  constructor(private baseUrl = "http://127.0.0.1:8788", private fetchImpl: FetchLike = fetch) {}

  async projects(): Promise<IntelliJProject[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects`);
    if (!res.ok) return [];

    const body = await res.json() as { projects?: unknown };
    return Array.isArray(body.projects) ? body.projects as IntelliJProject[] : [];
  }

  async tasks(path: string): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects/tasks?path=${encodeURIComponent(path)}`);
    if (!res.ok) return [];

    const body = await res.json() as { tasks?: unknown };
    return Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string") : [];
  }

  async runGradle(path: string, task: string): Promise<boolean> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, task }),
    });

    if (res.status === 404 || res.status === 409) return false;
    if (!res.ok) throw new Error(`IntelliJ Gradle run failed: ${res.status}`);
    return true;
  }
}
