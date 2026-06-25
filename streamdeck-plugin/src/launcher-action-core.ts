import {
  SingletonAction,
  type KeyAction, type KeyDownEvent, type PropertyInspectorDidAppearEvent, type SendToPluginEvent, type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { runLauncherCommand, type BridgeRunClient, type IntelliJRunClient } from "./gradle-bridge-client.js";
import { parseLauncherEditorRequest, type LauncherEditorResponse } from "./launcher-editor.js";
import { launcherCommandErrorMessage } from "./launcher-error.js";
import { launcherImageDataUri } from "./launcher-image.js";
import { LauncherState } from "./launcher-state.js";
import type { LauncherProjectPreferences, LauncherSlot } from "./launcher-types.js";

export interface LauncherSettings {
  slot?: number;
  projectPath?: string;
  [key: string]: JsonValue;
}

export interface LauncherDeps {
  intellij: IntelliJRunClient;
  bridge: BridgeRunClient;
  refresh: () => Promise<void>;
  saveProjectPreferences?: (projectPath: string, preferences: LauncherProjectPreferences) => Promise<{ error: string | null }>;
  sendToPropertyInspector?: (payload: JsonValue) => Promise<void>;
  log?: (message: string) => void;
}

export class LauncherActionCore extends SingletonAction<LauncherSettings> {
  constructor(
    private state: LauncherState,
    private deps: LauncherDeps,
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
    const slot = this.slotFromSettings(ev.payload.settings);
    const model = this.state.slots()[slot] ?? { kind: "empty" as const };
    try {
      await this.handle(model);
      await this.refreshAll();
    } catch (err: unknown) {
      this.deps.log?.(launcherCommandErrorMessage(err));
      await ev.action.showAlert();
    }
  }

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
      const settings = await ev.action.getSettings<LauncherSettings>();
      await this.refreshEditor(request.projectPath ?? settings.projectPath, "Refreshed");
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
    await this.refreshEditor(request.projectPath, "Saved");
  }

  async refreshAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      const settings = await a.getSettings<LauncherSettings>();
      await this.refresh(a, this.slotFromSettings(settings));
    }
  }

  hasVisibleKeys(): boolean {
    for (const a of this.actions) {
      if (a.isKey()) return true;
    }
    return false;
  }

  private async handle(slot: LauncherSlot): Promise<void> {
    if (slot.kind === "project") {
      this.state.openProject(slot.path);
      await this.deps.refresh();
      return;
    }
    if (slot.kind === "control" && slot.action === "back") {
      this.state.back();
      return;
    }
    if (slot.kind === "control" && slot.action === "refresh") {
      await this.deps.refresh();
      return;
    }
    if (slot.kind === "command") {
      await runLauncherCommand(slot.command, this.deps);
    }
  }

  private async refresh(a: KeyAction<LauncherSettings>, slot: number): Promise<void> {
    await a.setImage(launcherImageDataUri(this.state.slots()[slot] ?? { kind: "empty" }));
  }

  private async sendEditorSnapshot(selectedPath?: string, status: string | null = null, error: string | null = null): Promise<void> {
    const snapshot = arguments.length >= 3
      ? this.state.editorSnapshot(selectedPath, status, error)
      : this.state.editorSnapshot(selectedPath, status);
    await this.sendToPropertyInspector({
      type: "launcherEditorSnapshot",
      ...snapshot,
    });
  }

  private async sendEditorError(error: string): Promise<void> {
    await this.sendToPropertyInspector({ type: "launcherEditorError", error });
  }

  private async refreshEditor(selectedPath: string | undefined, status: string): Promise<void> {
    try {
      await this.deps.refresh();
    } catch (err: unknown) {
      this.deps.log?.(`Launcher editor refresh failed: ${this.errorMessage(err)}`);
      await this.sendEditorError(this.errorMessage(err));
      return;
    }
    await this.sendEditorSnapshot(selectedPath, status);
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private async sendToPropertyInspector(payload: LauncherEditorResponse): Promise<void> {
    if (!this.deps.sendToPropertyInspector) return;
    await this.deps.sendToPropertyInspector(payload as unknown as JsonValue);
  }

  private slotFor(ev: WillAppearEvent<LauncherSettings>): number {
    if ("coordinates" in ev.payload && ev.payload.coordinates) {
      return ev.payload.coordinates.row * 5 + ev.payload.coordinates.column;
    }
    return this.slotFromSettings(ev.payload.settings);
  }

  private slotFromSettings(settings: LauncherSettings): number {
    const slot = Number(settings.slot ?? 0);
    return Number.isInteger(slot) && slot >= 0 ? slot : 0;
  }
}
