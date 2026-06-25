# Launcher Preferences Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit Dev Launcher Gradle favorites and npm script order from the Stream Deck Property Inspector instead of manually editing `launcher.json`.

**Architecture:** Extend the launcher config model with `npmOrder`, keep `launcher.json` as the source of truth, add a small config store for atomic writes, expose read-only editor snapshots from `LauncherState`, and wire `Project Launcher Tile` Property Inspector messages through `LauncherAction`. The runtime launcher key behavior remains unchanged except for using configured npm ordering.

**Tech Stack:** TypeScript, `@elgato/streamdeck` SDK 2.1, vitest, Stream Deck Property Inspector HTML/JavaScript.

---

## File Structure

- Modify `streamdeck-plugin/src/launcher-types.ts`: add `npmOrder`, editor snapshot types, and project preference types.
- Modify `streamdeck-plugin/src/launcher-config.ts`: parse, default, de-duplicate, and validate `npmOrder`.
- Modify `streamdeck-plugin/src/project-detector.ts`: make npm ordering accept project-specific preferred order.
- Modify `streamdeck-plugin/src/launcher-state.ts`: apply project-specific npm ordering and expose editor snapshots.
- Create `streamdeck-plugin/src/launcher-config-store.ts`: load and atomically save launcher config.
- Create `streamdeck-plugin/src/launcher-editor.ts`: define and parse Property Inspector message payloads.
- Modify `streamdeck-plugin/src/launcher-action.ts`: handle Property Inspector appear, refresh, and save messages.
- Modify `streamdeck-plugin/src/plugin.ts`: instantiate the config store and pass editor dependencies into `LauncherAction`.
- Create `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/ui/launcher.html`: Property Inspector editor UI.
- Modify `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`: attach `ui/launcher.html` to the launcher action.
- Modify `streamdeck-plugin/tests/launcher-config.test.ts`: config defaults and validation.
- Modify `streamdeck-plugin/tests/project-detector.test.ts`: configurable npm ordering.
- Modify `streamdeck-plugin/tests/launcher-state.test.ts`: editor snapshots and npm ordering.
- Create `streamdeck-plugin/tests/launcher-config-store.test.ts`: save selected project preferences.
- Create `streamdeck-plugin/tests/launcher-editor.test.ts`: message parsing.
- Modify `streamdeck-plugin/tests/manifest.test.ts`: launcher Property Inspector packaging.
- Modify `SETUP.md`: document `npmOrder` and Stream Deck editor usage.

---

### Task 1: Config Model And npm Ordering

**Files:**
- Modify: `streamdeck-plugin/src/launcher-types.ts`
- Modify: `streamdeck-plugin/src/launcher-config.ts`
- Modify: `streamdeck-plugin/src/project-detector.ts`
- Test: `streamdeck-plugin/tests/launcher-config.test.ts`
- Test: `streamdeck-plugin/tests/project-detector.test.ts`

- [ ] **Step 1: Write failing config tests**

Update `streamdeck-plugin/tests/launcher-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_NPM_ORDER, loadLauncherConfigFromText, parseLauncherConfig } from "../src/launcher-config.js";

describe("parseLauncherConfig", () => {
  it("parses projects and defaults gradleCommand/favorites/npmOrder", () => {
    const config = parseLauncherConfig({
      projects: [{ name: "API", path: "/repo/root/../api/" }],
    });
    expect(config.projects).toEqual([
      {
        name: "API",
        path: "/repo/api",
        gradleCommand: "./gradlew",
        favorites: [],
        npmOrder: DEFAULT_NPM_ORDER,
      },
    ]);
  });

  it("parses custom npm order and removes duplicates", () => {
    const config = parseLauncherConfig({
      projects: [{
        name: "API",
        path: "/repo/api",
        npmOrder: ["start:dev", "build", "start:dev", "lint"],
      }],
    });

    expect(config.projects[0].npmOrder).toEqual(["start:dev", "build", "lint"]);
  });

  it("rejects projects without name or path", () => {
    expect(() => parseLauncherConfig({ projects: [{ name: "", path: "/repo" }] })).toThrow("name");
    expect(() => parseLauncherConfig({ projects: [{ name: "API", path: "" }] })).toThrow("path");
  });

  it("rejects unsafe task favorites", () => {
    expect(() => parseLauncherConfig({
      projects: [{ name: "API", path: "/repo", favorites: ["bootRun --scan"] }],
    })).toThrow("Gradle task");
  });

  it("rejects unsafe npm script names", () => {
    for (const script of ["start dev", "dev && whoami", "build;rm", "", 123]) {
      expect(() => parseLauncherConfig({
        projects: [{ name: "API", path: "/repo/api", npmOrder: [script] }],
      })).toThrow("npm script");
    }
  });

  it("rejects relative paths", () => {
    expect(() => parseLauncherConfig({
      projects: [{ name: "API", path: "repo/api" }],
    })).toThrow("path");
  });

  it("rejects unsafe gradle commands", () => {
    for (const gradleCommand of ["./gradlew --scan", "/tmp/gradlew>out", "/tmp/gradlew<in", "", "   ", 123]) {
      expect(() => parseLauncherConfig({
        projects: [{ name: "API", path: "/repo/api", gradleCommand }],
      })).toThrow("gradleCommand");
    }
  });

  it("loads config from JSON text", () => {
    const config = loadLauncherConfigFromText(
      '{"projects":[{"name":"API","path":"/repo/api","favorites":["bootRun"],"npmOrder":["start:dev"]}]}',
    );

    expect(config.projects[0]).toEqual({
      name: "API",
      path: "/repo/api",
      gradleCommand: "./gradlew",
      favorites: ["bootRun"],
      npmOrder: ["start:dev"],
    });
  });
});
```

- [ ] **Step 2: Write failing npm ordering tests**

Update `streamdeck-plugin/tests/project-detector.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectProjectCapabilities, orderedNpmScripts } from "../src/project-detector.js";

describe("project detector", () => {
  it("detects Gradle files and npm scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-project-"));
    writeFileSync(join(dir, "settings.gradle.kts"), "");
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { build: "vite build", "start:dev": "nest start --watch", lint: "eslint .", custom: "node tool.js" },
    }));

    expect(detectProjectCapabilities(dir)).toEqual({
      hasGradle: true,
      npmScripts: ["start:dev", "build", "lint", "custom"],
    });
  });

  it("orders common npm scripts first", () => {
    expect(orderedNpmScripts(["custom", "build", "start:dev", "dev", "test"])).toEqual([
      "start:dev",
      "dev",
      "test",
      "build",
      "custom",
    ]);
  });

  it("orders npm scripts with project-specific preference first", () => {
    expect(orderedNpmScripts(["build", "start:dev", "lint", "dev"], ["dev", "build"])).toEqual([
      "dev",
      "build",
      "lint",
      "start:dev",
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-config.test.ts tests/project-detector.test.ts
```

Expected: FAIL because `npmOrder` and configurable `orderedNpmScripts` are not implemented.

- [ ] **Step 4: Extend launcher types**

Update `streamdeck-plugin/src/launcher-types.ts`:

```ts
export interface LauncherProject {
  name: string;
  path: string;
  gradleCommand: string;
  favorites: string[];
  npmOrder: string[];
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

export interface LauncherProjectPreferences {
  favorites: string[];
  npmOrder: string[];
}

export interface LauncherEditorProject {
  name: string;
  path: string;
  favorites: string[];
  npmOrder: string[];
  detectedGradleTasks: string[];
  detectedNpmScripts: string[];
}

export interface LauncherEditorSnapshot {
  selectedPath: string | null;
  projects: LauncherEditorProject[];
  status: string | null;
  error: string | null;
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
```

- [ ] **Step 5: Implement configurable npm ordering**

Update `streamdeck-plugin/src/project-detector.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

export interface ProjectCapabilities {
  hasGradle: boolean;
  npmScripts: string[];
}

export const DEFAULT_NPM_ORDER = ["start:dev", "dev", "start", "test", "build", "lint"];

function fileExists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

export function orderedNpmScripts(scripts: string[], preferredOrder: string[] = DEFAULT_NPM_ORDER): string[] {
  const unique = [...new Set(scripts.filter((script) => script.trim()).map((script) => script.trim()))];
  const preferred = preferredOrder.filter((script) => unique.includes(script));
  const rest = unique.filter((script) => !preferred.includes(script)).sort((a, b) => a.localeCompare(b));
  return [...preferred, ...rest];
}

export function detectProjectCapabilities(projectPath: string): ProjectCapabilities {
  const hasGradle = [
    "gradlew",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
  ].some((file) => fileExists(path.join(projectPath, file)));

  let npmScripts: string[] = [];
  const packageJsonPath = path.join(projectPath, "package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: unknown };
    if (parsed.scripts && typeof parsed.scripts === "object") {
      npmScripts = orderedNpmScripts(
        Object.entries(parsed.scripts)
          .filter(([, value]) => typeof value === "string")
          .map(([key]) => key),
      );
    }
  } catch {
    npmScripts = [];
  }

  return { hasGradle, npmScripts };
}
```

- [ ] **Step 6: Implement `npmOrder` config parsing**

Update `streamdeck-plugin/src/launcher-config.ts`:

```ts
import { DEFAULT_NPM_ORDER } from "./project-detector.js";
import type { LauncherConfig, LauncherProject } from "./launcher-types.js";
import { requireAbsoluteProjectPath } from "./launcher-paths.js";

export { DEFAULT_NPM_ORDER } from "./project-detector.js";

const TASK_RE = /^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;
const NPM_SCRIPT_RE = /^[A-Za-z0-9_:@./-]+$/;
const PLAIN_COMMAND_RE = /^[A-Za-z0-9_.-]+$/;
const ABSOLUTE_COMMAND_RE = /^\/[A-Za-z0-9_./-]+$/;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseFavorites(value: unknown): string[] {
  const favorites = Array.isArray(value) ? uniqueStrings(value.map((v) => asString(v, "favorite"))) : [];
  for (const task of favorites) {
    if (!TASK_RE.test(task)) throw new Error(`Gradle task is invalid: ${task}`);
  }
  return favorites;
}

function parseNpmOrder(value: unknown): string[] {
  const scripts = value === undefined
    ? DEFAULT_NPM_ORDER
    : Array.isArray(value)
      ? uniqueStrings(value.map((v) => asString(v, "npm script")))
      : (() => { throw new Error("npmOrder must be an array"); })();
  for (const script of scripts) {
    if (!NPM_SCRIPT_RE.test(script)) throw new Error(`npm script is invalid: ${script}`);
  }
  return scripts;
}

function parseProject(raw: unknown): LauncherProject {
  if (!raw || typeof raw !== "object") throw new Error("project must be an object");
  const obj = raw as Record<string, unknown>;
  return {
    name: asString(obj.name, "name"),
    path: requireAbsoluteProjectPath(asString(obj.path, "path")),
    gradleCommand: parseGradleCommand(obj.gradleCommand),
    favorites: parseFavorites(obj.favorites),
    npmOrder: parseNpmOrder(obj.npmOrder),
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
```

- [ ] **Step 7: Update TypeScript fixtures**

Update existing `LauncherConfig` object literals in tests and source compile errors by adding `npmOrder`.

Example for `streamdeck-plugin/tests/launcher-state.test.ts`:

```ts
const config: LauncherConfig = {
  projects: [
    {
      name: "API",
      path: "/repo/api",
      gradleCommand: "./gradlew",
      favorites: ["bootRun", "test"],
      npmOrder: ["start:dev", "dev", "start", "test", "build", "lint"],
    },
    {
      name: "Admin",
      path: "/repo/admin",
      gradleCommand: "./gradlew",
      favorites: [],
      npmOrder: ["start:dev", "dev", "start", "test", "build", "lint"],
    },
  ],
};
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-config.test.ts tests/project-detector.test.ts tests/launcher-state.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add streamdeck-plugin/src/launcher-types.ts streamdeck-plugin/src/launcher-config.ts streamdeck-plugin/src/project-detector.ts streamdeck-plugin/tests/launcher-config.test.ts streamdeck-plugin/tests/project-detector.test.ts streamdeck-plugin/tests/launcher-state.test.ts
git commit -m "feat(launcher): configure npm script ordering"
```

---

### Task 2: Launcher State Editor Snapshots

**Files:**
- Modify: `streamdeck-plugin/src/launcher-state.ts`
- Test: `streamdeck-plugin/tests/launcher-state.test.ts`

- [ ] **Step 1: Add failing state tests**

Append these tests to `streamdeck-plugin/tests/launcher-state.test.ts`:

```ts
it("orders npm commands with the configured project npmOrder", () => {
  const state = new LauncherState({
    projects: [{
      name: "Front",
      path: "/repo/front",
      gradleCommand: "./gradlew",
      favorites: [],
      npmOrder: ["dev", "build"],
    }],
  });
  state.applyProjectCapabilities("/repo/front", {
    hasGradle: false,
    npmScripts: ["build", "start:dev", "lint", "dev"],
  });
  state.openProject("/repo/front");

  const commands = state.slots().filter((slot) => slot.kind === "command");

  expect(commands.map((slot) => slot.label)).toEqual(["dev", "build", "lint", "start:dev"]);
});

it("exposes configured projects for the launcher editor", () => {
  const state = new LauncherState(config);
  state.applyProjectTasks("/repo/api", ["bootRun", "classes"]);
  state.applyProjectCapabilities("/repo/api", { hasGradle: true, npmScripts: ["build", "start:dev"] });

  expect(state.editorSnapshot("/repo/api")).toEqual({
    selectedPath: "/repo/api",
    status: null,
    error: null,
    projects: [
      {
        name: "API",
        path: "/repo/api",
        favorites: ["bootRun", "test"],
        npmOrder: ["start:dev", "dev", "start", "test", "build", "lint"],
        detectedGradleTasks: ["bootRun", "classes"],
        detectedNpmScripts: ["build", "start:dev"],
      },
      {
        name: "Admin",
        path: "/repo/admin",
        favorites: [],
        npmOrder: ["start:dev", "dev", "start", "test", "build", "lint"],
        detectedGradleTasks: [],
        detectedNpmScripts: [],
      },
    ],
  });
});

it("keeps editor snapshots read-only", () => {
  const state = new LauncherState(config);
  const snapshot = state.editorSnapshot("/repo/api");
  snapshot.projects[0].favorites.push("mutated");

  expect(state.editorSnapshot("/repo/api").projects[0].favorites).toEqual(["bootRun", "test"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-state.test.ts
```

Expected: FAIL because `editorSnapshot` does not exist and npm order is not applied per project.

- [ ] **Step 3: Implement editor snapshots and per-project npm ordering**

Update `streamdeck-plugin/src/launcher-state.ts`:

```ts
import type {
  IntelliJProject,
  LauncherCommand,
  LauncherConfig,
  LauncherEditorSnapshot,
  LauncherPage,
  LauncherProject,
  LauncherSlot,
  ProjectCapabilities,
} from "./launcher-types.js";
import { normalizeProjectPath } from "./launcher-paths.js";
import { DEFAULT_NPM_ORDER, orderedNpmScripts } from "./project-detector.js";

const DEFAULT_TASKS = ["bootRun", "test", "build", "clean"];
const SLOT_COUNT = 15;

export class LauncherState {
  private page: LauncherPage = { kind: "home" };
  private openPaths = new Set<string>();
  private openProjects = new Map<string, IntelliJProject>();
  private detectedTasks = new Map<string, string[]>();
  private capabilities = new Map<string, ProjectCapabilities>();
  private configError: string | null = null;
  private config: LauncherConfig;

  constructor(config: LauncherConfig) {
    this.config = this.normalizedConfig(config);
  }

  currentPage(): LauncherPage { return this.page; }

  editorSnapshot(selectedPath?: string, status: string | null = null, error: string | null = null): LauncherEditorSnapshot {
    const projects = this.config.projects.map((project) => ({
      name: project.name,
      path: project.path,
      favorites: [...project.favorites],
      npmOrder: [...project.npmOrder],
      detectedGradleTasks: [...(this.detectedTasks.get(project.path) ?? [])],
      detectedNpmScripts: [...(this.capabilities.get(project.path)?.npmScripts ?? [])],
    }));
    const selected = normalizeOptionalPath(selectedPath);
    return {
      selectedPath: projects.some((project) => project.path === selected)
        ? selected
        : projects[0]?.path ?? null,
      projects,
      status,
      error: error ?? this.configError,
    };
  }

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
    this.openProjects = new Map(projects.map((project) => {
      const normalizedPath = normalizeProjectPath(project.path);
      return [normalizedPath, { ...project, path: normalizedPath, basePath: normalizeProjectPath(project.basePath) }];
    }));
    this.openPaths = new Set(this.openProjects.keys());
  }

  applyProjectTasks(path: string, tasks: string[]): void {
    const normalizedPath = normalizeProjectPath(path);
    const uniqueTasks = [...new Set(tasks.map((task) => task.trim()).filter(Boolean))];
    this.detectedTasks.set(normalizedPath, uniqueTasks);
  }

  applyProjectCapabilities(path: string, capabilities: ProjectCapabilities): void {
    this.capabilities.set(normalizeProjectPath(path), {
      hasGradle: capabilities.hasGradle,
      npmScripts: [...new Set(capabilities.npmScripts.map((script) => script.trim()).filter(Boolean))],
    });
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
    const projects = this.homeProjects().slice(0, SLOT_COUNT - 1).map((project) => ({
      kind: "project" as const,
      label: project.name,
      path: project.path,
      status: this.openPaths.has(project.path) ? "OPEN" as const : "iTerm" as const,
    }));
    return [...projects, { kind: "control", action: "refresh", label: "Refresh" }];
  }

  private homeProjects(): LauncherProject[] {
    const byPath = new Map<string, LauncherProject>();
    for (const project of this.config.projects) {
      byPath.set(project.path, project);
    }
    for (const project of this.openProjects.values()) {
      if (byPath.has(project.path)) continue;
      byPath.set(project.path, {
        name: project.name,
        path: project.path,
        gradleCommand: "./gradlew",
        favorites: [],
        npmOrder: DEFAULT_NPM_ORDER,
      });
    }
    return [...byPath.values()];
  }

  private projectSlots(path: string): LauncherSlot[] {
    const project = this.projectFor(path);
    if (!project) return [{ kind: "control", action: "back", label: "Back" }];
    const status = this.openPaths.has(project.path) ? "OPEN" as const : "iTerm" as const;
    const commands = this.commandsForProject(project, status).slice(0, SLOT_COUNT - 2);
    return [
      { kind: "control", action: "back", label: "Back" },
      ...commands.map((command) => ({ kind: "command" as const, label: this.commandLabel(command), command, status })),
      { kind: "control", action: "refresh", label: "Refresh" },
    ];
  }

  private commandsForProject(project: LauncherProject, status: "OPEN" | "iTerm"): LauncherCommand[] {
    const capabilities = this.capabilities.get(project.path);
    const commands: LauncherCommand[] = [];
    const hasGradle = capabilities ? capabilities.hasGradle : true;
    if (hasGradle) {
      commands.push(...this.tasksForProject(project).map((task) => ({
        kind: "gradle" as const,
        projectPath: project.path,
        task,
        gradleCommand: project.gradleCommand,
        status,
      })));
    }
    commands.push(...orderedNpmScripts(capabilities?.npmScripts ?? [], project.npmOrder).map((script) => ({
      kind: "npm" as const,
      projectPath: project.path,
      script,
      status,
    })));
    return commands;
  }

  private commandLabel(command: LauncherCommand): string {
    if (command.kind === "gradle") return command.task;
    const capabilities = this.capabilities.get(command.projectPath);
    return capabilities?.hasGradle ? `npm ${command.script}` : command.script;
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
    return this.homeProjects().find((project) => project.path === normalizedPath);
  }

  private normalizedConfig(config: LauncherConfig): LauncherConfig {
    return {
      projects: config.projects.map((project) => ({
        ...project,
        path: normalizeProjectPath(project.path),
        favorites: [...project.favorites],
        npmOrder: [...project.npmOrder],
      })),
    };
  }
}

function normalizeOptionalPath(path: string | undefined): string | null {
  if (!path || !path.trim()) return null;
  return normalizeProjectPath(path);
}
```

- [ ] **Step 4: Run targeted state tests**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/launcher-state.ts streamdeck-plugin/tests/launcher-state.test.ts
git commit -m "feat(launcher): expose editor state snapshots"
```

---

### Task 3: Config Store For Saving Preferences

**Files:**
- Create: `streamdeck-plugin/src/launcher-config-store.ts`
- Test: `streamdeck-plugin/tests/launcher-config-store.test.ts`

- [ ] **Step 1: Write failing config store tests**

Create `streamdeck-plugin/tests/launcher-config-store.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileLauncherConfigStore } from "../src/launcher-config-store.js";

describe("FileLauncherConfigStore", () => {
  it("loads missing config as empty config", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const store = new FileLauncherConfigStore(join(dir, "missing", "launcher.json"));

    expect(store.load()).toEqual({ config: { projects: [] }, error: null });
  });

  it("saves preferences for the selected project only", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "app", "launcher.json");
    const store = new FileLauncherConfigStore(file);
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(file, JSON.stringify({
      projects: [
        { name: "API", path: "/repo/api", favorites: ["bootRun"], npmOrder: ["start:dev"] },
        { name: "Admin", path: "/repo/admin", favorites: ["test"], npmOrder: ["dev"] },
      ],
    }), { encoding: "utf8", flag: "wx" });

    const result = store.saveProjectPreferences("/repo/api", {
      favorites: ["build", "build", "test"],
      npmOrder: ["dev", "build", "dev"],
    });

    expect(result.error).toBeNull();
    expect(result.config.projects[0]).toMatchObject({
      name: "API",
      path: "/repo/api",
      favorites: ["build", "test"],
      npmOrder: ["dev", "build"],
    });
    expect(result.config.projects[1]).toMatchObject({
      name: "Admin",
      path: "/repo/admin",
      favorites: ["test"],
      npmOrder: ["dev"],
    });

    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written.projects[0].favorites).toEqual(["build", "test"]);
    expect(written.projects[0].npmOrder).toEqual(["dev", "build"]);
  });

  it("returns an error and leaves the file unchanged for unknown projects", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = JSON.stringify({ projects: [{ name: "API", path: "/repo/api" }] });
    writeFileSync(file, original);
    const store = new FileLauncherConfigStore(file);

    const result = store.saveProjectPreferences("/repo/missing", {
      favorites: ["bootRun"],
      npmOrder: ["dev"],
    });

    expect(result.error).toContain("Project is not configured");
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("returns an error and leaves the file unchanged for invalid preferences", () => {
    const dir = mkdtempSync(join(tmpdir(), "launcher-store-"));
    const file = join(dir, "launcher.json");
    const original = JSON.stringify({ projects: [{ name: "API", path: "/repo/api" }] });
    writeFileSync(file, original);
    const store = new FileLauncherConfigStore(file);

    const result = store.saveProjectPreferences("/repo/api", {
      favorites: ["bootRun --scan"],
      npmOrder: ["dev"],
    });

    expect(result.error).toContain("Gradle task");
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-config-store.test.ts
```

Expected: FAIL because `launcher-config-store.ts` does not exist.

- [ ] **Step 3: Implement config store**

Create `streamdeck-plugin/src/launcher-config-store.ts`:

```ts
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
```

- [ ] **Step 4: Run config store tests**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-config-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/launcher-config-store.ts streamdeck-plugin/tests/launcher-config-store.test.ts
git commit -m "feat(launcher): persist editor preferences"
```

---

### Task 4: Property Inspector Message Contract

**Files:**
- Create: `streamdeck-plugin/src/launcher-editor.ts`
- Test: `streamdeck-plugin/tests/launcher-editor.test.ts`

- [ ] **Step 1: Write failing message parser tests**

Create `streamdeck-plugin/tests/launcher-editor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLauncherEditorRequest } from "../src/launcher-editor.js";

describe("parseLauncherEditorRequest", () => {
  it("parses ready requests", () => {
    expect(parseLauncherEditorRequest({ type: "launcherEditorReady" })).toEqual({
      type: "launcherEditorReady",
    });
  });

  it("parses refresh requests with optional project path", () => {
    expect(parseLauncherEditorRequest({
      type: "launcherEditorRefresh",
      projectPath: "/repo/api",
    })).toEqual({
      type: "launcherEditorRefresh",
      projectPath: "/repo/api",
    });
  });

  it("parses save requests and trims arrays", () => {
    expect(parseLauncherEditorRequest({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: [" bootRun ", "", "test"],
      npmOrder: [" dev ", "build"],
    })).toEqual({
      type: "saveProjectPreferences",
      projectPath: "/repo/api",
      favorites: ["bootRun", "test"],
      npmOrder: ["dev", "build"],
    });
  });

  it("returns null for malformed payloads", () => {
    expect(parseLauncherEditorRequest(null)).toBeNull();
    expect(parseLauncherEditorRequest({ type: "saveProjectPreferences", projectPath: "/repo/api" })).toBeNull();
    expect(parseLauncherEditorRequest({ type: "unknown" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run parser test to verify it fails**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-editor.test.ts
```

Expected: FAIL because `launcher-editor.ts` does not exist.

- [ ] **Step 3: Implement message parser**

Create `streamdeck-plugin/src/launcher-editor.ts`:

```ts
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
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-editor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/launcher-editor.ts streamdeck-plugin/tests/launcher-editor.test.ts
git commit -m "feat(launcher): define editor message contract"
```

---

### Task 5: Wire Editor Messages Into The Plugin

**Files:**
- Modify: `streamdeck-plugin/src/launcher-action.ts`
- Modify: `streamdeck-plugin/src/plugin.ts`
- Test: run existing launcher routing, state, config store, and TypeScript build.

- [ ] **Step 1: Add editor dependencies to `LauncherAction`**

Update imports and dependencies in `streamdeck-plugin/src/launcher-action.ts`:

```ts
import {
  action, SingletonAction,
  type KeyAction, type KeyDownEvent, type PropertyInspectorDidAppearEvent, type SendToPluginEvent, type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { runLauncherCommand, type BridgeRunClient, type IntelliJRunClient } from "./gradle-bridge-client.js";
import { parseLauncherEditorRequest, type LauncherEditorResponse } from "./launcher-editor.js";
import { launcherCommandErrorMessage } from "./launcher-error.js";
import { launcherImageDataUri } from "./launcher-image.js";
import { LauncherState } from "./launcher-state.js";
import type { LauncherProjectPreferences, LauncherSlot } from "./launcher-types.js";
```

Replace `LauncherDeps` with:

```ts
interface LauncherDeps {
  intellij: IntelliJRunClient;
  bridge: BridgeRunClient;
  refresh: () => Promise<void>;
  saveProjectPreferences?: (projectPath: string, preferences: LauncherProjectPreferences) => Promise<{ error: string | null }>;
  sendToPropertyInspector?: (payload: JsonValue) => Promise<void>;
  log?: (message: string) => void;
}
```

- [ ] **Step 2: Handle Property Inspector lifecycle and messages**

Add these methods to `LauncherAction`:

```ts
  override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<LauncherSettings>): Promise<void> {
    const settings = await ev.action.getSettings<LauncherSettings>();
    await this.sendEditorSnapshot(settings.projectPath);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LauncherSettings>): Promise<void> {
    const request = parseLauncherEditorRequest(ev.payload);
    if (!request) {
      await this.sendEditorError("Invalid launcher editor request");
      return;
    }

    if (request.type === "launcherEditorReady") {
      const settings = await ev.action.getSettings<LauncherSettings>();
      await this.sendEditorSnapshot(settings.projectPath);
      return;
    }

    if (request.type === "launcherEditorRefresh") {
      await this.deps.refresh();
      await this.sendEditorSnapshot(request.projectPath, "Refreshed");
      return;
    }

    if (!this.deps.saveProjectPreferences) {
      await this.sendEditorError("Launcher editor is not configured");
      return;
    }

    const result = await this.deps.saveProjectPreferences(request.projectPath, {
      favorites: request.favorites,
      npmOrder: request.npmOrder,
    });
    if (result.error) {
      await this.sendEditorSnapshot(request.projectPath, null, result.error);
      return;
    }

    await ev.action.setSettings({ ...(await ev.action.getSettings<LauncherSettings>()), projectPath: request.projectPath });
    await this.deps.refresh();
    await this.sendEditorSnapshot(request.projectPath, "Saved");
  }

  private async sendEditorSnapshot(selectedPath?: string, status: string | null = null, error: string | null = null): Promise<void> {
    await this.sendToPropertyInspector({
      type: "launcherEditorSnapshot",
      ...this.state.editorSnapshot(selectedPath, status, error),
    });
  }

  private async sendEditorError(error: string): Promise<void> {
    await this.sendToPropertyInspector({ type: "launcherEditorError", error });
  }

  private async sendToPropertyInspector(payload: LauncherEditorResponse): Promise<void> {
    if (!this.deps.sendToPropertyInspector) return;
    await this.deps.sendToPropertyInspector(payload);
  }
```

Update `LauncherSettings` to remember the last editor project:

```ts
interface LauncherSettings {
  slot?: number;
  projectPath?: string;
  [key: string]: JsonValue;
}
```

- [ ] **Step 3: Move config loading into the config store**

Update `streamdeck-plugin/src/plugin.ts` imports:

```ts
import { FileLauncherConfigStore } from "./launcher-config-store.js";
```

Remove local `launcherConfigPath`, `emptyLauncherConfig`, `loadLauncherConfig`, and `LauncherConfigLoad` definitions from `plugin.ts`.

Add:

```ts
const launcherConfigStore = new FileLauncherConfigStore();
const initialLauncherConfig = launcherConfigStore.load();
```

Update `refreshLauncher`:

```ts
async function refreshLauncher(): Promise<void> {
  const configLoad = launcherConfigStore.load();
  launcherState.applyConfig(configLoad.config);
  launcherState.setConfigError(configLoad.error);
  if (configLoad.error) streamDeck.logger.error(`Launcher config load failed: ${configLoad.error}`);
  const projects = await intellijClient.projects();
  launcherState.applyIntelliJProjects(projects);
  for (const project of projects) {
    launcherState.applyProjectCapabilities(project.path, detectProjectCapabilities(project.path));
  }
  for (const project of configLoad.config.projects) {
    launcherState.applyProjectCapabilities(project.path, detectProjectCapabilities(project.path));
  }
  const page = launcherState.currentPage();
  if (!configLoad.error && page.kind === "project") {
    launcherState.applyProjectTasks(page.path, await intellijClient.tasks(page.path));
  }
  await launcherAction.refreshAll();
}
```

Pass editor dependencies into `LauncherAction`:

```ts
const launcherAction = new LauncherAction(launcherState, {
  intellij: intellijClient,
  bridge: gradleBridgeClient,
  refresh: refreshLauncher,
  saveProjectPreferences: async (projectPath, preferences) => {
    const result = launcherConfigStore.saveProjectPreferences(projectPath, preferences);
    launcherState.applyConfig(result.config);
    launcherState.setConfigError(result.error);
    if (result.error) streamDeck.logger.error(result.error);
    return { error: result.error };
  },
  sendToPropertyInspector: (payload) => streamDeck.ui.sendToPropertyInspector(payload),
  log: (m) => streamDeck.logger.error(m),
});
```

- [ ] **Step 4: Run TypeScript tests and build**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/launcher-routing.test.ts tests/launcher-state.test.ts tests/launcher-config-store.test.ts tests/launcher-editor.test.ts
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/launcher-action.ts streamdeck-plugin/src/plugin.ts
git commit -m "feat(launcher): wire preferences editor messages"
```

---

### Task 6: Property Inspector UI, Manifest, And Docs

**Files:**
- Create: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/ui/launcher.html`
- Modify: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`
- Modify: `streamdeck-plugin/tests/manifest.test.ts`
- Modify: `SETUP.md`

- [ ] **Step 1: Add failing manifest tests**

Update `readManifest` type in `streamdeck-plugin/tests/manifest.test.ts`:

```ts
function readManifest(): {
  Actions: Array<{ UUID: string; Name: string; PropertyInspectorPath?: string }>;
  Profiles: Array<{ Name: string }>;
} {
  return JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
}
```

Update `declares Dev Launcher profile and launcher tile action`:

```ts
it("declares Dev Launcher profile and launcher tile action", () => {
  const manifest = readManifest();
  const launcher = manifest.Actions.find((action) => action.UUID === LAUNCHER_UUID);
  expect(launcher?.Name).toBe("Project Launcher Tile");
  expect(launcher?.PropertyInspectorPath).toBe("ui/launcher.html");
  expect(existsSync(join(pluginDir, "ui", "launcher.html"))).toBe(true);
  expect(manifest.Profiles.some((profile) => profile.Name === "Dev Launcher")).toBe(true);
});
```

- [ ] **Step 2: Run manifest test to verify it fails**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/manifest.test.ts
```

Expected: FAIL because launcher action has no `PropertyInspectorPath` and `ui/launcher.html` does not exist.

- [ ] **Step 3: Add launcher Property Inspector HTML**

Create `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/ui/launcher.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
    }
    body {
      margin: 0;
      padding: 12px;
      color: #f4f4f5;
      background: #1f2933;
    }
    label {
      display: block;
      margin: 10px 0 4px;
      color: #cbd5e1;
      font-size: 11px;
    }
    select,
    textarea,
    input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 7px;
      color: #f8fafc;
      background: #111827;
      font: inherit;
    }
    textarea {
      min-height: 88px;
      resize: vertical;
      line-height: 1.35;
    }
    input[readonly] {
      color: #cbd5e1;
      background: #17202c;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      flex: 1;
      border: 1px solid #64748b;
      border-radius: 6px;
      padding: 8px;
      color: #f8fafc;
      background: #334155;
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      border-color: #0f766e;
      background: #0f766e;
    }
    button:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .status {
      min-height: 18px;
      margin-top: 10px;
      color: #a7f3d0;
      white-space: pre-wrap;
    }
    .status.error {
      color: #fecaca;
    }
    .hint {
      margin-top: 4px;
      color: #94a3b8;
      font-size: 11px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <label for="project">Project</label>
  <select id="project"></select>

  <label for="path">Path</label>
  <input id="path" readonly />

  <label for="favorites">Gradle favorites</label>
  <textarea id="favorites" spellcheck="false"></textarea>
  <div class="hint" id="gradleHint"></div>

  <label for="npmOrder">npm order</label>
  <textarea id="npmOrder" spellcheck="false"></textarea>
  <div class="hint" id="npmHint"></div>

  <div class="actions">
    <button id="refresh" type="button">Refresh</button>
    <button id="save" class="primary" type="button">Save</button>
  </div>

  <div id="status" class="status"></div>

  <script>
    let websocket = null;
    let uuid = null;
    let actionInfo = null;
    let snapshot = { selectedPath: null, projects: [], status: null, error: null };

    const projectSelect = document.getElementById("project");
    const pathInput = document.getElementById("path");
    const favoritesInput = document.getElementById("favorites");
    const npmOrderInput = document.getElementById("npmOrder");
    const gradleHint = document.getElementById("gradleHint");
    const npmHint = document.getElementById("npmHint");
    const statusEl = document.getElementById("status");
    const refreshButton = document.getElementById("refresh");
    const saveButton = document.getElementById("save");

    function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
      uuid = inUUID;
      actionInfo = JSON.parse(inActionInfo);
      websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);
      websocket.onopen = () => {
        websocket.send(JSON.stringify({ event: inRegisterEvent, uuid }));
        sendToPlugin({ type: "launcherEditorReady" });
      };
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.event === "sendToPropertyInspector") renderMessage(message.payload);
      };
    }

    function sendToPlugin(payload) {
      if (!websocket || websocket.readyState !== WebSocket.OPEN || !actionInfo) return;
      websocket.send(JSON.stringify({
        action: actionInfo.action,
        event: "sendToPlugin",
        context: uuid,
        payload,
      }));
    }

    function renderMessage(message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "launcherEditorError") {
        setStatus(message.error || "Unknown launcher editor error", true);
        return;
      }
      if (message.type !== "launcherEditorSnapshot") return;
      snapshot = message;
      renderSnapshot();
    }

    function renderSnapshot() {
      projectSelect.innerHTML = "";
      for (const project of snapshot.projects) {
        const option = document.createElement("option");
        option.value = project.path;
        option.textContent = project.name;
        projectSelect.appendChild(option);
      }
      projectSelect.value = snapshot.selectedPath || snapshot.projects[0]?.path || "";
      renderSelectedProject();
      setStatus(snapshot.error || snapshot.status || "", Boolean(snapshot.error));
      const disabled = snapshot.projects.length === 0;
      projectSelect.disabled = disabled;
      favoritesInput.disabled = disabled;
      npmOrderInput.disabled = disabled;
      saveButton.disabled = disabled;
    }

    function renderSelectedProject() {
      const project = selectedProject();
      pathInput.value = project?.path || "";
      favoritesInput.value = (project?.favorites || []).join("\n");
      npmOrderInput.value = (project?.npmOrder || []).join("\n");
      gradleHint.textContent = hint("Detected Gradle", project?.detectedGradleTasks || []);
      npmHint.textContent = hint("Detected npm", project?.detectedNpmScripts || []);
    }

    function selectedProject() {
      return snapshot.projects.find((project) => project.path === projectSelect.value) || snapshot.projects[0] || null;
    }

    function hint(label, values) {
      if (!values.length) return `${label}: none detected`;
      return `${label}: ${values.slice(0, 8).join(", ")}${values.length > 8 ? " ..." : ""}`;
    }

    function lines(value) {
      return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }

    function setStatus(message, isError) {
      statusEl.textContent = message;
      statusEl.classList.toggle("error", isError);
    }

    projectSelect.addEventListener("change", renderSelectedProject);

    refreshButton.addEventListener("click", () => {
      sendToPlugin({ type: "launcherEditorRefresh", projectPath: projectSelect.value || undefined });
    });

    saveButton.addEventListener("click", () => {
      const project = selectedProject();
      if (!project) return;
      sendToPlugin({
        type: "saveProjectPreferences",
        projectPath: project.path,
        favorites: lines(favoritesInput.value),
        npmOrder: lines(npmOrderInput.value),
      });
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Attach Property Inspector to launcher manifest**

Update the launcher action in `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`:

```json
{
  "Name": "Project Launcher Tile",
  "UUID": "com.shinsanghoon.claude-bridge.launcher",
  "Icon": "imgs/actions/logo/icon",
  "Tooltip": "프로젝트/Gradle 런처 타일",
  "Controllers": ["Keypad"],
  "States": [{ "Image": "imgs/actions/logo/key" }],
  "PropertyInspectorPath": "ui/launcher.html"
}
```

- [ ] **Step 5: Document editor usage and `npmOrder`**

Update `SETUP.md` launcher config section so the example includes:

```json
"npmOrder": ["start:dev", "dev", "start", "test", "build", "lint"]
```

Add a short note:

```md
In the Stream Deck app, select any `Project Launcher Tile` in the `Dev Launcher`
profile to edit Gradle favorites and npm order from the Property Inspector.
The editor writes the same `launcher.json` file.
```

- [ ] **Step 6: Run manifest test**

Run:

```bash
cd streamdeck-plugin
npm test -- tests/manifest.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/ui/launcher.html streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json streamdeck-plugin/tests/manifest.test.ts SETUP.md
git commit -m "feat(launcher): add preferences property inspector"
```

---

### Task 7: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full Stream Deck plugin tests**

Run:

```bash
cd streamdeck-plugin
npm test
```

Expected: all vitest tests PASS.

- [ ] **Step 2: Build the Stream Deck plugin**

Run:

```bash
cd streamdeck-plugin
npm run build
```

Expected: build exits 0 and writes `com.shinsanghoon.claude-bridge.sdPlugin/bin/plugin.js`.

- [ ] **Step 3: Inspect working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended launcher editor files are modified, plus pre-existing untracked `.codex/` and `.serena/` files if they are still present.

- [ ] **Step 4: Manual verification after plugin reload**

1. Build/install or reload the Stream Deck plugin using the repository's normal local workflow.
2. Open the Stream Deck app.
3. Select a `Project Launcher Tile` in the `Dev Launcher` profile.
4. Confirm `launcher.html` appears in the Property Inspector.
5. Select a configured project.
6. Change `Gradle favorites`, save, and confirm the launcher detail page order changes.
7. Change `npm order`, save, and confirm npm scripts reorder.
8. Enter `bootRun --scan`, save, and confirm the UI shows a validation error and `launcher.json` remains valid.

- [ ] **Step 5: Report verification result**

Record which automated checks passed, whether manual Stream Deck verification was completed, and any remaining risk.
