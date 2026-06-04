import {
  action, SingletonAction,
  type WillAppearEvent, type KeyDownEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import type { KeyAction } from "@elgato/streamdeck";
import type { BridgeClient } from "./bridge-client.js";
import { answerImageDataUri } from "./answer-image.js";

interface AnswerSettings {
  optionIndex?: number;
  [key: string]: JsonValue;
}

@action({ UUID: "com.shinsanghoon.claude-bridge.answer" })
export class AnswerAction extends SingletonAction<AnswerSettings> {
  constructor(private client: BridgeClient) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<AnswerSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if (ev.action.isKey()) {
      await this.refresh(ev.action, settings);
    }
  }

  override async onKeyDown(ev: KeyDownEvent<AnswerSettings>): Promise<void> {
    const index = Number(ev.payload.settings.optionIndex ?? 0) || 0;
    const session = this.client.state.activeSession();
    if (!session || index < 1 || this.client.state.isMultiSelect()) {
      await ev.action.showAlert();
      return;
    }
    this.client.answer(session, index);
  }

  /** 활성 질문이 바뀌면 화면에 보이는 모든 답변 버튼의 제목을 갱신한다. */
  async refreshAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      const settings = await a.getSettings<AnswerSettings>();
      await this.refresh(a, settings);
    }
  }

  private async refresh(a: KeyAction<AnswerSettings>, settings: AnswerSettings): Promise<void> {
    const index = Number(settings.optionIndex ?? 0) || 0;
    const label = index >= 1 ? this.client.state.labelFor(index) : null;
    // 좌측 정렬 + 자동 줄바꿈을 위해 제목 대신 SVG 이미지로 렌더한다.
    await a.setImage(answerImageDataUri(label));
  }
}
