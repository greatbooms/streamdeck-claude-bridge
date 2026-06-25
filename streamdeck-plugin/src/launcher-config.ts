import type { LauncherConfig, LauncherProject } from "./launcher-types.js";
import { requireAbsoluteProjectPath } from "./launcher-paths.js";

const TASK_RE = /^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;
const PLAIN_COMMAND_RE = /^[A-Za-z0-9_.-]+$/;
const ABSOLUTE_COMMAND_RE = /^\/[A-Za-z0-9_./-]+$/;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function parseProject(raw: unknown): LauncherProject {
  if (!raw || typeof raw !== "object") throw new Error("project must be an object");
  const obj = raw as Record<string, unknown>;
  const favorites = Array.isArray(obj.favorites) ? obj.favorites.map((v) => asString(v, "favorite")) : [];
  for (const task of favorites) {
    if (!TASK_RE.test(task)) throw new Error(`Gradle task is invalid: ${task}`);
  }
  const gradleCommand = parseGradleCommand(obj.gradleCommand);
  return {
    name: asString(obj.name, "name"),
    path: requireAbsoluteProjectPath(asString(obj.path, "path")),
    gradleCommand,
    favorites,
  };
}

function parseGradleCommand(value: unknown): string {
  if (value === undefined || value === null) return "./gradlew";
  if (typeof value !== "string") throw new Error("gradleCommand must be a string");
  const gradleCommand = value.trim();
  if (gradleCommand === "") throw new Error("gradleCommand is required");
  if (
    gradleCommand !== "./gradlew"
    && !PLAIN_COMMAND_RE.test(gradleCommand)
    && !ABSOLUTE_COMMAND_RE.test(gradleCommand)
  ) {
    throw new Error(`gradleCommand is invalid: ${gradleCommand}`);
  }
  return gradleCommand;
}

export function parseLauncherConfig(raw: unknown): LauncherConfig {
  if (!raw || typeof raw !== "object") return { projects: [] };
  const projects = (raw as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) return { projects: [] };
  return { projects: projects.map(parseProject) };
}

export function loadLauncherConfigFromText(text: string): LauncherConfig {
  return parseLauncherConfig(JSON.parse(text));
}
