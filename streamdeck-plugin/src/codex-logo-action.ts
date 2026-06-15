import { action, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

const BG = "#0B0F14";
const GREEN = "#10A37F";
const TEXT = "#E6EDF3";

function logoSvg(): string {
  const W = 144;
  const H = 144;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="${BG}"/>` +
    `<rect x="20" y="22" width="${W - 40}" height="7" rx="3" fill="${GREEN}"/>` +
    `<text x="${W / 2}" y="78" text-anchor="middle" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="800" ` +
    `fill="${TEXT}">CODEX</text>` +
    `<text x="${W / 2}" y="108" text-anchor="middle" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="700" ` +
    `fill="${GREEN}">PERMIT</text>` +
    `</svg>`
  );
}

function logoDataUri(): string {
  return "data:image/svg+xml;base64," + Buffer.from(logoSvg(), "utf8").toString("base64");
}

@action({ UUID: "com.shinsanghoon.claude-bridge.codex-logo" })
export class CodexLogoAction extends SingletonAction {
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) return;
    await ev.action.setImage(logoDataUri());
  }
}
