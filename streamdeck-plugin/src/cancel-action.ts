import { action, SingletonAction, type KeyDownEvent } from "@elgato/streamdeck";
import type { BridgeClient } from "./bridge-client.js";

@action({ UUID: "com.shinsanghoon.claude-bridge.cancel" })
export class CancelAction extends SingletonAction {
  constructor(private client: BridgeClient) {
    super();
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    const session = this.client.state.activeSession();
    if (session) this.client.cancel(session);
  }
}
