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

export type LauncherPage =
  | { kind: "home" }
  | { kind: "project"; path: string };

export type LauncherSlot =
  | { kind: "empty" }
  | { kind: "project"; label: string; path: string; status: "OPEN" | "iTerm" | "MISSING" }
  | { kind: "task"; projectPath: string; task: string; gradleCommand: string; status: "OPEN" | "iTerm" }
  | { kind: "control"; action: "back" | "refresh"; label: string };
