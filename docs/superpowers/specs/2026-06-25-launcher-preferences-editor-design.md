# Launcher Preferences Editor Design

Date: 2026-06-25
Status: design approved by user, pending implementation plan

## Goal

Add a Stream Deck Property Inspector editor for the Dev Launcher so the user can
edit command ordering without manually opening `launcher.json`.

The editor covers:

- Gradle favorites, such as `bootRun`, `test`, and `build`
- npm script ordering, such as `start:dev`, `dev`, `build`, and `lint`

The existing launcher remains the runtime surface. The Property Inspector is
only the configuration surface.

## Scope

Supported first version:

- Editing from the Stream Deck app by selecting any `Project Launcher Tile`.
- Project selection from the known launcher project list.
- Line-based editing for Gradle favorites and npm order.
- Saving to the existing launcher config file:
  `~/Library/Application Support/streamdeck-claude-bridge/launcher.json`.
- Immediate refresh of launcher tiles after a successful save.
- Validation errors shown in the Property Inspector without corrupting the
  existing config.

Out of scope for the first version:

- Drag-and-drop ordering inside the Property Inspector.
- Editing project names, paths, or `gradleCommand`.
- Creating or deleting projects from the Stream Deck app.
- Tracking actual run frequency or automatically reordering commands based on
  usage history.
- Stop/restart controls for running Gradle or npm processes.

## User Experience

When the user selects a `Project Launcher Tile` in the Stream Deck app, the
right-side Property Inspector opens a launcher editor.

The editor shows:

- A project dropdown.
- A read-only project path for confirmation.
- A `Gradle favorites` multiline field, one task per line.
- An `npm order` multiline field, one script per line.
- `Save` and `Refresh` controls.
- A small status/error message.

The first version uses text fields rather than checkboxes or draggable rows.
This keeps the implementation reliable inside Stream Deck's constrained
Property Inspector environment while still removing the need to hand-edit JSON.

Saving applies the selected project's settings only. Other projects in
`launcher.json` are preserved.

## Config Shape

The existing per-project `favorites` field remains the Gradle ordering source.
A new per-project `npmOrder` field is added for npm script ordering.

```json
{
  "projects": [
    {
      "name": "grip-server",
      "path": "/Users/eric/workspace/grip-server",
      "gradleCommand": "./gradlew",
      "favorites": ["bootRun", "test", "build"],
      "npmOrder": ["start:dev", "dev", "build", "lint"]
    }
  ]
}
```

Rules:

- `favorites` accepts Gradle task identifiers already supported by the launcher,
  including qualified tasks such as `:api:bootRun`.
- `npmOrder` accepts npm script names from `package.json`.
- Empty lines are ignored.
- Duplicate entries are collapsed, keeping the first occurrence.
- Invalid Gradle task strings reject the save.
- Invalid npm script strings reject the save.
- Missing `npmOrder` defaults to the existing preferred npm order:
  `start:dev`, `dev`, `start`, `test`, `build`, `lint`.

The parser remains backward compatible with current config files that do not
include `npmOrder`.

## Runtime Ordering

Gradle ordering:

1. Configured `favorites`
2. Detected IntelliJ Gradle tasks not already listed
3. Default Gradle tasks only when neither favorites nor detected tasks exist

npm ordering:

1. Configured `npmOrder`
2. Remaining detected `package.json` scripts sorted alphabetically

For mixed Gradle/npm projects, Gradle commands still appear before npm commands.
Existing launcher labels are preserved: npm scripts are labeled as `npm <script>`
when the project also has Gradle commands.

## Architecture

The implementation stays inside `streamdeck-plugin/`.

### Manifest

Add `PropertyInspectorPath: "ui/launcher.html"` to the
`com.shinsanghoon.claude-bridge.launcher` action.

### Config Model

Extend `LauncherProject` with:

```ts
npmOrder: string[];
```

Update config parsing to validate and default the new field. Keep the existing
`favorites` behavior unchanged for old config files.

### Config Store

Introduce a small config store module responsible for:

- Loading `launcher.json`.
- Writing updated config atomically.
- Creating the parent app-support directory when needed.
- Returning user-facing error messages without throwing raw filesystem errors
  into the UI.

The existing plugin startup path can keep using the same loader, but save
operations go through the store so writes are isolated and testable.

### Launcher State

`LauncherState` remains responsible for combining config, IntelliJ state,
detected tasks, current page, and slot rendering.

It gains read-only editor snapshot helpers so the Property Inspector can render:

- configured projects
- selected project settings
- detected npm scripts for that project when available
- detected Gradle tasks for the current project when available

It does not write files directly.

### Launcher Action

`LauncherAction` handles Property Inspector messages:

- On inspector appear, send the current editor snapshot.
- On `refresh`, reload project status and send a new snapshot.
- On `saveProjectPreferences`, validate and persist the selected project's
  Gradle favorites and npm order.
- After a successful save, reload launcher state and refresh all visible keys.
- On failure, send an error payload back to the inspector.

The key-press runtime behavior remains unchanged.

### Property Inspector UI

Create `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/ui/launcher.html`.

The page uses a small inline script that connects to Stream Deck's Property
Inspector WebSocket directly. It sends typed messages to the plugin and renders
responses from `sendToPropertyInspector`.

The UI should not depend on external CDN assets. This avoids failure when the
Property Inspector is offline or the Stream Deck app blocks remote content.

## Message Contract

Property Inspector to plugin:

```ts
type LauncherEditorRequest =
  | { type: "launcherEditorReady" }
  | { type: "launcherEditorRefresh"; projectPath?: string }
  | {
      type: "saveProjectPreferences";
      projectPath: string;
      favorites: string[];
      npmOrder: string[];
    };
```

Plugin to Property Inspector:

```ts
type LauncherEditorResponse =
  | {
      type: "launcherEditorSnapshot";
      selectedPath: string | null;
      projects: Array<{
        name: string;
        path: string;
        favorites: string[];
        npmOrder: string[];
        detectedGradleTasks: string[];
        detectedNpmScripts: string[];
      }>;
      status: string | null;
      error: string | null;
    }
  | { type: "launcherEditorError"; error: string };
```

## Error Handling

Validation errors are shown in the Property Inspector and do not overwrite the
config file.

Filesystem write failures are logged by the plugin and surfaced as concise UI
messages. The previous in-memory launcher state remains active until a valid
config is loaded.

If `launcher.json` is malformed on startup, the existing launcher config error
tile still appears. The editor can still show that config load failed, but it
does not attempt an automatic repair.

## Testing

TypeScript tests cover:

- Config parsing defaults `npmOrder` for old files.
- Config parsing accepts and validates `npmOrder`.
- npm ordering uses configured `npmOrder` before alphabetic leftovers.
- `LauncherState` exposes editor snapshots without mutating runtime slot state.
- Saving project preferences updates only the selected project.
- Manifest declares `ui/launcher.html` for the launcher action.
- The launcher Property Inspector file is packaged.

Manual verification covers:

- Select a launcher tile in the Stream Deck app and confirm the editor appears.
- Edit Gradle favorites, save, and confirm launcher tile ordering changes.
- Edit npm order, save, and confirm npm script ordering changes.
- Enter an invalid Gradle task or npm script and confirm the UI shows an error
  while the previous config remains intact.
