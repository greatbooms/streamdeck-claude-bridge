import { describe, it, expect } from "vitest";
import { wrapLabel, answerSvg, answerImageDataUri } from "../src/answer-image.js";

describe("answer-image", () => {
  it("wraps long text into multiple lines, capped at maxLines", () => {
    const lines = wrapLabel("README/문서 정리 작업 진행", 6.2, 4);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it("short label stays one line", () => {
    expect(wrapLabel("커피", 6.2, 4)).toEqual(["커피"]);
  });

  it("answerSvg(null) has no text element (idle background only)", () => {
    const svg = answerSvg(null);
    expect(svg).not.toContain("<text");
    expect(svg).toContain("rect"); // 배경 + 코랄 바
  });

  it("answerSvg renders left-aligned text containing the label", () => {
    const svg = answerSvg("커피");
    expect(svg).toContain('text-anchor="start"'); // 좌측 정렬
    expect(svg).toContain("커피");
    expect(svg).toContain('x="13"'); // 왼쪽 패딩에서 시작
  });

  it("answerSvg can render Codex-themed approval buttons", () => {
    const svg = answerSvg("Approve", "codex");
    expect(svg).toContain("#0B0F14");
    expect(svg).toContain("#10A37F");
    expect(svg).toContain("Approve");
  });

  it("data URI is base64 svg", () => {
    expect(answerImageDataUri("차")).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});
