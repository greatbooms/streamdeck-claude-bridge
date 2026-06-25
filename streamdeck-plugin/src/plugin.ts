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
import { parseLauncherConfig } from "./launcher-config.js";
import { LauncherState } from "./launcher-state.js";

const DEFAULT_PROFILE = "Claude Bridge";
const URL = "ws://127.0.0.1:8787/ws";

// SD 번들 Node 20 에는 전역 WebSocket 이 없으므로 'ws' 기반 팩토리를 주입한다.
const client = new BridgeClient(URL, (u) => new WebSocket(u) as unknown as WebSocketLike);
const intellijClient = new IntelliJClient();
const gradleBridgeClient = new GradleBridgeClient();
const launcherState = new LauncherState(parseLauncherConfig({ projects: [] }));

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

async function refreshLauncher(): Promise<void> {
  launcherState.applyIntelliJProjects(await intellijClient.projects());
  await launcherAction.refreshAll();
}

function refreshLauncherSafely(): void {
  void refreshLauncher().catch((err: unknown) => {
    streamDeck.logger.error(`Launcher refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}

const launcherAction = new LauncherAction(launcherState, {
  intellij: intellijClient,
  bridge: gradleBridgeClient,
  refresh: refreshLauncher,
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
setInterval(refreshLauncherSafely, 5000);
