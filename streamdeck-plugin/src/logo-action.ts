import { action, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 번들된 plugin.js 는 .sdPlugin/bin/ 에 위치 → 이미지는 ../imgs/banner.
const HERE = dirname(fileURLToPath(import.meta.url));

function tileDataUri(tile: number): string {
  const p = join(HERE, "..", "imgs", "banner", `${tile}@2x.png`);
  const b64 = readFileSync(p).toString("base64");
  return `data:image/png;base64,${b64}`;
}

/**
 * 표시 전용 액션. 첫 줄 5칸에 하나씩 떨어뜨리면, 각 버튼이 자기 '열(column)'에
 * 해당하는 배너 조각을 자동으로 띄워 줄 전체가 ✻ CLAUDE CODE 배너로 채워진다.
 * 눌러도 아무 동작도 하지 않는다.
 */
@action({ UUID: "com.shinsanghoon.claude-bridge.logo" })
export class LogoAction extends SingletonAction {
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) return;
    const col =
      "coordinates" in ev.payload && ev.payload.coordinates
        ? ev.payload.coordinates.column
        : 0;
    const tile = (((col % 5) + 5) % 5) + 1; // 0-based 열 → 1..5 조각
    await ev.action.setImage(tileDataUri(tile));
  }
}
