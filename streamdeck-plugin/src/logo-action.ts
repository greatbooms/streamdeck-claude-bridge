import { action, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

const BG = "#1a1714";
const CORAL = "#D97757";
const TEXT = "#F1E9DD";

/**
 * 한 칸짜리 브랜드 타일: ✻ 아이콘 + "CLAUDE CODE" 텍스트.
 * 표시 전용이라 누르면 아무 동작도 하지 않는다.
 */
function logoSvg(): string {
  const W = 144;
  const H = 144;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="${BG}"/>` +
    `<text x="${W / 2}" y="64" text-anchor="middle" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="48" fill="${CORAL}">✻</text>` +
    `<text x="${W / 2}" y="98" text-anchor="middle" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="17" font-weight="700" ` +
    `fill="${TEXT}">CLAUDE</text>` +
    `<text x="${W / 2}" y="120" text-anchor="middle" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="17" font-weight="700" ` +
    `fill="${TEXT}">CODE</text>` +
    `</svg>`
  );
}

function logoDataUri(): string {
  return "data:image/svg+xml;base64," + Buffer.from(logoSvg(), "utf8").toString("base64");
}

@action({ UUID: "com.shinsanghoon.claude-bridge.logo" })
export class LogoAction extends SingletonAction {
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) return;
    await ev.action.setImage(logoDataUri());
  }
}
