// 답변 버튼 이미지(SVG) 생성: 선택지 라벨을 '왼쪽 정렬 + 자동 줄바꿈'으로 그린다.
// Stream Deck 의 setTitle 은 가로정렬이 항상 가운데라, 좌측정렬을 위해 이미지로 렌더한다.

const BG = "#1a1714";
const CORAL = "#D97757";
const TEXT = "#F1E9DD";

function charUnits(ch: string): number {
  // ASCII 는 좁게, 한글 등은 넓게 (줄바꿈 폭 추정용)
  return ch.charCodeAt(0) < 128 ? 0.55 : 1.0;
}

/** 라벨을 폭(maxWidth 단위) 기준으로 줄바꿈. 최대 maxLines 줄, 넘치면 마지막 줄 끝에 …. */
export function wrapLabel(label: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  let w = 0;
  for (const ch of label) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      w = 0;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
      continue;
    }
    const cw = charUnits(ch);
    if (w + cw > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = "";
      w = 0;
      if (lines.length >= maxLines) break;
    }
    cur += ch;
    w += cw;
  }
  if (cur.length > 0 && lines.length < maxLines) lines.push(cur);
  // 원문이 다 안 들어갔으면 마지막 줄 끝에 … 붙임
  const used = lines.join("").length;
  if (used < label.replace(/\n/g, "").length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.slice(0, Math.max(0, last.length - 1)) + "…";
  }
  return lines;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
  );
}

/** 버튼 SVG 문자열. label 이 비면 텍스트 없는 idle 배경만. */
export function answerSvg(label: string | null): string {
  const W = 144;
  const H = 144;
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="16" fill="${BG}"/>` +
    `<rect x="14" y="${H - 18}" width="${W - 28}" height="6" rx="3" fill="${CORAL}"/>`;
  let body = "";
  const text = (label ?? "").trim();
  if (text) {
    const lines = wrapLabel(text, 5.0, 4);
    const fs = 24;
    const lh = 28;
    const x = 13;
    const y0 = 32;
    // tspan dy 는 SD 렌더러가 무시하므로, 줄마다 별도 <text> 요소(절대 y)로 그린다.
    body = lines
      .map(
        (ln, i) =>
          `<text x="${x}" y="${y0 + i * lh}" text-anchor="start" ` +
          `font-family="Helvetica,Arial,sans-serif" font-size="${fs}" font-weight="600" ` +
          `fill="${TEXT}">${escapeXml(ln)}</text>`,
      )
      .join("");
  }
  return head + body + "</svg>";
}

/** Stream Deck setImage 용 data URI (한글 안전하게 Buffer base64). */
export function answerImageDataUri(label: string | null): string {
  const svg = answerSvg(label);
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}
