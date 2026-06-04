import streamDeck from "@elgato/streamdeck";
import { BridgeClient } from "./bridge-client.js";
import { ProfileSwitcher } from "./profile-switcher.js";
import { AnswerAction } from "./answer-action.js";
import { CancelAction } from "./cancel-action.js";

const PROFILE = "Claude Answers";
const URL = "ws://127.0.0.1:8787/ws";

const client = new BridgeClient(URL);

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
