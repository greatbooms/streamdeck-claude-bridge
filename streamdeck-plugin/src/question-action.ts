import {
  action, SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import type { KeyAction } from "@elgato/streamdeck";
import type { BridgeClient } from "./bridge-client.js";
import { questionImageDataUri } from "./question-image.js";

const TOTAL_CELLS = 5; // 상단 줄 칸 수

interface QuestionSettings {
  column?: number;
  [key: string]: JsonValue;
}

/**
 * 표시 전용 액션. 상단 줄 각 칸이 자기 column 에 해당하는 질문 본문 조각을 그린다.
 * 누르면 아무 동작도 하지 않는다(질문은 Answer/Cancel 로만 처리).
 */
@action({ UUID: "com.shinsanghoon.claude-bridge.question" })
export class QuestionAction extends SingletonAction<QuestionSettings> {
  constructor(private client: BridgeClient) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<QuestionSettings>): Promise<void> {
    if (!ev.action.isKey()) return;
    const col =
      "coordinates" in ev.payload && ev.payload.coordinates
        ? ev.payload.coordinates.column
        : (ev.payload.settings.column ?? 0);
    // refreshAll 이 좌표 없이도 칸을 알 수 있도록 settings 에 저장.
    if (ev.payload.settings.column !== col) {
      await ev.action.setSettings({ ...ev.payload.settings, column: col });
    }
    await this.render(ev.action, col);
  }

  /** 활성 질문이 바뀌면 보이는 모든 질문 칸을 다시 그린다. */
  async refreshAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      const settings = await a.getSettings<QuestionSettings>();
      await this.render(a, Number(settings.column ?? 0) || 0);
    }
  }

  private async render(a: KeyAction<QuestionSettings>, column: number): Promise<void> {
    const text = this.client.state.questionText();
    if (!text) {
      await a.setImage(questionImageDataUri("", column, TOTAL_CELLS));
      return;
    }
    await a.setImage(questionImageDataUri(text, column, TOTAL_CELLS));
  }
}
