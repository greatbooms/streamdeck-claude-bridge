// 질문 본문 표시 이미지(SVG) 생성.
// 본문을 '단어 단위'로 상단 5칸에 고르게 나눠 담는다. 각 칸은 완전한 단어들만
// 담아 글자가 칸 경계에서 잘리지 않고, 칸을 왼→오로 읽으면 원문이 순서대로 이어진다.
// 표시 전용이라 하단 코랄 바는 생략한다.

const BG = "#1a1714";
const TEXT = "#F1E9DD";
const CODEX_BG = "#0B0F14";
const CODEX_GREEN = "#10A37F";
const CODEX_TEXT = "#E6EDF3";

type Theme = "claude" | "codex";

function colors(theme: Theme): { bg: string; accent: string; text: string } {
  if (theme === "codex") return { bg: CODEX_BG, accent: CODEX_GREEN, text: CODEX_TEXT };
  return { bg: BG, accent: "", text: TEXT };
}

const CELL_W = 144;
const FS = 30; // 글자 크기
const LH = 36; // 줄 높이
const LEFT_PAD = 13;
const MAX_LINES = 3; // 칸당 최대 줄 수
const CELL_UNITS = 5.6; // 칸 한 줄에 들어가는 대략적 글자 폭(한글 기준) — 실측(칸당 ~6글자) 기준

function charUnits(ch: string): number {
  // ASCII 는 좁게, 한글 등은 넓게 (줄바꿈 폭 추정용)
  return ch.charCodeAt(0) < 128 ? 0.55 : 1.0;
}

function strUnits(s: string): number {
  let w = 0;
  for (const ch of s) w += charUnits(ch);
  return w;
}

/** 본문을 단어(공백 기준)로 나눠 cells 개의 칸에 누적 폭이 균등하도록 분배한다. */
export function distributeWords(text: string, cells: number): string[][] {
  const buckets: string[][] = Array.from({ length: cells }, () => []);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return buckets;
  const total = words.reduce((a, w) => a + strUnits(w), 0);
  const target = total / cells;
  let acc = 0;
  let c = 0;
  for (const w of words) {
    buckets[c].push(w);
    acc += strUnits(w);
    if (c < cells - 1 && acc >= target * (c + 1)) c++;
  }
  return buckets;
}

/** maxWidth 보다 넓은 단어를 글자 단위 조각으로 쪼갠다(긴 단어 안전장치). */
function charChunks(word: string, maxWidth: number): string[] {
  const out: string[] = [];
  let seg = "";
  let w = 0;
  for (const ch of word) {
    const cw = charUnits(ch);
    if (w + cw > maxWidth && seg) {
      out.push(seg);
      seg = "";
      w = 0;
    }
    seg += ch;
    w += cw;
  }
  if (seg) out.push(seg);
  return out;
}

/** 단어들을 칸 폭(maxWidth)에 맞춰 줄바꿈(단어 보존). maxLines 초과 시 마지막 줄 끝에 …. */
export function wrapWords(words: string[], maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const pieces = strUnits(word) > maxWidth ? charChunks(word, maxWidth) : [word];
    for (const w of pieces) {
      if (!cur) {
        cur = w;
        continue;
      }
      const candidate = cur + " " + w;
      if (strUnits(candidate) <= maxWidth) cur = candidate;
      else {
        lines.push(cur);
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = last.slice(0, Math.max(0, last.length - 1)) + "…";
    return kept;
  }
  return lines;
}

/** 특정 칸이 그릴 줄들. */
export function linesForCell(text: string, cellIndex: number, totalCells: number): string[] {
  const words = distributeWords(text, totalCells)[cellIndex] ?? [];
  return wrapWords(words, CELL_UNITS, MAX_LINES);
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
  );
}

/** 칸 하나의 SVG. 줄들을 세로 가운데 정렬해 왼쪽 정렬로 그린다. lines 가 비면 idle 배경만. */
export function cellSvg(lines: string[], theme: Theme = "claude"): string {
  const W = CELL_W;
  const H = CELL_W;
  const c = colors(theme);
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="${c.bg}"/>` +
    (c.accent ? `<rect x="14" y="12" width="${W - 28}" height="6" rx="3" fill="${c.accent}"/>` : "");
  let body = "";
  if (lines.length > 0) {
    const n = lines.length;
    const firstBaseline = H / 2 - ((n - 1) * LH) / 2 + FS * 0.32; // 세로 가운데
    body = lines
      .map(
        (ln, i) =>
          `<text x="${LEFT_PAD}" y="${Math.round(firstBaseline + i * LH)}" text-anchor="start" ` +
          `font-family="Helvetica,Arial,sans-serif" font-size="${FS}" font-weight="600" ` +
          `fill="${c.text}">${escapeXml(ln)}</text>`,
      )
      .join("");
  }
  return head + body + "</svg>";
}

/** Stream Deck setImage 용 data URI. */
export function questionImageDataUri(
  text: string,
  cellIndex: number,
  totalCells: number,
  theme: Theme = "claude",
): string {
  const svg = cellSvg(linesForCell(text, cellIndex, totalCells), theme);
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}
