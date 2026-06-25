import type { LauncherSlot } from "./launcher-types.js";

function escapeXml(text: string): string {
  return text.replace(
    /[<>&'"]/g,
    (ch) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch] as string,
  );
}

function colors(slot: LauncherSlot): { bg: string; fg: string; sub: string } {
  if (slot.kind === "project" && slot.status === "OPEN") {
    return { bg: "#0f766e", fg: "#ffffff", sub: "#ccfbf1" };
  }
  if (slot.kind === "project" && slot.status === "MISSING") {
    return { bg: "#7f1d1d", fg: "#ffffff", sub: "#fecaca" };
  }
  if (slot.kind === "project") {
    return { bg: "#374151", fg: "#ffffff", sub: "#d1d5db" };
  }
  if (slot.kind === "task" && slot.status === "OPEN") {
    return { bg: "#1d4ed8", fg: "#ffffff", sub: "#dbeafe" };
  }
  if (slot.kind === "task") {
    return { bg: "#713f12", fg: "#ffffff", sub: "#fde68a" };
  }
  if (slot.kind === "control") {
    return { bg: "#111827", fg: "#ffffff", sub: "#9ca3af" };
  }
  if (slot.kind === "message") {
    return { bg: "#7f1d1d", fg: "#ffffff", sub: "#fecaca" };
  }
  return { bg: "#050505", fg: "#666666", sub: "#444444" };
}

function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function title(slot: LauncherSlot): string {
  if (slot.kind === "project") return slot.label;
  if (slot.kind === "task") return slot.task;
  if (slot.kind === "control") return slot.label;
  if (slot.kind === "message") return slot.label;
  return "";
}

function footer(slot: LauncherSlot): string {
  if (slot.kind === "project") return slot.status;
  if (slot.kind === "task") return slot.status;
  if (slot.kind === "control") return slot.action;
  if (slot.kind === "message") return slot.detail;
  return "";
}

export function launcherImageDataUri(slot: LauncherSlot): string {
  const c = colors(slot);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
    `<rect x="2" y="2" width="140" height="140" rx="16" fill="${c.bg}"/>` +
    `<text x="72" y="58" fill="${c.fg}" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="22" font-weight="700" text-anchor="middle">${escapeXml(fit(title(slot), 12))}</text>` +
    `<text x="72" y="96" fill="${c.sub}" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="17" text-anchor="middle">${escapeXml(fit(footer(slot), 14))}</text>` +
    `</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}
