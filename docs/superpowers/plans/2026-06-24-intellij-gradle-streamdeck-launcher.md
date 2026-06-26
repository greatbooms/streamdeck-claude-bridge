# IntelliJ Gradle Stream Deck Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Stream Deck developer launcher that shows configured IntelliJ/Gradle projects, runs favorite Gradle tasks through IntelliJ when the project is open, and falls back to iTerm when it is not.

**Architecture:** Add a small iTerm Gradle handoff endpoint to the existing Python bridge, add a page-managed launcher UI to the Stream Deck plugin, and add a separate IntelliJ companion plugin exposing open-project/task/run APIs on localhost. Keep launcher state separate from Claude/Codex prompt state so the existing prompt profiles still interrupt and return cleanly.

**Tech Stack:** Python aiohttp + pytest, TypeScript + `@elgato/streamdeck` + vitest, Kotlin IntelliJ Platform Gradle Plugin 2.x.

---

## Scope Split

This spec spans three subsystems. Implement in this order so each subsystem can be validated independently:

1. Bridge iTerm fallback endpoint.
2. Stream Deck launcher UI and routing, tested with fake IntelliJ/bridge clients.
3. IntelliJ companion plugin APIs.
4. End-to-end wiring and manual verification.

## File Structure

Bridge:

- Create `bridge/gradle_runner.py`: validates Gradle launcher requests, builds safe visible shell commands, and defines an injectable iTerm runner.
- Modify `bridge/server.py`: registers `/run/gradle/iterm`.
- Test `tests/test_gradle_runner.py`: pure validation and command construction.
- Test `tests/test_gradle_api.py`: aiohttp endpoint behavior with fake runner.

Stream Deck:

- Create `streamdeck-plugin/src/launcher-types.ts`: shared launcher domain types.
- Create `streamdeck-plugin/src/launcher-config.ts`: config parsing and defaulting.
- Create `streamdeck-plugin/src/launcher-state.ts`: home/detail page reducer and slot model.
- Create `streamdeck-plugin/src/intellij-client.ts`: HTTP client for the IntelliJ companion plugin.
- Create `streamdeck-plugin/src/gradle-bridge-client.ts`: HTTP client for bridge iTerm fallback.
- Create `streamdeck-plugin/src/launcher-image.ts`: Stream Deck tile image renderer.
- Create `streamdeck-plugin/src/launcher-action.ts`: singleton 15-slot action.
- Create `streamdeck-plugin/scripts/make-dev-launcher-profile.py`: generates the 15-slot bundled launcher profile.
- Modify `streamdeck-plugin/src/plugin.ts`: instantiate and register launcher services/actions.
- Modify `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`: add launcher action and `Dev Launcher` profile.
- Test `streamdeck-plugin/tests/launcher-config.test.ts`.
- Test `streamdeck-plugin/tests/launcher-state.test.ts`.
- Test `streamdeck-plugin/tests/intellij-client.test.ts`.
- Test `streamdeck-plugin/tests/launcher-routing.test.ts`.
- Test `streamdeck-plugin/tests/manifest.test.ts`.

IntelliJ:

- Create `intellij-plugin/settings.gradle.kts`.
- Create `intellij-plugin/build.gradle.kts`.
- Create `intellij-plugin/src/main/resources/META-INF/plugin.xml`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeStartupActivity.kt`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/Json.kt`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/ProjectRegistry.kt`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetector.kt`.
- Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskRunner.kt`.
- Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/ProjectRegistryTest.kt`.
- Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetectorTest.kt`.
- Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/JsonTest.kt`.

Docs:

- Modify `SETUP.md`: add launcher, IntelliJ plugin, and config setup steps.

---

### Task 1: Bridge Gradle Request Validation

**Files:**
- Create: `bridge/gradle_runner.py`
- Test: `tests/test_gradle_runner.py`

- [ ] **Step 1: Write failing tests for safe request parsing**

Create `tests/test_gradle_runner.py`:

```python
import pytest

from bridge.gradle_runner import (
    GradleRunRequest,
    GradleRequestError,
    build_visible_command,
    parse_gradle_run_request,
)


def test_parse_valid_request_defaults_gradle_command(tmp_path):
    project = tmp_path / "api"
    project.mkdir()
    req = parse_gradle_run_request({"cwd": str(project), "task": "bootRun"})
    assert req == GradleRunRequest(cwd=project, gradle_command="./gradlew", task="bootRun")


def test_parse_accepts_absolute_gradle_command(tmp_path):
    project = tmp_path / "api"
    project.mkdir()
    gradle = tmp_path / "gradlew"
    gradle.write_text("#!/bin/sh\n", encoding="utf-8")
    req = parse_gradle_run_request({
        "cwd": str(project),
        "gradleCommand": str(gradle),
        "task": ":api:bootRun",
    })
    assert req.gradle_command == str(gradle)
    assert req.task == ":api:bootRun"


@pytest.mark.parametrize("task", ["", "bootRun --scan", "bootRun; rm -rf /", "build && test"])
def test_rejects_unsafe_task(tmp_path, task):
    project = tmp_path / "api"
    project.mkdir()
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request({"cwd": str(project), "task": task})


@pytest.mark.parametrize("cmd", ["./gradlew --scan", "gradlew; whoami", "a/b", ""])
def test_rejects_unsafe_gradle_command(tmp_path, cmd):
    project = tmp_path / "api"
    project.mkdir()
    with pytest.raises(GradleRequestError):
        parse_gradle_run_request({"cwd": str(project), "gradleCommand": cmd, "task": "test"})


def test_rejects_missing_cwd(tmp_path):
    with pytest.raises(GradleRequestError, match="cwd does not exist"):
        parse_gradle_run_request({"cwd": str(tmp_path / "missing"), "task": "test"})


def test_build_visible_command_quotes_cwd(tmp_path):
    project = tmp_path / "space dir"
    project.mkdir()
    req = GradleRunRequest(cwd=project, gradle_command="./gradlew", task="bootRun")
    assert build_visible_command(req) == f"cd {str(project)!r} && ./gradlew bootRun"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
.venv/bin/python -m pytest tests/test_gradle_runner.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'bridge.gradle_runner'`.

- [ ] **Step 3: Implement `bridge/gradle_runner.py`**

Create `bridge/gradle_runner.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import shlex

TASK_RE = re.compile(r"^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$")
PLAIN_CMD_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class GradleRequestError(ValueError):
    pass


@dataclass(frozen=True)
class GradleRunRequest:
    cwd: Path
    gradle_command: str
    task: str


def _validate_task(task: object) -> str:
    if not isinstance(task, str) or not TASK_RE.fullmatch(task):
        raise GradleRequestError("task must be a Gradle task path")
    return task


def _validate_gradle_command(command: object) -> str:
    if command in (None, ""):
        return "./gradlew"
    if not isinstance(command, str):
        raise GradleRequestError("gradleCommand must be a string")
    if command == "./gradlew":
        return command
    if command.startswith("/"):
        if any(ch.isspace() for ch in command):
            raise GradleRequestError("gradleCommand must not contain whitespace")
        return command
    if PLAIN_CMD_RE.fullmatch(command):
        return command
    raise GradleRequestError("gradleCommand must be ./gradlew, an absolute path, or a plain executable name")


def parse_gradle_run_request(body: dict) -> GradleRunRequest:
    cwd_raw = body.get("cwd")
    if not isinstance(cwd_raw, str) or not cwd_raw:
        raise GradleRequestError("cwd is required")
    cwd = Path(cwd_raw).expanduser().resolve()
    if not cwd.exists() or not cwd.is_dir():
        raise GradleRequestError("cwd does not exist or is not a directory")
    return GradleRunRequest(
        cwd=cwd,
        gradle_command=_validate_gradle_command(body.get("gradleCommand")),
        task=_validate_task(body.get("task")),
    )


def build_visible_command(req: GradleRunRequest) -> str:
    return f"cd {shlex.quote(str(req.cwd))} && {shlex.quote(req.gradle_command)} {shlex.quote(req.task)}"
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
.venv/bin/python -m pytest tests/test_gradle_runner.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/gradle_runner.py tests/test_gradle_runner.py
git commit -m "feat(bridge): validate Gradle launcher requests"
```

---

### Task 2: Bridge iTerm Fallback Endpoint

**Files:**
- Modify: `bridge/gradle_runner.py`
- Modify: `bridge/server.py`
- Test: `tests/test_gradle_api.py`
- Modify: `tests/test_server_app.py`

- [ ] **Step 1: Write failing endpoint tests**

Create `tests/test_gradle_api.py`:

```python
import pytest
from bridge.server import make_app


class FakeInjector:
    def submit_select(self, *a): ...
    def submit_cancel(self, *a): ...


class FakeGradleRunner:
    def __init__(self):
        self.commands = []

    async def run(self, req):
        self.commands.append(req)
        return {"ok": True, "command": f"{req.gradle_command} {req.task}"}


@pytest.fixture
async def client(aiohttp_client, tmp_path):
    from bridge.state import PendingStore
    from bridge.ws import Hub
    runner = FakeGradleRunner()
    app = make_app(PendingStore(), Hub(), FakeInjector(), gradle_runner=runner)
    app["fake_gradle_runner"] = runner
    app["project_dir"] = tmp_path
    return await aiohttp_client(app)


async def test_gradle_iterm_endpoint_runs_valid_request(client):
    project = client.app["project_dir"] / "api"
    project.mkdir()
    resp = await client.post("/run/gradle/iterm", json={"cwd": str(project), "task": "bootRun"})
    assert resp.status == 200
    assert await resp.json() == {"ok": True, "command": "./gradlew bootRun"}
    assert client.app["fake_gradle_runner"].commands[0].task == "bootRun"


async def test_gradle_iterm_endpoint_rejects_invalid_request(client):
    resp = await client.post("/run/gradle/iterm", json={"cwd": "/missing", "task": "bootRun; bad"})
    assert resp.status == 400
    body = await resp.json()
    assert body["ok"] is False
    assert "error" in body
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
.venv/bin/python -m pytest tests/test_gradle_api.py -q
```

Expected: FAIL because `make_app()` does not accept `gradle_runner` and route does not exist.

- [ ] **Step 3: Implement runner abstraction and route**

Append to `bridge/gradle_runner.py`:

```python
class ItermGradleRunner:
    def __init__(self, injector):
        self.injector = injector

    async def run(self, req: GradleRunRequest) -> dict:
        visible = build_visible_command(req)
        fut = self.injector.submit_run_command(visible)
        await fut
        return {"ok": True, "command": visible}
```

Modify `bridge/server.py`:

```python
from bridge.gradle_runner import (
    GradleRequestError,
    ItermGradleRunner,
    parse_gradle_run_request,
)


def make_gradle_iterm_handler(gradle_runner):
    async def handler(request):
        try:
            body = await request.json()
            req = parse_gradle_run_request(body)
            result = await gradle_runner.run(req)
            return web.json_response(result)
        except GradleRequestError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
    return handler


def make_app(store, hub, injector, gradle_runner=None) -> web.Application:
    app = web.Application()
    app.router.add_post("/hook/question", make_question_handler(store, hub))
    app.router.add_post("/hook/codex/permission", make_codex_permission_handler(store, hub))
    app.router.add_post("/hook/resolved", make_resolved_handler(store, hub))
    app.router.add_post("/run/gradle/iterm", make_gradle_iterm_handler(gradle_runner or ItermGradleRunner(injector)))
    app.router.add_get("/ws", make_ws_handler(store, hub, injector))
    app.router.add_get("/", _index)
    app.router.add_static("/static", WEBCLIENT_DIR)
    return app
```

- [ ] **Step 4: Add iTerm command handoff method**

Modify `bridge/injector.py` by adding these methods inside `ItermInjector`:

```python
    async def _run_command(self, command: str):
        if self._app is None:
            raise RuntimeError("iTerm2 app not connected")
        window = await self._app.async_create_window()
        session = window.current_tab.current_session
        await session.async_send_text(command + "\n")

    def submit_run_command(self, command: str):
        return asyncio.run_coroutine_threadsafe(self._run_command(command), self._require_loop())
```

Add tests to `tests/test_injector_select.py`:

```python
class FakeTab:
    def __init__(self, session):
        self.current_session = session


class FakeWindow:
    def __init__(self, session):
        self.current_tab = FakeTab(session)


class FakeWindowApp(FakeApp):
    def __init__(self, session):
        super().__init__({})
        self.window = FakeWindow(session)

    async def async_create_window(self):
        return self.window


async def test_run_command_opens_window_and_sends_command():
    sess = FakeSession()
    inj = ItermInjector()
    inj._app = FakeWindowApp(sess)
    await inj._run_command("cd /tmp && ./gradlew test")
    assert sess.sent == ["cd /tmp && ./gradlew test\n"]
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
.venv/bin/python -m pytest tests/test_gradle_runner.py tests/test_gradle_api.py tests/test_injector_select.py -q
```

Expected: PASS.

- [ ] **Step 6: Run full Python suite**

Run with local socket permissions if needed:

```bash
.venv/bin/python -m pytest -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bridge/gradle_runner.py bridge/server.py bridge/injector.py tests/test_gradle_api.py tests/test_injector_select.py
git commit -m "feat(bridge): add iTerm Gradle fallback endpoint"
```

---

### Task 3: Stream Deck Launcher Config and Page State

**Files:**
- Create: `streamdeck-plugin/src/launcher-types.ts`
- Create: `streamdeck-plugin/src/launcher-config.ts`
- Create: `streamdeck-plugin/src/launcher-state.ts`
- Test: `streamdeck-plugin/tests/launcher-config.test.ts`
- Test: `streamdeck-plugin/tests/launcher-state.test.ts`

- [ ] **Step 1: Write config tests**

Create `streamdeck-plugin/tests/launcher-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLauncherConfig } from "../src/launcher-config.js";

describe("parseLauncherConfig", () => {
  it("parses projects and defaults gradleCommand/favorites", () => {
    const config = parseLauncherConfig({
      projects: [{ name: "API", path: "/repo/api" }],
    });
    expect(config.projects).toEqual([
      { name: "API", path: "/repo/api", gradleCommand: "./gradlew", favorites: [] },
    ]);
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
});
```

- [ ] **Step 2: Write launcher-state tests**

Create `streamdeck-plugin/tests/launcher-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LauncherState } from "../src/launcher-state.js";
import type { LauncherConfig, IntelliJProject } from "../src/launcher-types.js";

const config: LauncherConfig = {
  projects: [
    { name: "API", path: "/repo/api", gradleCommand: "./gradlew", favorites: ["bootRun", "test"] },
    { name: "Admin", path: "/repo/admin", gradleCommand: "./gradlew", favorites: [] },
  ],
};

const openProjects: IntelliJProject[] = [{ name: "api", path: "/repo/api", basePath: "/repo/api" }];

describe("LauncherState", () => {
  it("renders home project slots with open/iTerm status", () => {
    const state = new LauncherState(config);
    state.applyIntelliJProjects(openProjects);
    const slots = state.slots();
    expect(slots[0]).toMatchObject({ kind: "project", label: "API", status: "OPEN" });
    expect(slots[1]).toMatchObject({ kind: "project", label: "Admin", status: "iTerm" });
  });

  it("enters project detail and renders favorite task slots", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/api");
    const slots = state.slots();
    expect(slots[0]).toMatchObject({ kind: "control", action: "back" });
    expect(slots[1]).toMatchObject({ kind: "task", task: "bootRun" });
    expect(slots[2]).toMatchObject({ kind: "task", task: "test" });
  });

  it("uses default tasks when favorites are empty", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/admin");
    const tasks = state.slots().filter((slot) => slot.kind === "task").map((slot) => slot.task);
    expect(tasks).toEqual(["bootRun", "test", "build", "clean"]);
  });

  it("back returns to home", () => {
    const state = new LauncherState(config);
    state.openProject("/repo/api");
    state.back();
    expect(state.currentPage()).toEqual({ kind: "home" });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd streamdeck-plugin && npx vitest run tests/launcher-config.test.ts tests/launcher-state.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement launcher types**

Create `streamdeck-plugin/src/launcher-types.ts`:

```ts
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
```

- [ ] **Step 5: Implement config parser**

Create `streamdeck-plugin/src/launcher-config.ts`:

```ts
import type { LauncherConfig, LauncherProject } from "./launcher-types.js";

const TASK_RE = /^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;
const COMMAND_RE = /^(\.\/gradlew|\/[^\s;&|`$]+|[A-Za-z0-9_.-]+)$/;

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
  const gradleCommand = typeof obj.gradleCommand === "string" && obj.gradleCommand.trim()
    ? obj.gradleCommand.trim()
    : "./gradlew";
  if (!COMMAND_RE.test(gradleCommand)) throw new Error(`gradleCommand is invalid: ${gradleCommand}`);
  return {
    name: asString(obj.name, "name"),
    path: asString(obj.path, "path"),
    gradleCommand,
    favorites,
  };
}

export function parseLauncherConfig(raw: unknown): LauncherConfig {
  if (!raw || typeof raw !== "object") return { projects: [] };
  const projects = (raw as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) return { projects: [] };
  return { projects: projects.map(parseProject) };
}
```

- [ ] **Step 6: Implement launcher state**

Create `streamdeck-plugin/src/launcher-state.ts`:

```ts
import type { IntelliJProject, LauncherConfig, LauncherPage, LauncherProject, LauncherSlot } from "./launcher-types.js";

const DEFAULT_TASKS = ["bootRun", "test", "build", "clean"];
const SLOT_COUNT = 15;

export class LauncherState {
  private page: LauncherPage = { kind: "home" };
  private openPaths = new Set<string>();

  constructor(private config: LauncherConfig) {}

  currentPage(): LauncherPage { return this.page; }

  applyConfig(config: LauncherConfig): void {
    this.config = config;
    if (this.page.kind === "project" && !this.projectFor(this.page.path)) {
      this.page = { kind: "home" };
    }
  }

  applyIntelliJProjects(projects: IntelliJProject[]): void {
    this.openPaths = new Set(projects.map((project) => project.path));
  }

  openProject(path: string): void {
    if (this.projectFor(path)) this.page = { kind: "project", path };
  }

  back(): void { this.page = { kind: "home" }; }

  slots(): LauncherSlot[] {
    const slots = this.page.kind === "home" ? this.homeSlots() : this.projectSlots(this.page.path);
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
    const tasks = (project.favorites.length ? project.favorites : DEFAULT_TASKS).slice(0, SLOT_COUNT - 2);
    return [
      { kind: "control", action: "back", label: "Back" },
      ...tasks.map((task) => ({ kind: "task" as const, projectPath: project.path, task, gradleCommand: project.gradleCommand, status })),
      { kind: "control", action: "refresh", label: "Refresh" },
    ];
  }

  private projectFor(path: string): LauncherProject | undefined {
    return this.config.projects.find((project) => project.path === path);
  }
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd streamdeck-plugin && npx vitest run tests/launcher-config.test.ts tests/launcher-state.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add streamdeck-plugin/src/launcher-types.ts streamdeck-plugin/src/launcher-config.ts streamdeck-plugin/src/launcher-state.ts streamdeck-plugin/tests/launcher-config.test.ts streamdeck-plugin/tests/launcher-state.test.ts
git commit -m "feat(plugin): add launcher config and page state"
```

---

### Task 4: Stream Deck IntelliJ and Bridge Clients

**Files:**
- Create: `streamdeck-plugin/src/intellij-client.ts`
- Create: `streamdeck-plugin/src/gradle-bridge-client.ts`
- Test: `streamdeck-plugin/tests/intellij-client.test.ts`
- Test: `streamdeck-plugin/tests/launcher-routing.test.ts`

- [ ] **Step 1: Write client/routing tests**

Create `streamdeck-plugin/tests/intellij-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IntelliJClient } from "../src/intellij-client.js";

describe("IntelliJClient", () => {
  it("fetches open projects", async () => {
    const calls: string[] = [];
    const client = new IntelliJClient("http://idea", async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ projects: [{ name: "api", path: "/repo/api", basePath: "/repo/api" }] }), { status: 200 });
    });
    await expect(client.projects()).resolves.toEqual([{ name: "api", path: "/repo/api", basePath: "/repo/api" }]);
    expect(calls).toEqual(["http://idea/projects"]);
  });

  it("returns false when run receives project-not-open", async () => {
    const client = new IntelliJClient("http://idea", async () => new Response("not open", { status: 404 }));
    await expect(client.runGradle("/repo/api", "bootRun")).resolves.toBe(false);
  });
});
```

Create `streamdeck-plugin/tests/launcher-routing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runLauncherTask } from "../src/gradle-bridge-client.js";

describe("runLauncherTask", () => {
  it("uses IntelliJ when project is open", async () => {
    const events: string[] = [];
    await runLauncherTask(
      { projectPath: "/repo/api", task: "bootRun", gradleCommand: "./gradlew", status: "OPEN" },
      {
        intellij: { runGradle: async () => { events.push("intellij"); return true; } },
        bridge: { runGradleInIterm: async () => { events.push("bridge"); } },
      },
    );
    expect(events).toEqual(["intellij"]);
  });

  it("falls back to bridge when IntelliJ reports not open", async () => {
    const events: string[] = [];
    await runLauncherTask(
      { projectPath: "/repo/api", task: "bootRun", gradleCommand: "./gradlew", status: "OPEN" },
      {
        intellij: { runGradle: async () => false },
        bridge: { runGradleInIterm: async () => { events.push("bridge"); } },
      },
    );
    expect(events).toEqual(["bridge"]);
  });

  it("uses bridge directly when status is iTerm", async () => {
    const events: string[] = [];
    await runLauncherTask(
      { projectPath: "/repo/admin", task: "test", gradleCommand: "./gradlew", status: "iTerm" },
      {
        intellij: { runGradle: async () => { events.push("intellij"); return true; } },
        bridge: { runGradleInIterm: async () => { events.push("bridge"); } },
      },
    );
    expect(events).toEqual(["bridge"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd streamdeck-plugin && npx vitest run tests/intellij-client.test.ts tests/launcher-routing.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement IntelliJ client**

Create `streamdeck-plugin/src/intellij-client.ts`:

```ts
import type { IntelliJProject } from "./launcher-types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class IntelliJClient {
  constructor(private baseUrl = "http://127.0.0.1:8788", private fetchImpl: FetchLike = fetch) {}

  async projects(): Promise<IntelliJProject[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects`);
    if (!res.ok) return [];
    const body = await res.json() as { projects?: IntelliJProject[] };
    return Array.isArray(body.projects) ? body.projects : [];
  }

  async tasks(path: string): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects/tasks?path=${encodeURIComponent(path)}`);
    if (!res.ok) return [];
    const body = await res.json() as { tasks?: string[] };
    return Array.isArray(body.tasks) ? body.tasks.filter((task) => typeof task === "string") : [];
  }

  async runGradle(path: string, task: string): Promise<boolean> {
    const res = await this.fetchImpl(`${this.baseUrl}/projects/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, task }),
    });
    if (res.status === 404 || res.status === 409) return false;
    if (!res.ok) throw new Error(`IntelliJ Gradle run failed: ${res.status}`);
    return true;
  }
}
```

- [ ] **Step 4: Implement bridge client and route helper**

Create `streamdeck-plugin/src/gradle-bridge-client.ts`:

```ts
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

export class GradleBridgeClient implements BridgeRunClient {
  constructor(private baseUrl = "http://127.0.0.1:8787", private fetchImpl: typeof fetch = fetch) {}

  async runGradleInIterm(path: string, gradleCommand: string, task: string): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/run/gradle/iterm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd streamdeck-plugin && npx vitest run tests/intellij-client.test.ts tests/launcher-routing.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add streamdeck-plugin/src/intellij-client.ts streamdeck-plugin/src/gradle-bridge-client.ts streamdeck-plugin/tests/intellij-client.test.ts streamdeck-plugin/tests/launcher-routing.test.ts
git commit -m "feat(plugin): add IntelliJ and Gradle bridge clients"
```

---

### Task 5: Stream Deck Launcher Action, Images, and Profile

**Files:**
- Create: `streamdeck-plugin/src/launcher-image.ts`
- Create: `streamdeck-plugin/src/launcher-action.ts`
- Create: `streamdeck-plugin/scripts/make-dev-launcher-profile.py`
- Modify: `streamdeck-plugin/src/plugin.ts`
- Modify: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`
- Create/update: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/Dev Launcher.streamDeckProfile`
- Test: `streamdeck-plugin/tests/manifest.test.ts`

- [ ] **Step 1: Extend manifest test first**

Modify `streamdeck-plugin/tests/manifest.test.ts` to assert:

```ts
it("declares Dev Launcher profile and launcher tile action", () => {
  const launcher = manifest.Actions.find((action) => action.UUID === "com.shinsanghoon.claude-bridge.launcher");
  expect(launcher?.Name).toBe("Project Launcher Tile");
  expect(manifest.Profiles.some((profile) => profile.Name === "Dev Launcher")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd streamdeck-plugin && npx vitest run tests/manifest.test.ts
```

Expected: FAIL because manifest lacks launcher action/profile.

- [ ] **Step 3: Implement image renderer**

Create `streamdeck-plugin/src/launcher-image.ts`:

```ts
import type { LauncherSlot } from "./launcher-types.js";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colors(slot: LauncherSlot): { bg: string; fg: string; sub: string } {
  if (slot.kind === "project" && slot.status === "OPEN") return { bg: "#0f766e", fg: "#ffffff", sub: "#ccfbf1" };
  if (slot.kind === "project") return { bg: "#374151", fg: "#ffffff", sub: "#d1d5db" };
  if (slot.kind === "task" && slot.status === "OPEN") return { bg: "#1d4ed8", fg: "#ffffff", sub: "#dbeafe" };
  if (slot.kind === "task") return { bg: "#713f12", fg: "#ffffff", sub: "#fde68a" };
  if (slot.kind === "control") return { bg: "#111827", fg: "#ffffff", sub: "#9ca3af" };
  return { bg: "#050505", fg: "#666666", sub: "#444444" };
}

export function launcherImageDataUri(slot: LauncherSlot): string {
  const { bg, fg, sub } = colors(slot);
  const title =
    slot.kind === "project" ? slot.label :
    slot.kind === "task" ? slot.task :
    slot.kind === "control" ? slot.label : "";
  const footer =
    slot.kind === "project" ? slot.status :
    slot.kind === "task" ? slot.status :
    slot.kind === "control" ? slot.action : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" rx="10" fill="${bg}"/>
    <text x="72" y="58" fill="${fg}" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="22" font-weight="700" text-anchor="middle">${esc(title)}</text>
    <text x="72" y="96" fill="${sub}" font-family="-apple-system,BlinkMacSystemFont,Arial" font-size="17" text-anchor="middle">${esc(footer)}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
```

- [ ] **Step 4: Implement launcher action**

Create `streamdeck-plugin/src/launcher-action.ts`:

```ts
import { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { runLauncherTask, type BridgeRunClient, type IntelliJRunClient } from "./gradle-bridge-client.js";
import { launcherImageDataUri } from "./launcher-image.js";
import { LauncherState } from "./launcher-state.js";
import type { LauncherSlot } from "./launcher-types.js";

interface LauncherSettings {
  slot?: number;
  [key: string]: JsonValue;
}

@action({ UUID: "com.shinsanghoon.claude-bridge.launcher" })
export class LauncherAction extends SingletonAction<LauncherSettings> {
  constructor(
    private state: LauncherState,
    private deps: { intellij: IntelliJRunClient; bridge: BridgeRunClient; refresh: () => Promise<void> },
  ) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<LauncherSettings>): Promise<void> {
    if (!ev.action.isKey()) return;
    const slot = this.slotFor(ev);
    if (ev.payload.settings.slot !== slot) {
      await ev.action.setSettings({ ...ev.payload.settings, slot });
    }
    await this.refresh(ev.action, slot);
  }

  override async onKeyDown(ev: KeyDownEvent<LauncherSettings>): Promise<void> {
    const slot = Number(ev.payload.settings.slot ?? 0) || 0;
    const model = this.state.slots()[slot] ?? { kind: "empty" as const };
    try {
      await this.handle(model);
      await this.refreshAll();
    } catch {
      await ev.action.showAlert();
    }
  }

  async refreshAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      const settings = await a.getSettings<LauncherSettings>();
      await this.refresh(a, Number(settings.slot ?? 0) || 0);
    }
  }

  private async handle(slot: LauncherSlot): Promise<void> {
    if (slot.kind === "project") this.state.openProject(slot.path);
    if (slot.kind === "control" && slot.action === "back") this.state.back();
    if (slot.kind === "control" && slot.action === "refresh") await this.deps.refresh();
    if (slot.kind === "task") {
      await runLauncherTask({
        projectPath: slot.projectPath,
        task: slot.task,
        gradleCommand: slot.gradleCommand,
        status: slot.status,
      }, this.deps);
    }
  }

  private async refresh(a: KeyAction<LauncherSettings>, slot: number): Promise<void> {
    await a.setImage(launcherImageDataUri(this.state.slots()[slot] ?? { kind: "empty" }));
  }

  private slotFor(ev: WillAppearEvent<LauncherSettings>): number {
    if ("coordinates" in ev.payload && ev.payload.coordinates) {
      return ev.payload.coordinates.row * 5 + ev.payload.coordinates.column;
    }
    return Number(ev.payload.settings.slot ?? 0) || 0;
  }
}
```

- [ ] **Step 5: Wire plugin entry**

Modify `streamdeck-plugin/src/plugin.ts`:

```ts
import { GradleBridgeClient } from "./gradle-bridge-client.js";
import { IntelliJClient } from "./intellij-client.js";
import { LauncherAction } from "./launcher-action.js";
import { parseLauncherConfig } from "./launcher-config.js";
import { LauncherState } from "./launcher-state.js";

const launcherState = new LauncherState(parseLauncherConfig({ projects: [] }));
const intellijClient = new IntelliJClient();
const gradleBridgeClient = new GradleBridgeClient();

async function refreshLauncher(): Promise<void> {
  launcherState.applyIntelliJProjects(await intellijClient.projects());
  await launcherAction.refreshAll();
}

const launcherAction = new LauncherAction(launcherState, {
  intellij: intellijClient,
  bridge: gradleBridgeClient,
  refresh: refreshLauncher,
});

streamDeck.actions.registerAction(launcherAction);
setInterval(() => { void refreshLauncher(); }, 5000);
void refreshLauncher();
```

Keep all existing Claude/Codex setup unchanged.

- [ ] **Step 6: Add manifest entries**

Modify `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`:

```json
{
  "Name": "Project Launcher Tile",
  "UUID": "com.shinsanghoon.claude-bridge.launcher",
  "Icon": "imgs/actions/logo/icon",
  "Tooltip": "프로젝트/Gradle 런처 타일",
  "Controllers": ["Keypad"],
  "States": [{ "Image": "imgs/actions/logo/key" }]
}
```

Add profile:

```json
{ "Name": "Dev Launcher", "DeviceType": 0, "Readonly": false }
```

- [ ] **Step 7: Create bundled profile generator**

Create `streamdeck-plugin/scripts/make-dev-launcher-profile.py`:

```python
#!/usr/bin/env python3
import json
import uuid
import zipfile
from pathlib import Path

PLUGIN_UUID = "com.shinsanghoon.claude-bridge"
ACTION_UUID = "com.shinsanghoon.claude-bridge.launcher"
PLUGIN_NAME = "Claude Bridge"
ACTION_NAME = "Project Launcher Tile"
PROFILE_NAME = "Dev Launcher"


def action(slot: int) -> dict:
    return {
        "ActionID": str(uuid.uuid4()).upper(),
        "LinkedTitle": True,
        "Name": ACTION_NAME,
        "Plugin": {"Name": PLUGIN_NAME, "UUID": PLUGIN_UUID, "Version": "0.1.0.0"},
        "Resources": None,
        "Settings": {"slot": slot},
        "State": 0,
        "States": [{}],
        "UUID": ACTION_UUID,
    }


def main() -> None:
    plugin_dir = Path(__file__).resolve().parents[1] / "com.shinsanghoon.claude-bridge.sdPlugin"
    out = plugin_dir / "Dev Launcher.streamDeckProfile"
    profile_uuid = str(uuid.uuid4()).upper()
    page_uuid = str(uuid.uuid4()).upper()
    actions = {
        f"{column},{row}": action(row * 5 + column)
        for row in range(3)
        for column in range(5)
    }
    package = {
        "AppVersion": "7.4.2.22730",
        "DeviceModel": "20GAA9902",
        "DeviceSettings": None,
        "FormatVersion": 1,
        "OSType": "macOS",
        "OSVersion": "26.5.1",
        "RequiredPlugins": ["com.elgato.streamdeck.page", PLUGIN_UUID],
    }
    root_manifest = {
        "Device": {"Model": "20GAA9902", "UUID": str(uuid.uuid4())},
        "Name": PROFILE_NAME,
        "Pages": {
            "Current": "00000000-0000-0000-0000-000000000000",
            "Default": page_uuid.lower(),
            "Pages": [],
        },
        "Version": "3.0",
    }
    page_manifest = {
        "Controllers": [{"Actions": actions, "Type": "Keypad"}],
        "Icon": "",
        "Name": PROFILE_NAME,
    }
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        root = f"Profiles/{profile_uuid}.sdProfile"
        page = f"{root}/Profiles/{page_uuid}"
        z.writestr("package.json", json.dumps(package, separators=(",", ":")))
        z.writestr("Profiles/", "")
        z.writestr(f"{root}/", "")
        z.writestr(f"{root}/manifest.json", json.dumps(root_manifest, separators=(",", ":")))
        z.writestr(f"{root}/Profiles/", "")
        z.writestr(f"{page}/", "")
        z.writestr(f"{page}/Images/", "")
        z.writestr(f"{page}/manifest.json", json.dumps(page_manifest, separators=(",", ":")))
    print(out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Generate bundled `Dev Launcher.streamDeckProfile`**

Run:

```bash
python3 streamdeck-plugin/scripts/make-dev-launcher-profile.py
```

Expected: creates `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/Dev Launcher.streamDeckProfile`.

- [ ] **Step 9: Run plugin tests and build**

Run:

```bash
cd streamdeck-plugin && npm test && npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add streamdeck-plugin/src/plugin.ts streamdeck-plugin/src/launcher-action.ts streamdeck-plugin/src/launcher-image.ts streamdeck-plugin/scripts/make-dev-launcher-profile.py streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/Dev\\ Launcher.streamDeckProfile streamdeck-plugin/tests/manifest.test.ts
git commit -m "feat(plugin): add Dev Launcher profile and action"
```

---

### Task 6: IntelliJ Plugin Scaffold and HTTP Server

**Files:**
- Create: `intellij-plugin/settings.gradle.kts`
- Create: `intellij-plugin/build.gradle.kts`
- Create: `intellij-plugin/src/main/resources/META-INF/plugin.xml`
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeStartupActivity.kt`
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt`
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/Json.kt`
- Test: `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/JsonTest.kt`

- [ ] **Step 1: Scaffold Gradle files**

Create `intellij-plugin/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven("https://www.jetbrains.com/intellij-repository/releases")
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        maven("https://www.jetbrains.com/intellij-repository/releases")
    }
}

rootProject.name = "streamdeck-intellij-companion"
```

Create `intellij-plugin/build.gradle.kts`:

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.1.21"
    id("org.jetbrains.intellij.platform") version "2.16.0"
}

group = "com.shinsanghoon.streamdeck"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    testImplementation(kotlin("test"))
    intellijPlatform {
        intellijIdea("2026.1.3")
        bundledPlugin("com.intellij.java")
        bundledPlugin("org.jetbrains.plugins.gradle")
        testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)
    }
}

intellijPlatform {
    pluginConfiguration {
        id = "com.shinsanghoon.streamdeck.intellij-companion"
        name = "Stream Deck IntelliJ Companion"
        version = project.version.toString()
        ideaVersion { sinceBuild = "261" }
    }
}

tasks {
    withType<JavaCompile> {
        sourceCompatibility = "21"
        targetCompatibility = "21"
    }
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) }
    }
    test {
        useJUnitPlatform()
    }
}
```

The IntelliJ Platform Gradle Plugin 2.x is the current supported plugin family; it requires recent IntelliJ Platform and Java versions, so this plan targets Java 21 and IntelliJ 2026.1.x.

- [ ] **Step 2: Add plugin descriptor**

Create `intellij-plugin/src/main/resources/META-INF/plugin.xml`:

```xml
<idea-plugin>
  <id>com.shinsanghoon.streamdeck.intellij-companion</id>
  <name>Stream Deck IntelliJ Companion</name>
  <vendor>shinsanghoon</vendor>

  <depends>com.intellij.modules.platform</depends>
  <depends>com.intellij.modules.java</depends>
  <depends>org.jetbrains.plugins.gradle</depends>

  <extensions defaultExtensionNs="com.intellij">
    <applicationService serviceImplementation="com.shinsanghoon.streamdeck.BridgeServerService"/>
    <postStartupActivity implementation="com.shinsanghoon.streamdeck.BridgeStartupActivity"/>
  </extensions>
</idea-plugin>
```

- [ ] **Step 3: Add JSON helpers and tests**

Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/JsonTest.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

class JsonTest {
    @Test
    fun escapesStrings() {
        assertEquals("\"a\\\"b\"", Json.string("a\"b"))
    }
}
```

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/Json.kt`:

```kotlin
package com.shinsanghoon.streamdeck

object Json {
    fun string(value: String): String = buildString {
        append('"')
        for (ch in value) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
        append('"')
    }

    fun obj(fields: Map<String, String>): String =
        fields.entries.joinToString(prefix = "{", postfix = "}") { (key, value) -> "${string(key)}:$value" }
}
```

- [ ] **Step 4: Add HTTP server service**

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeStartupActivity.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.components.service

class BridgeStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        service<BridgeServerService>().ensureStarted()
    }
}
```

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BridgeServerService : Disposable {
    private val started = AtomicBoolean(false)
    private var server: HttpServer? = null

    fun ensureStarted() {
        if (!started.compareAndSet(false, true)) return
        try {
            val http = HttpServer.create(InetSocketAddress("127.0.0.1", 8788), 0)
            http.executor = Executors.newSingleThreadExecutor()
            http.createContext("/health") { exchange -> exchange.json(200, """{"ok":true}""") }
            http.start()
            server = http
        } catch (e: Exception) {
            started.set(false)
            thisLogger().warn("Failed to start Stream Deck companion server", e)
        }
    }

    override fun dispose() {
        server?.stop(0)
        server = null
        started.set(false)
    }
}

fun HttpExchange.json(status: Int, body: String) {
    val bytes = body.toByteArray(StandardCharsets.UTF_8)
    responseHeaders.add("Content-Type", "application/json; charset=utf-8")
    sendResponseHeaders(status, bytes.size.toLong())
    responseBody.use { it.write(bytes) }
}
```

- [ ] **Step 5: Run IntelliJ plugin tests/build**

Run:

```bash
cd intellij-plugin && ./gradlew test buildPlugin
```

Expected: PASS and a plugin zip under `intellij-plugin/build/distributions/`.

- [ ] **Step 6: Commit**

```bash
git add intellij-plugin
git commit -m "feat(intellij): scaffold companion plugin server"
```

---

### Task 7: IntelliJ Open Projects and Task Detection APIs

**Files:**
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/ProjectRegistry.kt`
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetector.kt`
- Modify: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt`
- Test: `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/ProjectRegistryTest.kt`
- Test: `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetectorTest.kt`

- [ ] **Step 1: Write pure tests**

Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetectorTest.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

class GradleTaskDetectorTest {
    @Test
    fun parsesGradleTasksOutput() {
        val output = """
            Application tasks
            -----------------
            bootRun - Runs this project as a Spring Boot application.
            :api:bootRun - Runs api.
            build - Assembles and tests this project.
        """.trimIndent()
        assertEquals(listOf("bootRun", ":api:bootRun", "build"), GradleTaskDetector.parseTasks(output))
    }
}
```

Create `intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/ProjectRegistryTest.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

class ProjectRegistryTest {
    @Test
    fun projectJsonContainsNamePathAndBasePath() {
        val json = ProjectRegistry.projectsJson(listOf(ProjectInfo("api", "/repo/api", "/repo/api")))
        assertEquals("""{"projects":[{"name":"api","path":"/repo/api","basePath":"/repo/api"}]}""", json)
    }
}
```

- [ ] **Step 2: Implement registry and detector**

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/ProjectRegistry.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import java.nio.file.Path

data class ProjectInfo(val name: String, val path: String, val basePath: String)

object ProjectRegistry {
    fun openProjects(): List<ProjectInfo> =
        ProjectManager.getInstance().openProjects.mapNotNull(::infoFor)

    fun findByPath(path: String): Project? {
        val requested = normalize(path)
        return ProjectManager.getInstance().openProjects.firstOrNull { project ->
            project.basePath?.let { normalize(it) } == requested
        }
    }

    fun projectsJson(projects: List<ProjectInfo> = openProjects()): String {
        val items = projects.joinToString(",") {
            Json.obj(mapOf(
                "name" to Json.string(it.name),
                "path" to Json.string(it.path),
                "basePath" to Json.string(it.basePath),
            ))
        }
        return """{"projects":[$items]}"""
    }

    private fun infoFor(project: Project): ProjectInfo? {
        val base = project.basePath ?: return null
        val normalized = normalize(base)
        return ProjectInfo(project.name, normalized, normalized)
    }

    private fun normalize(path: String): String = Path.of(path).toAbsolutePath().normalize().toString()
}
```

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetector.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

object GradleTaskDetector {
    private val taskLine = Regex("""^\s*(:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*)\s+-\s+.+$""")

    fun detect(projectPath: String): List<String> {
        val dir = Path.of(projectPath)
        val wrapper = dir.resolve("gradlew")
        if (!Files.exists(wrapper)) return emptyList()
        val process = ProcessBuilder("./gradlew", "tasks", "--all", "--console=plain", "--quiet")
            .directory(dir.toFile())
            .redirectErrorStream(true)
            .start()
        if (!process.waitFor(15, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            return emptyList()
        }
        return parseTasks(process.inputStream.bufferedReader().readText())
    }

    fun parseTasks(output: String): List<String> =
        output.lineSequence()
            .mapNotNull { line -> taskLine.matchEntire(line)?.groupValues?.get(1) }
            .distinct()
            .toList()

    fun tasksJson(path: String, tasks: List<String> = detect(path)): String {
        val items = tasks.joinToString(",") { Json.string(it) }
        return """{"path":${Json.string(path)},"tasks":[$items]}"""
    }
}
```

- [ ] **Step 3: Add `/projects` and `/projects/tasks` contexts**

Modify `BridgeServerService.ensureStarted()`:

```kotlin
http.createContext("/projects") { exchange ->
    if (exchange.requestURI.path == "/projects") {
        exchange.json(200, ProjectRegistry.projectsJson())
    } else if (exchange.requestURI.path == "/projects/tasks") {
        val path = exchange.requestURI.rawQuery
            ?.split("&")
            ?.firstOrNull { it.startsWith("path=") }
            ?.removePrefix("path=")
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
        if (path == null || ProjectRegistry.findByPath(path) == null) {
            exchange.json(404, """{"ok":false,"error":"project not open"}""")
        } else {
            exchange.json(200, GradleTaskDetector.tasksJson(path))
        }
    } else {
        exchange.json(404, """{"ok":false,"error":"not found"}""")
    }
}
```

- [ ] **Step 4: Run IntelliJ tests**

Run:

```bash
cd intellij-plugin && ./gradlew test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/ProjectRegistry.kt intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetector.kt intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/ProjectRegistryTest.kt intellij-plugin/src/test/kotlin/com/shinsanghoon/streamdeck/GradleTaskDetectorTest.kt
git commit -m "feat(intellij): expose open projects and Gradle tasks"
```

---

### Task 8: IntelliJ Gradle Run Endpoint

**Files:**
- Create: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskRunner.kt`
- Modify: `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt`

- [ ] **Step 1: Add runner implementation**

Create `intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskRunner.kt`:

```kotlin
package com.shinsanghoon.streamdeck

import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.externalSystem.model.execution.ExternalSystemTaskExecutionSettings
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.gradle.util.GradleConstants

object GradleTaskRunner {
    private val taskRegex = Regex("""^:?[A-Za-z0-9_][A-Za-z0-9_.-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$""")

    fun isValidTask(task: String): Boolean = taskRegex.matches(task)

    fun run(project: Project, task: String) {
        require(isValidTask(task)) { "invalid Gradle task" }
        val basePath = project.basePath ?: error("project has no basePath")
        val settings = ExternalSystemTaskExecutionSettings().apply {
            externalProjectPath = basePath
            taskNames = listOf(task)
        }
        ExternalSystemUtil.runTask(
            settings,
            DefaultRunExecutor.EXECUTOR_ID,
            project,
            GradleConstants.SYSTEM_ID,
        )
    }
}
```

- [ ] **Step 2: Add minimal JSON request parser**

Append to `Json.kt`:

```kotlin
fun field(body: String, name: String): String? {
    val pattern = Regex(""""${Regex.escape(name)}"\s*:\s*"([^"]*)"""")
    return pattern.find(body)?.groupValues?.get(1)?.replace("\\\"", "\"")
}
```

- [ ] **Step 3: Add `/projects/run` context handling**

Modify the `/projects` context in `BridgeServerService`:

```kotlin
} else if (exchange.requestURI.path == "/projects/run") {
    if (exchange.requestMethod != "POST") {
        exchange.json(405, """{"ok":false,"error":"method not allowed"}""")
        return@createContext
    }
    val body = exchange.requestBody.bufferedReader().readText()
    val path = Json.field(body, "path")
    val task = Json.field(body, "task")
    if (path == null || task == null || !GradleTaskRunner.isValidTask(task)) {
        exchange.json(400, """{"ok":false,"error":"invalid request"}""")
        return@createContext
    }
    val project = ProjectRegistry.findByPath(path)
    if (project == null) {
        exchange.json(404, """{"ok":false,"error":"project not open"}""")
        return@createContext
    }
    GradleTaskRunner.run(project, task)
    exchange.json(200, """{"ok":true}""")
```

- [ ] **Step 4: Compile/build plugin**

Run:

```bash
cd intellij-plugin && ./gradlew test buildPlugin
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/GradleTaskRunner.kt intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/BridgeServerService.kt intellij-plugin/src/main/kotlin/com/shinsanghoon/streamdeck/Json.kt
git commit -m "feat(intellij): run Gradle tasks for open projects"
```

---

### Task 9: Config Loading and Setup Documentation

**Files:**
- Modify: `streamdeck-plugin/src/launcher-config.ts`
- Modify: `streamdeck-plugin/src/plugin.ts`
- Modify: `SETUP.md`
- Test: `streamdeck-plugin/tests/launcher-config.test.ts`

- [ ] **Step 1: Add file loading test**

Extend `streamdeck-plugin/tests/launcher-config.test.ts`:

```ts
import { loadLauncherConfigFromText } from "../src/launcher-config.js";

it("loads config from JSON text", () => {
  const config = loadLauncherConfigFromText('{"projects":[{"name":"API","path":"/repo/api","favorites":["bootRun"]}]}');
  expect(config.projects[0].favorites).toEqual(["bootRun"]);
});
```

- [ ] **Step 2: Implement text loading helper**

Modify `launcher-config.ts`:

```ts
export function loadLauncherConfigFromText(text: string): LauncherConfig {
  return parseLauncherConfig(JSON.parse(text));
}
```

- [ ] **Step 3: Load config in plugin entry**

In `plugin.ts`, add:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLauncherConfigFromText } from "./launcher-config.js";

function launcherConfigPath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "streamdeck-claude-bridge", "launcher.json");
}

function loadLauncherConfig() {
  try {
    return loadLauncherConfigFromText(fs.readFileSync(launcherConfigPath(), "utf8"));
  } catch {
    return parseLauncherConfig({ projects: [] });
  }
}
```

Initialize `LauncherState` with `loadLauncherConfig()`, and in `refreshLauncher()` call:

```ts
launcherState.applyConfig(loadLauncherConfig());
```

- [ ] **Step 4: Document setup**

Add to `SETUP.md`:

```markdown
## Dev Launcher profile

Optional developer launcher:

1. Build and install the IntelliJ companion plugin from `intellij-plugin/build/distributions/`.
2. Install the bundled Stream Deck `Dev Launcher` profile.
3. Create `~/Library/Application Support/streamdeck-claude-bridge/launcher.json`.

Example:

```json
{
  "projects": [
    {
      "name": "API",
      "path": "/Users/eric/workspace/api-server",
      "gradleCommand": "./gradlew",
      "favorites": ["bootRun", "test", "build"]
    }
  ]
}
```

When the project path is open in IntelliJ, Gradle tasks run through IntelliJ.
Otherwise they fall back to iTerm2 through the bridge.
```
```

- [ ] **Step 5: Run full verification**

Run:

```bash
.venv/bin/python -m pytest -q
cd streamdeck-plugin && npm test && npm run build
cd ../intellij-plugin && ./gradlew test buildPlugin
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add streamdeck-plugin/src/launcher-config.ts streamdeck-plugin/src/plugin.ts streamdeck-plugin/tests/launcher-config.test.ts SETUP.md
git commit -m "docs: document Dev Launcher setup"
```

---

### Task 10: Manual End-to-End Verification

**Files:**
- Modify: `README.md` or `SETUP.md` only if verification reveals missing instructions.

- [ ] **Step 1: Start bridge**

Run:

```bash
python3 -m bridge
```

Expected: `http://127.0.0.1:8787` is listening.

- [ ] **Step 2: Install/restart Stream Deck plugin**

Run:

```bash
cd streamdeck-plugin
npm run build
npx @elgato/cli restart com.shinsanghoon.claude-bridge
```

Expected: Stream Deck app reloads plugin without startup errors.

- [ ] **Step 3: Install IntelliJ companion plugin**

Run:

```bash
cd intellij-plugin
./gradlew buildPlugin
open build/distributions
```

Install the zip into IntelliJ via Settings | Plugins | Install Plugin from Disk, then restart IntelliJ.

- [ ] **Step 4: Verify IntelliJ API**

With at least one project open in IntelliJ:

```bash
curl -s http://127.0.0.1:8788/health
curl -s http://127.0.0.1:8788/projects
```

Expected: health returns `{"ok":true}` and projects includes the open project path.

- [ ] **Step 5: Configure launcher**

Create `~/Library/Application Support/streamdeck-claude-bridge/launcher.json` with one open project and one closed project.

- [ ] **Step 6: Verify Stream Deck home/detail pages**

Expected:

- `Dev Launcher` profile shows both configured projects.
- Open project tile says `OPEN`.
- Closed project tile says `iTerm`.
- Pressing an open project enters task page.
- Back returns to home.

- [ ] **Step 7: Verify IntelliJ run**

Press `bootRun` or `test` for the open project.

Expected: IntelliJ starts a Gradle run configuration or Gradle tool window execution for that project.

- [ ] **Step 8: Verify iTerm fallback**

Press a task for the closed project.

Expected: iTerm opens a new window/session and runs `cd <project> && ./gradlew <task>`.

- [ ] **Step 9: Verify Claude/Codex interruption still returns**

Trigger a Codex permission prompt from iTerm, approve on Stream Deck, and verify `Dev Launcher` returns afterward.

- [ ] **Step 10: Final status**

Run:

```bash
git status --short
```

Expected: only intentional changes are present.

---

## Self-Review

Spec coverage:

- Registered projects and project pages: Task 3 and Task 5.
- IntelliJ open/closed detection: Task 4 and Task 7.
- Favorite Gradle tasks with defaults: Task 3 and Task 9.
- IntelliJ execution for open projects: Task 8.
- iTerm fallback for closed/offline projects: Task 1 and Task 2.
- Existing Claude/Codex return behavior: Task 10 manual e2e.
- Setup documentation: Task 9.

Known implementation risk:

- `ExternalSystemUtil.runTask` can vary by IntelliJ Platform version. Task 8 intentionally isolates that dependency behind `GradleTaskRunner.run(project, task)` so compile-time API work does not leak into Stream Deck or bridge code.

Placeholder scan:

- No blank requirement markers or unspecified "add tests" steps are intentionally left.

Type consistency:

- Stream Deck task route uses `projectPath`, `gradleCommand`, `task`, and `status`.
- Bridge endpoint uses `cwd`, `gradleCommand`, and `task`.
- IntelliJ endpoint uses `path` and `task`.
