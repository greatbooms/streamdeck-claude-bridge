import type { Question } from "./types.js";

export class QuestionState {
  private pending = new Map<string, Question>();

  applySync(questions: Question[]): void {
    this.pending.clear();
    for (const q of questions) this.pending.set(q.session, q);
  }

  applyAdded(q: Question): void {
    this.pending.delete(q.session); // 재삽입으로 '가장 최근' 위치로 이동
    this.pending.set(q.session, q);
  }

  applyResolved(session: string): void {
    this.pending.delete(session);
  }

  active(): Question | null {
    let last: Question | null = null;
    for (const q of this.pending.values()) last = q;
    return last;
  }

  activeSession(): string | null {
    return this.active()?.session ?? null;
  }

  activeSource(): Question["source"] | null {
    return this.active()?.source ?? null;
  }

  questionText(): string | null {
    return this.active()?.question ?? null;
  }

  labelFor(index: number): string | null {
    const a = this.active();
    if (!a) return null;
    return a.options[index - 1]?.label ?? null;
  }

  isMultiSelect(): boolean {
    return this.active()?.multiSelect ?? false;
  }
}
