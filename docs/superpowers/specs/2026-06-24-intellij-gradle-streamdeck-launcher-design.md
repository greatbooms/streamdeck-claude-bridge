# IntelliJ Gradle Stream Deck Launcher Design

Date: 2026-06-24
Status: design approved by user, pending implementation plan

## Goal

Add a developer home profile to Stream Deck that can launch Gradle tasks for
multiple projects. The profile should show registered projects, whether each
project is currently open in IntelliJ, and a per-project page of favorite
Gradle tasks. When a task is pressed:

- If the matching project is open in IntelliJ, run the Gradle task inside
  IntelliJ.
- If the project is not open in IntelliJ, open iTerm2 and run the task from the
  configured project path.

The launcher is separate from the existing Claude and Codex prompt profiles.
Those profiles still interrupt for questions/permission prompts and return to
the previous profile afterward. If the previous profile is the launcher, return
continues to work as it does today.

## Scope

Supported first version:

- macOS.
- Standard 5x3 Stream Deck profile, matching the current bundled profile target.
- IntelliJ IDEA with a small local IntelliJ plugin installed.
- Gradle projects using a wrapper by default: `./gradlew <task>`.
- Multiple IntelliJ project windows in the same IntelliJ process.
- A manually configured project list with dynamically detected open/closed
  state.
- Project-specific Gradle task favorites, with automatic task detection used as
  the source of candidates.

Out of scope for the first version:

- Long-running process dashboards, live logs, stop/restart controls, or detailed
  success/failure tracking after the task is handed off.
- Maven/npm launchers.
- Dynamic creation of Stream Deck folders through the Stream Deck app.
- Supporting every JetBrains IDE product at once. The architecture can extend
  to other JetBrains IDEs later, but IntelliJ IDEA is the first target.

## User Experience

The user installs a bundled Stream Deck profile such as `Dev Launcher`. The
profile contains 15 instances of one new action, `Project Launcher Tile`, each
configured with a stable slot number.

The plugin owns a small in-memory page state:

- `home`
- `projectDetail(projectPath)`

On the home page, tiles show configured projects. Each project tile includes:

- short project name
- IntelliJ status: `OPEN` when the exact project path is currently open,
  otherwise `iTerm`
- a compact hint that task presses will use IntelliJ or fallback

Pressing a project tile enters that project's detail page. The project page
shows favorite Gradle tasks for that project. If no favorites are configured,
the plugin shows default candidates when available:

- `bootRun`
- `test`
- `build`
- `clean`

Task favorites are explicit per-project settings. IntelliJ task detection only
provides candidate choices and validation hints; it does not silently decide
what belongs on the page.

The page includes Back and Refresh controls. If more projects or tasks exist
than fit on one 5x3 page, the page state adds Prev/Next controls rather than
using Stream Deck folders.

## Architecture

The feature has three cooperating pieces:

1. Stream Deck plugin additions in `streamdeck-plugin/`
2. New IntelliJ plugin module, proposed as `intellij-plugin/`
3. Small bridge-server extension for iTerm fallback execution

### Stream Deck Plugin

The Stream Deck plugin remains the UI orchestrator. It polls two local services:

- existing bridge server at `127.0.0.1:8787`
- new IntelliJ companion endpoint, for example `127.0.0.1:8788`

New modules:

- `launcher-config.ts`
  - loads registered projects and favorites from a local JSON config
  - canonicalizes project paths before comparison
- `intellij-client.ts`
  - fetches open projects and detected Gradle tasks
  - sends IntelliJ Gradle run requests
- `launcher-state.ts`
  - combines config, IntelliJ status, detected tasks, and current page
  - decides what each of the 15 slots should render and do
- `launcher-action.ts`
  - one singleton action with per-instance `slot` settings
  - on appear/state change, renders each slot as an image
  - on key down, dispatches the slot command
- `launcher-image.ts`
  - draws project, task, control, missing-path, and offline tiles

The existing `ProfileSwitcher` remains focused on Claude/Codex prompt profiles.
The launcher does not replace the prompt flow; it is simply the user's normal
profile that the prompt flow can temporarily leave and return to.

### Launcher Configuration

Use one shared config file instead of per-button project settings, because the
launcher is app-managed and each tile only knows its slot.

Recommended path:

`~/Library/Application Support/streamdeck-claude-bridge/launcher.json`

Shape:

```json
{
  "projects": [
    {
      "name": "API Server",
      "path": "/Users/eric/workspace/api-server",
      "gradleCommand": "./gradlew",
      "favorites": ["bootRun", "test", "build"]
    },
    {
      "name": "Admin",
      "path": "/Users/eric/workspace/admin",
      "gradleCommand": "./gradlew",
      "favorites": [":admin:bootRun", "test"]
    }
  ]
}
```

Rules:

- `name` is the Stream Deck display label.
- `path` is required and is canonicalized with realpath-style resolution.
- `gradleCommand` defaults to `./gradlew` and must be either `./gradlew`, an
  absolute executable path, or a plain executable name without shell metacharacters.
- `favorites` can include root tasks or fully qualified Gradle task paths.
- A favorite that is not currently detected is still shown as a manual task.
- Task strings must be Gradle task identifiers such as `bootRun`,
  `test`, or `:api:bootRun`; shell operators and whitespace are rejected.

An initial version can use this JSON file plus a Refresh tile. A property
inspector for editing project/favorite lists can be added later without changing
the runtime model.

### IntelliJ Plugin

The IntelliJ plugin runs a localhost HTTP server bound to `127.0.0.1`. It
exposes only data and actions for projects currently open inside IntelliJ.

Endpoints:

```text
GET  /health
GET  /projects
GET  /projects/tasks?path=<absolute-project-path>
POST /projects/run
```

`GET /projects` response:

```json
{
  "projects": [
    {
      "name": "api-server",
      "path": "/Users/eric/workspace/api-server",
      "basePath": "/Users/eric/workspace/api-server"
    }
  ]
}
```

`GET /projects/tasks?path=...` response:

```json
{
  "path": "/Users/eric/workspace/api-server",
  "tasks": ["bootRun", "test", "build", "clean", ":api:bootRun"]
}
```

`POST /projects/run` request:

```json
{
  "path": "/Users/eric/workspace/api-server",
  "task": "bootRun"
}
```

The IntelliJ plugin matches requests by canonical project path. If several
IntelliJ windows are open, the path decides the target. If the requested path is
not currently open, the endpoint returns `404` or `409`, and the Stream Deck
plugin falls back to iTerm.

Task execution should use IntelliJ's Gradle/external-system runner, not an
arbitrary shell command. The plugin should reject commands that are not Gradle
task strings. This keeps the IntelliJ side focused and reduces the blast radius
of the localhost API.

### iTerm Fallback

When IntelliJ is unavailable or the project is not open, the Stream Deck plugin
asks the existing bridge server to run a Gradle task in iTerm2.

Proposed bridge endpoint:

```text
POST /run/gradle/iterm
```

Request:

```json
{
  "cwd": "/Users/eric/workspace/api-server",
  "gradleCommand": "./gradlew",
  "task": "bootRun"
}
```

Behavior:

- validate that `cwd` exists and is a directory
- validate `gradleCommand` and `task` using the same restrictions as the
  launcher config
- construct the handoff from argv-style parts rather than concatenating an
  untrusted shell string; the visible iTerm command is equivalent to:
  `cd <cwd> && <gradleCommand> <task>`
- open a new iTerm2 tab/window and run the command
- return success once the command has been handed off

The bridge already owns iTerm2 integration, so fallback execution should live
there rather than duplicating iTerm control inside the Stream Deck plugin.

## Data Flow

Periodic refresh:

```text
Stream Deck launcher config
  + IntelliJ /projects
  + IntelliJ /projects/tasks for visible/open projects
      -> launcher-state
      -> launcher-action refreshAll()
      -> setImage() per slot
```

Task press:

```text
User presses task tile
  -> launcher-state resolves projectPath + task
  -> intellij-client checks project open
       -> open: POST IntelliJ /projects/run
       -> closed/offline: POST bridge /run/gradle/iterm
  -> Stream Deck tile shows immediate alert/success handoff feedback
```

Claude/Codex prompt interruption remains:

```text
launcher profile visible
  -> Claude/Codex pending item arrives
  -> existing ProfileSwitcher enters Claude Bridge or Codex Bridge
  -> answer/approve resolves item
  -> existing ProfileSwitcher returns to launcher profile
```

## Error Handling

- IntelliJ plugin offline:
  - project tiles show `iTerm`
  - task presses use iTerm fallback
- Project path missing on disk:
  - project tile shows a missing/error style
  - task press shows alert and does not run
- Project configured but not open in IntelliJ:
  - task press uses iTerm fallback
- Gradle task detection unavailable:
  - favorites still render
  - default candidates render if no favorites exist
- IntelliJ run request fails:
  - show Stream Deck alert
  - do not automatically fallback unless the failure is specifically "project
    not open" or "IntelliJ unavailable"
- iTerm fallback handoff fails:
  - show Stream Deck alert
  - leave the launcher page unchanged
- Bridge or IntelliJ polling errors:
  - keep the last known config
  - mark dynamic status stale/offline until the next successful refresh

## Testing

Stream Deck TypeScript tests:

- config parsing, defaults, and path canonicalization
- launcher page state for home, project detail, pagination, Back, Refresh
- open/closed project matching from IntelliJ `/projects`
- favorite task selection and default candidate fallback
- execution routing: IntelliJ when open, bridge/iTerm when closed
- renderer smoke tests for project, task, control, offline, and missing states
- existing Claude/Codex profile-switching tests remain unchanged

Python bridge tests:

- `/run/gradle/iterm` validates missing/invalid `cwd`
- command construction quotes cwd/task safely
- successful handoff calls an injected iTerm runner abstraction
- failure from the runner returns a clear error

IntelliJ plugin tests:

- path matching for multiple open projects
- only open project paths are runnable through IntelliJ
- task listing returns detected Gradle tasks when available
- Gradle run handler rejects missing project path or blank task

Manual e2e:

1. Install IntelliJ companion plugin.
2. Configure two projects in launcher JSON.
3. Open one project in IntelliJ and leave the other closed.
4. Open the Stream Deck `Dev Launcher` profile.
5. Verify the open project tile says `OPEN` and the closed project tile says
   `iTerm`.
6. Press `bootRun` for the open project; verify IntelliJ starts a Gradle run.
7. Press `bootRun` for the closed project; verify iTerm opens and runs Gradle.
8. Trigger a Codex permission prompt; verify Stream Deck switches to
   `Codex Bridge` and returns to `Dev Launcher` after approval.

## Risks and Mitigations

- IntelliJ plugin port conflict:
  - first version targets one IntelliJ IDEA process; if the port is occupied,
    the plugin should log clearly and Stream Deck falls back to iTerm.
- Dynamic Stream Deck folders are not reliable:
  - use app-managed pages drawn onto fixed slots instead.
- Gradle task detection can be incomplete:
  - favorites are explicit and manual tasks still render.
- Running arbitrary shell commands from localhost is risky:
  - IntelliJ endpoint runs only Gradle tasks for open projects.
  - iTerm fallback only runs configured project paths and Gradle task strings.
- Long-running task result state can become complex:
  - first version only confirms handoff. Live status/logs are a later feature.

## Implementation Notes

- Keep launcher code separate from Claude/Codex question code. Shared utilities
  such as image rendering helpers can be reused, but prompt state and launcher
  state should not be coupled.
- Use image rendering rather than Stream Deck titles for Korean text and dense
  status labels, matching the existing answer/question tile approach.
- The launcher profile should be optional. Existing users who only want
  Claude/Codex prompt profiles should not be forced into the new home profile.
- The IntelliJ API and iTerm fallback should return "handoff accepted" rather
  than pretending the Gradle task has completed.
