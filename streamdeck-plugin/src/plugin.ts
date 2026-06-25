import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import streamDeck from "@elgato/streamdeck";
import WebSocket from "ws";
import { BridgeClient, type WebSocketLike } from "./bridge-client.js";
import { ProfileSwitcher } from "./profile-switcher.js";
import { AnswerAction } from "./answer-action.js";
import { CancelAction } from "./cancel-action.js";
import { LogoAction } from "./logo-action.js";
import { QuestionAction } from "./question-action.js";
import { CodexLogoAction } from "./codex-logo-action.js";
import { syncDeckState } from "./plugin-sync.js";
import { GradleBridgeClient } from "./gradle-bridge-client.js";
import { IntelliJClient } from "./intellij-client.js";
import { LauncherAction } from "./launcher-action.js";
import { loadLauncherConfigFromText, parseLauncherConfig } from "./launcher-config.js";
import { LAUNCHER_REFRESH_INTERVAL_MS } from "./launcher-refresh-policy.js";
import { LauncherState } from "./launcher-state.js";
import type { LauncherConfig } from "./launcher-types.js";
import { detectProjectCapabilities } from "./project-detector.js";

const DEFAULT_PROFILE = "Claude Bridge";
const URL = "ws://127.0.0.1:8787/ws";

// SD 번들 Node 20 에는 전역 WebSocket 이 없으므로 'ws' 기반 팩토리를 주입한다.
const client = new BridgeClient(URL, (u) => new WebSocket(u) as unknown as WebSocketLike);
const intellijClient = new IntelliJClient();
const gradleBridgeClient = new GradleBridgeClient();

interface LauncherConfigLoad {
  config: LauncherConfig;
  error: string | null;
}

const initialLauncherConfig = loadLauncherConfig();
const launcherState = new LauncherState(initialLauncherConfig.config);
launcherState.setConfigError(initialLauncherConfig.error);

function launcherConfigPath(): string {
  return path.join(os.homedir(), "Library", "Application Support", "streamdeck-claude-bridge", "launcher.json");
}

function emptyLauncherConfig(): LauncherConfig {
  return parseLauncherConfig({ projects: [] });
}

function loadLauncherConfig(): LauncherConfigLoad {
  try {
    return { config: loadLauncherConfigFromText(fs.readFileSync(launcherConfigPath(), "utf8")), error: null };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { config: emptyLauncherConfig(), error: null };
    const message = err instanceof Error ? err.message : String(err);
    const error = `launcher.json: ${message}`;
    streamDeck.logger.error(`Launcher config load failed at ${launcherConfigPath()}: ${message}`);
    return { config: emptyLauncherConfig(), error };
  }
}

function firstDeviceId(): string | null {
  // 번들 프로파일은 DeviceType 0(표준 Stream Deck)용이므로 그 타입의 연결된 기기를 우선 선택.
  // (Mobile/가상 데크 등 다른 타입을 고르면 switchToProfile 이 타임아웃됨.)
  let fallback: string | null = null;
  for (const d of streamDeck.devices) {
    if (!d.isConnected) continue;
    if (fallback === null) fallback = d.id;
    if (Number(d.type) === 0) return d.id;
  }
  return fallback;
}

const switcher = new ProfileSwitcher(
  { switchToProfile: (id, name) => streamDeck.profiles.switchToProfile(id, name) },
  firstDeviceId,
  DEFAULT_PROFILE,
  (m) => streamDeck.logger.info(m),
);

const answerAction = new AnswerAction(client);
const cancelAction = new CancelAction(client);
const questionAction = new QuestionAction(client);
let launcherRefreshInFlight = false;

async function refreshLauncher(): Promise<void> {
  const configLoad = loadLauncherConfig();
  launcherState.applyConfig(configLoad.config);
  launcherState.setConfigError(configLoad.error);
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

function refreshLauncherSafely(): void {
  if (!launcherAction.hasVisibleKeys() || launcherRefreshInFlight) return;
  launcherRefreshInFlight = true;
  void refreshLauncher()
    .catch((err: unknown) => {
      streamDeck.logger.error(`Launcher refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      launcherRefreshInFlight = false;
    });
}

const launcherAction = new LauncherAction(launcherState, {
  intellij: intellijClient,
  bridge: gradleBridgeClient,
  refresh: refreshLauncher,
  log: (m) => streamDeck.logger.error(m),
});

client.onChange(() => {
  void syncDeckState({
    active: client.state.active(),
    switcher,
    answerAction,
    questionAction,
    log: (m) => streamDeck.logger.error(m),
  });
});

streamDeck.actions.registerAction(answerAction);
streamDeck.actions.registerAction(cancelAction);
streamDeck.actions.registerAction(questionAction);
streamDeck.actions.registerAction(launcherAction);
streamDeck.actions.registerAction(new LogoAction());
streamDeck.actions.registerAction(new CodexLogoAction());
streamDeck.connect();
client.start();
refreshLauncherSafely();
setInterval(refreshLauncherSafely, LAUNCHER_REFRESH_INTERVAL_MS);
