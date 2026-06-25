import type { IntelliJProject, LauncherConfig, LauncherPage, LauncherProject, LauncherSlot } from "./launcher-types.js";
import { normalizeProjectPath } from "./launcher-paths.js";

const DEFAULT_TASKS = ["bootRun", "test", "build", "clean"];
const SLOT_COUNT = 15;

export class LauncherState {
  private page: LauncherPage = { kind: "home" };
  private openPaths = new Set<string>();
  private detectedTasks = new Map<string, string[]>();
  private configError: string | null = null;
  private config: LauncherConfig;

  constructor(config: LauncherConfig) {
    this.config = this.normalizedConfig(config);
  }

  currentPage(): LauncherPage { return this.page; }

  applyConfig(config: LauncherConfig): void {
    this.config = this.normalizedConfig(config);
    const projectPaths = new Set(this.config.projects.map((project) => project.path));
    for (const path of this.detectedTasks.keys()) {
      if (!projectPaths.has(path)) this.detectedTasks.delete(path);
    }
    if (this.page.kind === "project" && !this.projectFor(this.page.path)) {
      this.page = { kind: "home" };
    }
  }

  setConfigError(message: string | null): void {
    this.configError = message && message.trim() ? message.trim() : null;
    if (this.configError) this.page = { kind: "home" };
  }

  applyIntelliJProjects(projects: IntelliJProject[]): void {
    this.openPaths = new Set(projects.map((project) => normalizeProjectPath(project.path)));
  }

  applyProjectTasks(path: string, tasks: string[]): void {
    const normalizedPath = normalizeProjectPath(path);
    const uniqueTasks = [...new Set(tasks.map((task) => task.trim()).filter(Boolean))];
    this.detectedTasks.set(normalizedPath, uniqueTasks);
  }

  openProject(path: string): void {
    const normalizedPath = normalizeProjectPath(path);
    if (this.projectFor(normalizedPath)) this.page = { kind: "project", path: normalizedPath };
  }

  back(): void { this.page = { kind: "home" }; }

  slots(): LauncherSlot[] {
    if (this.configError) {
      return this.padSlots([
        { kind: "message", label: "Config Error", detail: this.configError },
        { kind: "control", action: "refresh", label: "Refresh" },
      ]);
    }
    const slots = this.page.kind === "home" ? this.homeSlots() : this.projectSlots(this.page.path);
    return this.padSlots(slots);
  }

  private padSlots(slots: LauncherSlot[]): LauncherSlot[] {
    return [...slots, ...Array.from({ length: Math.max(0, SLOT_COUNT - slots.length) }, () => ({ kind: "empty" as const }))].slice(0, SLOT_COUNT);
  }

  private homeSlots(): LauncherSlot[] {
    const projects = this.config.projects.slice(0, SLOT_COUNT - 1).map((project) => ({
      kind: "project" as const,
      label: project.name,
      path: project.path,
      status: this.openPaths.has(project.path) ? "OPEN" as const : "iTerm" as const,
    }));
    return [...projects, { kind: "control", action: "refresh", label: "Refresh" }];
  }

  private projectSlots(path: string): LauncherSlot[] {
    const project = this.projectFor(path);
    if (!project) return [{ kind: "control", action: "back", label: "Back" }];
    const status = this.openPaths.has(project.path) ? "OPEN" as const : "iTerm" as const;
    const tasks = this.tasksForProject(project).slice(0, SLOT_COUNT - 2);
    return [
      { kind: "control", action: "back", label: "Back" },
      ...tasks.map((task) => ({ kind: "task" as const, projectPath: project.path, task, gradleCommand: project.gradleCommand, status })),
      { kind: "control", action: "refresh", label: "Refresh" },
    ];
  }

  private tasksForProject(project: LauncherProject): string[] {
    const detected = this.detectedTasks.get(project.path);
    if (detected?.length) {
      return [...new Set([...project.favorites, ...detected])];
    }
    return project.favorites.length ? project.favorites : DEFAULT_TASKS;
  }

  private projectFor(path: string): LauncherProject | undefined {
    const normalizedPath = normalizeProjectPath(path);
    return this.config.projects.find((project) => project.path === normalizedPath);
  }

  private normalizedConfig(config: LauncherConfig): LauncherConfig {
    return {
      projects: config.projects.map((project) => ({
        ...project,
        path: normalizeProjectPath(project.path),
      })),
    };
  }
}
