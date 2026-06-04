import streamDeck from "@elgato/streamdeck";
import WebSocket from "ws";
import { BridgeClient, type WebSocketLike } from "./bridge-client.js";
import { ProfileSwitcher } from "./profile-switcher.js";
import { AnswerAction } from "./answer-action.js";
import { CancelAction } from "./cancel-action.js";

const PROFILE = "Claude Answers";
const URL = "ws://127.0.0.1:8787/ws";

// SD 번들 Node 20 에는 전역 WebSocket 이 없으므로 'ws' 기반 팩토리를 주입한다.
const client = new BridgeClient(URL, (u) => new WebSocket(u) as unknown as WebSocketLike);

function firstDeviceId(): string | null {
  for (const d of streamDeck.devices) {
    if (d.isConnected) return d.id;
  }
  return null;
}

const switcher = new ProfileSwitcher(
  { switchToProfile: (id, name) => streamDeck.profiles.switchToProfile(id, name) },
  firstDeviceId,
  PROFILE,
);

const answerAction = new AnswerAction(client);
const cancelAction = new CancelAction(client);

client.onChange(() => {
  const active = client.state.activeSession();
  if (active) void switcher.enter();
  else void switcher.leave();
  void answerAction.refreshAll();
});

streamDeck.actions.registerAction(answerAction);
streamDeck.actions.registerAction(cancelAction);
streamDeck.connect();
client.start();
