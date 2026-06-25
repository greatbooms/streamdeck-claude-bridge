import type { IntelliJProject } from "./launcher-types.js";
import { authHeaders, loadOrCreateBridgeToken, type TokenProvider } from "./launcher-auth.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class IntelliJClient {
  constructor(
    private baseUrl = "http://127.0.0.1:8788",
    private fetchImpl: FetchLike = fetch,
    private tokenProvider: TokenProvider = loadOrCreateBridgeToken,
  ) {}

  async projects(): Promise<IntelliJProject[]> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/projects`, { headers: authHeaders(this.tokenProvider) });
      if (!res.ok) return [];

      const body = await res.json() as { projects?: unknown };
      return Array.isArray(body.projects) ? body.projects as IntelliJProject[] : [];
    } catch {
      return [];
    }
  }

  async tasks(path: string): Promise<string[]> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/projects/tasks?path=${encodeURIComponent(path)}`, {
        headers: authHeaders(this.tokenProvider),
      });
      if (!res.ok) return [];

      const body = await res.json() as { tasks?: unknown };
      return Array.isArray(body.tasks) ? body.tasks.filter((task): task is string => typeof task === "string") : [];
    } catch {
      return [];
    }
  }

  async runGradle(path: string, task: string): Promise<boolean> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/projects/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(this.tokenProvider) },
        body: JSON.stringify({ path, task }),
      });
    } catch {
      return false;
    }

    if (res.status === 404 || res.status === 409) return false;
    if (!res.ok) throw new Error(`IntelliJ Gradle run failed: ${res.status}`);
    return true;
  }
}
