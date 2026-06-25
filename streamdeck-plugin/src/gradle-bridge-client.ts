import { authHeaders, loadOrCreateBridgeToken, type TokenProvider } from "./launcher-auth.js";

export interface TaskRun {
  projectPath: string;
  task: string;
  gradleCommand: string;
  status: "OPEN" | "iTerm";
}

export interface IntelliJRunClient {
  runGradle(path: string, task: string): Promise<boolean>;
}

export interface BridgeRunClient {
  runGradleInIterm(path: string, gradleCommand: string, task: string): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GradleBridgeClient implements BridgeRunClient {
  constructor(
    private baseUrl = "http://127.0.0.1:8787",
    private fetchImpl: FetchLike = fetch,
    private tokenProvider: TokenProvider = loadOrCreateBridgeToken,
  ) {}

  async runGradleInIterm(path: string, gradleCommand: string, task: string): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/run/gradle/iterm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(this.tokenProvider) },
      body: JSON.stringify({ cwd: path, gradleCommand, task }),
    });

    if (!res.ok) throw new Error(`Bridge iTerm fallback failed: ${res.status}`);
  }
}

export async function runLauncherTask(
  task: TaskRun,
  deps: { intellij: IntelliJRunClient; bridge: BridgeRunClient },
): Promise<void> {
  if (task.status === "OPEN") {
    const accepted = await deps.intellij.runGradle(task.projectPath, task.task);
    if (accepted) return;
  }

  await deps.bridge.runGradleInIterm(task.projectPath, task.gradleCommand, task.task);
}
