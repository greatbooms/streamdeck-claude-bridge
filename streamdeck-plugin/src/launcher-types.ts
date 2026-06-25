export interface LauncherProject {
  name: string;
  path: string;
  gradleCommand: string;
  favorites: string[];
}

export interface LauncherConfig {
  projects: LauncherProject[];
}

export interface IntelliJProject {
  name: string;
  path: string;
  basePath: string;
}

export interface ProjectCapabilities {
  hasGradle: boolean;
  npmScripts: string[];
}

export type LauncherPage =
  | { kind: "home" }
  | { kind: "project"; path: string };

export type LauncherCommand =
  | { kind: "gradle"; projectPath: string; task: string; gradleCommand: string; status: "OPEN" | "iTerm" }
  | { kind: "npm"; projectPath: string; script: string; status: "OPEN" | "iTerm" };

export type LauncherSlot =
  | { kind: "empty" }
  | { kind: "message"; label: string; detail: string }
  | { kind: "project"; label: string; path: string; status: "OPEN" | "iTerm" | "MISSING" }
  | { kind: "command"; label: string; command: LauncherCommand; status: "OPEN" | "iTerm" }
  | { kind: "control"; action: "back" | "refresh"; label: string };
