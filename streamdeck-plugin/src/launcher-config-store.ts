import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLauncherConfig } from "./launcher-config.js";
import { normalizeProjectPath } from "./launcher-paths.js";
import type { LauncherConfig, LauncherProjectPreferences } from "./launcher-types.js";

type RawConfigObject = Record<string, unknown>;

export interface LauncherConfigLoad {
  config: LauncherConfig;
  error: string | null;
}

interface RawLauncherConfigLoad extends LauncherConfigLoad {
  raw: RawConfigObject;
}

function rawConfigObject(value: unknown): RawConfigObject {
  return isRawConfigObject(value) ? value : { projects: [] };
}

function isRawConfigObject(value: unknown): value is RawConfigObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
    const loaded = this.loadRaw();
    return { config: loaded.config, error: loaded.error };
  }

  private loadRaw(): RawLauncherConfigLoad {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { raw: rawConfigObject(raw), config: parseLauncherConfig(raw), error: null };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { raw: { projects: [] }, config: emptyLauncherConfig(), error: null };
      const message = err instanceof Error ? err.message : String(err);
      return { raw: { projects: [] }, config: emptyLauncherConfig(), error: `launcher.json: ${message}` };
    }
  }

  saveProjectPreferences(projectPath: string, preferences: LauncherProjectPreferences): LauncherConfigLoad {
    const current = this.loadRaw();
    if (current.error) return current;

    const normalizedPath = normalizeProjectPath(projectPath);
    const index = current.config.projects.findIndex((project) => project.path === normalizedPath);
    if (index < 0) {
      return { config: current.config, error: `Project is not configured: ${normalizedPath}` };
    }

    const rawProjects = Array.isArray(current.raw.projects) ? current.raw.projects : [];
    const rawProject = rawProjects[index];
    if (!isRawConfigObject(rawProject)) {
      return { config: current.config, error: "launcher.json: project must be an object" };
    }

    try {
      const candidateRaw = {
        ...current.raw,
        projects: rawProjects.map((project, projectIndex) => (
          projectIndex === index
            ? { ...rawProject, favorites: preferences.favorites, npmOrder: preferences.npmOrder }
            : project
        )),
      };
      const next = parseLauncherConfig(candidateRaw);
      const parsedProject = next.projects[index];
      const nextRaw = {
        ...current.raw,
        projects: rawProjects.map((project, projectIndex) => (
          projectIndex === index
            ? { ...rawProject, favorites: parsedProject.favorites, npmOrder: parsedProject.npmOrder }
            : project
        )),
      };
      this.writeConfig(nextRaw);
      return { config: next, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { config: current.config, error: `launcher.json: ${message}` };
    }
  }

  private writeConfig(config: RawConfigObject): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // Preserve the original write/rename failure.
      }
      throw err;
    }
  }
}
