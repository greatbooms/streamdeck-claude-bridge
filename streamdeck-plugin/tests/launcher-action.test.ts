import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@elgato/utils";
import { LauncherActionCore } from "../src/launcher-action-core.js";
import { LauncherState } from "../src/launcher-state.js";
import type { LauncherConfig } from "../src/launcher-types.js";

type SendToPluginEvent = Parameters<LauncherActionCore["onSendToPlugin"]>[0];

interface FakeAction {
  getSettings: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
}

const config: LauncherConfig = {
  projects: [
    {
      name: "API",
      path: "/repo/api",
      gradleCommand: "./gradlew",
      favorites: ["bootRun"],
      npmOrder: ["dev", "test"],
    },
    {
      name: "Admin",
      path: "/repo/admin",
      gradleCommand: "./gradlew",
      favorites: [],
      npmOrder: ["start", "build"],
    },
  ],
};

function createFakeAction(settings: Record<string, JsonValue> = {}): FakeAction {
  let currentSettings = settings;
  return {
    getSettings: vi.fn(async () => currentSettings),
    setSettings: vi.fn(async (next: Record<string, JsonValue>) => {
      currentSettings = next;
    }),
  };
}

function sendEvent(action: FakeAction, payload: JsonValue): SendToPluginEvent {
  return { action, payload } as unknown as SendToPluginEvent;
}

function createHarness(options: {
  refresh?: () => Promise<void>;
  saveProjectPreferences?: (projectPath: string, preferences: { favorites: string[]; npmOrder: string[] }) => Promise<{ error: string | null }>;
} = {}): {
  action: LauncherActionCore;
  refresh: ReturnType<typeof vi.fn>;
  saveProjectPreferences: ReturnType<typeof vi.fn> | undefined;
  sent: JsonValue[];
} {
  const sent: JsonValue[] = [];
  const refresh = vi.fn(options.refresh ?? (async () => {}));
  const saveProjectPreferences = options.saveProjectPreferences
    ? vi.fn(options.saveProjectPreferences)
    : undefined;
  return {
    action: new LauncherActionCore(new LauncherState(config), {
      intellij: { runGradle: vi.fn(), runNpm: vi.fn() },
      bridge: { runGradleInIterm: vi.fn(), runNpmInIterm: vi.fn() },
      refresh,
      saveProjectPreferences,
      sendToPropertyInspector: async (payload) => {
        sent.push(payload);
      },
    }),
    refresh,
    saveProjectPreferences,
    sent,
  };
}

describe("LauncherAction property inspector messages", () => {
  it("sends an editor error for invalid payloads", async () => {
    const { action, sent } = createHarness();
    const fakeAction = createFakeAction();

    await action.onSendToPlugin(sendEvent(fakeAction, { type: "unknown" }));

    expect(sent).toEqual([{ type: "launcherEditorError", error: "Invalid launcher editor request" }]);
  });

  it("refresh without projectPath uses persisted settings projectPath", async () => {
    const { action, refresh, sent } = createHarness();
    const fakeAction = createFakeAction({ projectPath: "/repo/admin" });

    await action.onSendToPlugin(sendEvent(fakeAction, { type: "launcherEditorRefresh" }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "launcherEditorSnapshot",
      selectedPath: "/repo/admin",
      status: "Refreshed",
      error: null,
    });
  });

  it("save success persists projectPath, refreshes, and emits a Saved snapshot", async () => {
    const { action, refresh, saveProjectPreferences, sent } = createHarness({
      saveProjectPreferences: async () => ({ error: null }),
    });
    const fakeAction = createFakeAction({ slot: 3 });

    await action.onSendToPlugin(sendEvent(fakeAction, {
      type: "saveProjectPreferences",
      projectPath: "/repo/admin",
      favorites: ["bootRun"],
      npmOrder: ["start"],
    }));

    expect(saveProjectPreferences).toHaveBeenCalledWith("/repo/admin", {
      favorites: ["bootRun"],
      npmOrder: ["start"],
    });
    expect(fakeAction.setSettings).toHaveBeenCalledWith({ slot: 3, projectPath: "/repo/admin" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "launcherEditorSnapshot",
      selectedPath: "/repo/admin",
      status: "Saved",
      error: null,
    });
  });

  it("save error emits an error snapshot and does not persist projectPath", async () => {
    const { action, refresh, sent } = createHarness({
      saveProjectPreferences: async () => ({ error: "Project is not configured: /repo/admin" }),
    });
    const fakeAction = createFakeAction({ slot: 3 });

    await action.onSendToPlugin(sendEvent(fakeAction, {
      type: "saveProjectPreferences",
      projectPath: "/repo/admin",
      favorites: ["bootRun"],
      npmOrder: ["start"],
    }));

    expect(fakeAction.setSettings).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "launcherEditorSnapshot",
      selectedPath: "/repo/admin",
      status: null,
      error: "Project is not configured: /repo/admin",
    });
  });

  it("refresh failure emits an editor error response", async () => {
    const { action, sent } = createHarness({
      refresh: async () => {
        throw new Error("IntelliJ unavailable");
      },
    });
    const fakeAction = createFakeAction({ projectPath: "/repo/admin" });

    await expect(action.onSendToPlugin(sendEvent(fakeAction, { type: "launcherEditorRefresh" }))).resolves.toBeUndefined();

    expect(sent).toEqual([{ type: "launcherEditorError", error: "IntelliJ unavailable" }]);
  });

  it("save refresh failure emits an editor error response", async () => {
    const { action, sent } = createHarness({
      refresh: async () => {
        throw new Error("Refresh failed after save");
      },
      saveProjectPreferences: async () => ({ error: null }),
    });
    const fakeAction = createFakeAction();

    await expect(action.onSendToPlugin(sendEvent(fakeAction, {
      type: "saveProjectPreferences",
      projectPath: "/repo/admin",
      favorites: ["bootRun"],
      npmOrder: ["start"],
    }))).resolves.toBeUndefined();

    expect(fakeAction.setSettings).toHaveBeenCalledWith({ projectPath: "/repo/admin" });
    expect(sent).toEqual([{ type: "launcherEditorError", error: "Refresh failed after save" }]);
  });
});
