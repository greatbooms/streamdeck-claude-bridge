import {
  action, SingletonAction,
  type KeyAction, type KeyDownEvent, type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { runLauncherCommand, type BridgeRunClient, type IntelliJRunClient } from "./gradle-bridge-client.js";
import { launcherImageDataUri } from "./launcher-image.js";
import { LauncherState } from "./launcher-state.js";
import type { LauncherSlot } from "./launcher-types.js";

interface LauncherSettings {
  slot?: number;
  [key: string]: JsonValue;
}

interface LauncherDeps {
  intellij: IntelliJRunClient;
  bridge: BridgeRunClient;
  refresh: () => Promise<void>;
}

@action({ UUID: "com.shinsanghoon.claude-bridge.launcher" })
export class LauncherAction extends SingletonAction<LauncherSettings> {
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
    } catch {
      await ev.action.showAlert();
    }
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
