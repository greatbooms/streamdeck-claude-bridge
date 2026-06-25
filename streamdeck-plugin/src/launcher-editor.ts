import type { LauncherEditorSnapshot, LauncherProjectPreferences } from "./launcher-types.js";

export type LauncherEditorRequest =
  | { type: "launcherEditorReady" }
  | { type: "launcherEditorRefresh"; projectPath?: string }
  | ({ type: "saveProjectPreferences"; projectPath: string } & LauncherProjectPreferences);

export type LauncherEditorResponse =
  | ({ type: "launcherEditorSnapshot" } & LauncherEditorSnapshot)
  | { type: "launcherEditorError"; error: string };

export function parseLauncherEditorRequest(payload: unknown): LauncherEditorRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  if (obj.type === "launcherEditorReady") return { type: "launcherEditorReady" };

  if (obj.type === "launcherEditorRefresh") {
    const projectPath = typeof obj.projectPath === "string" && obj.projectPath.trim()
      ? obj.projectPath.trim()
      : undefined;
    return projectPath ? { type: "launcherEditorRefresh", projectPath } : { type: "launcherEditorRefresh" };
  }

  if (obj.type === "saveProjectPreferences") {
    if (typeof obj.projectPath !== "string" || !obj.projectPath.trim()) return null;
    if (!Array.isArray(obj.favorites) || !Array.isArray(obj.npmOrder)) return null;
    return {
      type: "saveProjectPreferences",
      projectPath: obj.projectPath.trim(),
      favorites: trimStringArray(obj.favorites),
      npmOrder: trimStringArray(obj.npmOrder),
    };
  }

  return null;
}

function trimStringArray(values: unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}
