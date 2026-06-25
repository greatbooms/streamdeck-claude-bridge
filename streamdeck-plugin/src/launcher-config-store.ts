import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLauncherConfigFromText, parseLauncherConfig } from "./launcher-config.js";
import { normalizeProjectPath } from "./launcher-paths.js";
import type { LauncherConfig, LauncherProjectPreferences } from "./launcher-types.js";

export interface LauncherConfigLoad {
  config: LauncherConfig;
  error: string | null;
}

export function launcherConfigPath(home = os.homedir()): string {
  return path.join(home, "Library", "Application Support", "streamdeck-claude-bridge", "launcher.json");
}

export function emptyLauncherConfig(): LauncherConfig {
  return parseLauncherConfig({ projects: [] });
}

export class FileLauncherConfigStore {
  constructor(private readonly filePath = launcherConfigPath()) {}

  load(): LauncherConfigLoad {
    try {
      return { config: loadLauncherConfigFromText(fs.readFileSync(this.filePath, "utf8")), error: null };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { config: emptyLauncherConfig(), error: null };
      const message = err instanceof Error ? err.message : String(err);
      return { config: emptyLauncherConfig(), error: `launcher.json: ${message}` };
    }
  }

  saveProjectPreferences(projectPath: string, preferences: LauncherProjectPreferences): LauncherConfigLoad {
    const current = this.load();
    if (current.error) return current;

    const normalizedPath = normalizeProjectPath(projectPath);
    const index = current.config.projects.findIndex((project) => project.path === normalizedPath);
    if (index < 0) {
      return { config: current.config, error: `Project is not configured: ${normalizedPath}` };
    }

    try {
      const next = parseLauncherConfig({
        projects: current.config.projects.map((project, projectIndex) => (
          projectIndex === index
            ? { ...project, favorites: preferences.favorites, npmOrder: preferences.npmOrder }
            : project
        )),
      });
      this.writeConfig(next);
      return { config: next, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { config: current.config, error: `launcher.json: ${message}` };
    }
  }

  private writeConfig(config: LauncherConfig): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}
