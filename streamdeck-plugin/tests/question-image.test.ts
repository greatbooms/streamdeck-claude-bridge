import { describe, it, expect } from "vitest";
import {
  distributeWords,
  wrapWords,
  linesForCell,
  cellSvg,
  questionImageDataUri,
} from "../src/question-image.js";

describe("question-image (word distribution across cells)", () => {
  it("distributes words across all cells, keeping words whole and ordered", () => {
    const text = "이 변경을 메인 브랜치에 머지할까요 아니면 새로 PR 을 만들어서 리뷰를 받을까요?";
    const buckets = distributeWords(text, 5);
    expect(buckets.length).toBe(5);
    expect(buckets.every((b) => b.length > 0)).toBe(true); // 5칸 모두 사용
    // 순서 보존: 칸들을 이어붙이면 원문 단어 순서와 같다
    const flat = buckets.flat().join(" ");
    expect(flat).toBe(text.trim());
  });

  it("fewer words than cells leaves trailing cells empty", () => {
    const buckets = distributeWords("커피 한 잔", 5);
    expect(buckets[0].length).toBeGreaterThan(0);
    expect(buckets[4]).toEqual([]);
  });

  it("wrapWords keeps words whole and wraps within width", () => {
    const lines = wrapWords(["메인", "브랜치에", "머지"], 4.6, 3);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // 어떤 줄도 단어를 글자 중간에서 끊지 않음(공백 경계만)
    expect(lines.join(" ")).toContain("브랜치에");
  });

  it("over-long single word is char-split as a fallback", () => {
    const lines = wrapWords(["가나다라마바사아자차카타"], 4.6, 3);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("wrapWords caps at maxLines with … on overflow", () => {
    const words = Array.from({ length: 40 }, (_, i) => `단어${i}`);
    const lines = wrapWords(words, 4.6, 3);
    expect(lines.length).toBe(3);
    expect(lines[2].endsWith("…")).toBe(true);
  });

  it("cellSvg with empty lines has no text element (idle background only)", () => {
    const svg = cellSvg([]);
    expect(svg).not.toContain("<text");
    expect(svg).toContain("rect");
  });

  it("cellSvg renders left-aligned text at the larger font size", () => {
    const svg = cellSvg(["메인"]);
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('font-size="30"');
    expect(svg).toContain("메인");
  });

  it("linesForCell returns this cell's wrapped words", () => {
    const text = "이 변경을 메인 브랜치에 머지할까요 아니면 새로 PR 을 만들어서 리뷰를 받을까요?";
    expect(linesForCell(text, 0, 5).join(" ")).toContain("이");
    expect(linesForCell(text, 4, 5).length).toBeGreaterThan(0); // 5번째 칸도 채워짐
  });

  it("data URI is base64 svg", () => {
    expect(questionImageDataUri("차 마실까", 0, 5)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});
