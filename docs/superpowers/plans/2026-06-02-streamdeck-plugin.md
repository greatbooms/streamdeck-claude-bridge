# 스트림덱 플러그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브릿지 WS를 소비해, 클로드 질문이 오면 스트림덱을 전용 프로파일로 자동 전환하고 버튼으로 답을 주입한 뒤 원래 프로파일로 복귀하는 Stream Deck 플러그인을 만든다.

**Architecture:** TypeScript + `@elgato/streamdeck` SDK v2. 순수 로직(브릿지 WS 클라이언트, 질문 상태, 프로파일 전환 캡슐)은 vitest로 TDD하고, SDK 액션/엔트리는 그 위에 얇게 얹는다. 브릿지는 변경하지 않는다.

**Tech Stack:** TypeScript 5, `@elgato/streamdeck` 2.1, vitest 4, Node 전역 WebSocket(Node 24), rollup 빌드, `@elgato/cli`로 link/validate.

---

## File Structure

`streamdeck-plugin/` (모노레포 하위, 자체 npm 패키지):

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `rollup.config.mjs`, `vitest.config.ts` | 패키지/빌드/테스트 설정 |
| `src/types.ts` | `Option`, `Question`, `ServerMsg`, `ClientMsg` |
| `src/question-state.ts` | `QuestionState` — 보류 질문 + 활성(최신) 계산 (순수) |
| `src/bridge-client.ts` | `BridgeClient` — WS 연결·재연결·메시지 처리·송신 (WS 주입 가능) |
| `src/profile-switcher.ts` | `ProfileSwitcher` — idempotent enter/leave (SDK 격리) |
| `src/answer-action.ts` | 답변 버튼 액션 |
| `src/cancel-action.ts` | 취소 버튼 액션 |
| `src/plugin.ts` | 엔트리: 클라이언트·액션·전환 오케스트레이션 |
| `com.shinsanghoon.claude-bridge.sdPlugin/manifest.json` | 플러그인 매니페스트 |
| `com.shinsanghoon.claude-bridge.sdPlugin/Claude Answers.streamDeckProfile` | 번들 프로파일(후속 수동) |
| `tests/*.test.ts` | 단위 테스트 |

루트 `.gitignore` 갱신.

---

## Task 1: 플러그인 패키지 스캐폴딩

**Files:** Create `streamdeck-plugin/package.json`, `streamdeck-plugin/tsconfig.json`, `streamdeck-plugin/vitest.config.ts`, `streamdeck-plugin/tests/smoke.test.ts`; Modify `.gitignore`.

- [ ] **Step 1: package.json**

`streamdeck-plugin/package.json`:
```json
{
  "name": "streamdeck-claude-bridge-plugin",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "rollup -c"
  },
  "dependencies": {
    "@elgato/streamdeck": "^2.1.0"
  },
  "devDependencies": {
    "@elgato/cli": "^1.7.4",
    "@rollup/plugin-commonjs": "^28.0.0",
    "@rollup/plugin-node-resolve": "^16.0.0",
    "@rollup/plugin-typescript": "^12.1.0",
    "rollup": "^4.24.0",
    "tslib": "^2.8.0",
    "typescript": "^5.6.0",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: tsconfig.json**

`streamdeck-plugin/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "outDir": "com.shinsanghoon.claude-bridge.sdPlugin/bin",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: vitest.config.ts + smoke test**

`streamdeck-plugin/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
```

`streamdeck-plugin/tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: .gitignore 갱신**

루트 `.gitignore` 전체 내용을 아래로 교체:
```
logs/
node_modules/
streamdeck-plugin/node_modules/
streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/bin/
*.egg-info/
```

- [ ] **Step 5: 설치 + 스모크 테스트**

Run:
```bash
cd streamdeck-plugin && npm install && npx vitest run
```
Expected: 설치 성공, `1 passed` (smoke.test.ts).

- [ ] **Step 6: Commit**

```bash
git add streamdeck-plugin/package.json streamdeck-plugin/tsconfig.json streamdeck-plugin/vitest.config.ts streamdeck-plugin/tests/smoke.test.ts .gitignore streamdeck-plugin/package-lock.json
git commit -m "chore: scaffold streamdeck plugin package"
```

---

## Task 2: 공유 타입

**Files:** Create `streamdeck-plugin/src/types.ts`, `streamdeck-plugin/tests/types.test.ts`

- [ ] **Step 1: 실패 테스트**

`streamdeck-plugin/tests/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type { Question, ServerMsg, ClientMsg } from "../src/types.js";

describe("types", () => {
  it("constructs a Question and messages structurally", () => {
    const q: Question = {
      session: "U1", header: "h", question: "q", multiSelect: false,
      claude_session_id: "c", options: [{ label: "A", description: "" }],
    };
    const added: ServerMsg = { type: "question_added", question: q };
    const answer: ClientMsg = { type: "answer", session: "U1", index: 1 };
    expect(q.options[0].label).toBe("A");
    expect(added.type).toBe("question_added");
    expect(answer.type).toBe("answer");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/types.test.ts`
Expected: FAIL (Cannot find module '../src/types.js').

- [ ] **Step 3: 구현**

`streamdeck-plugin/src/types.ts`:
```typescript
export interface Option {
  label: string;
  description: string;
}

export interface Question {
  session: string;
  header: string;
  question: string;
  multiSelect: boolean;
  claude_session_id: string;
  options: Option[];
}

export type ServerMsg =
  | { type: "sync"; questions: Question[] }
  | { type: "question_added"; question: Question }
  | { type: "question_resolved"; session: string }
  | { type: "error"; session: string; message: string };

export type ClientMsg =
  | { type: "answer"; session: string; index: number }
  | { type: "cancel"; session: string };
```

- [ ] **Step 4: 통과 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/types.ts streamdeck-plugin/tests/types.test.ts
git commit -m "feat(plugin): shared types"
```

---

## Task 3: 질문 상태 (활성=최신)

**Files:** Create `streamdeck-plugin/src/question-state.ts`, `streamdeck-plugin/tests/question-state.test.ts`

- [ ] **Step 1: 실패 테스트**

`streamdeck-plugin/tests/question-state.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { QuestionState } from "../src/question-state.js";
import type { Question } from "../src/types.js";

function q(session: string, opts: string[] = ["A"], multiSelect = false): Question {
  return {
    session, header: "h", question: "q", multiSelect, claude_session_id: "c",
    options: opts.map((label) => ({ label, description: "" })),
  };
}

describe("QuestionState", () => {
  it("active() is null when empty", () => {
    expect(new QuestionState().active()).toBeNull();
  });

  it("applyAdded makes it active; most-recent wins", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    expect(s.activeSession()).toBe("U2");
  });

  it("re-adding an existing session moves it to most-recent", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    s.applyAdded(q("U1"));
    expect(s.activeSession()).toBe("U1");
  });

  it("applyResolved falls back to next most-recent, then null", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1"));
    s.applyAdded(q("U2"));
    s.applyResolved("U2");
    expect(s.activeSession()).toBe("U1");
    s.applyResolved("U1");
    expect(s.active()).toBeNull();
  });

  it("applySync replaces all", () => {
    const s = new QuestionState();
    s.applyAdded(q("OLD"));
    s.applySync([q("U1"), q("U2")]);
    expect(s.activeSession()).toBe("U2");
  });

  it("labelFor returns option label by 1-based index, else null", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1", ["커피", "차", "물"]));
    expect(s.labelFor(1)).toBe("커피");
    expect(s.labelFor(2)).toBe("차");
    expect(s.labelFor(4)).toBeNull();
  });

  it("isMultiSelect reflects active question", () => {
    const s = new QuestionState();
    s.applyAdded(q("U1", ["A"], true));
    expect(s.isMultiSelect()).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/question-state.test.ts`
Expected: FAIL (Cannot find module).

- [ ] **Step 3: 구현**

`streamdeck-plugin/src/question-state.ts`:
```typescript
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

  labelFor(index: number): string | null {
    const a = this.active();
    if (!a) return null;
    return a.options[index - 1]?.label ?? null;
  }

  isMultiSelect(): boolean {
    return this.active()?.multiSelect ?? false;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/question-state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/question-state.ts streamdeck-plugin/tests/question-state.test.ts
git commit -m "feat(plugin): question state with most-recent active selection"
```

---

## Task 4: 브릿지 WS 클라이언트

**Files:** Create `streamdeck-plugin/src/bridge-client.ts`, `streamdeck-plugin/tests/bridge-client.test.ts`

`BridgeClient` 는 WS 를 주입받아(기본은 Node 전역 `WebSocket`) 메시지를 `QuestionState` 에 반영하고, `answer`/`cancel` 을 송신하며, 끊기면 재연결을 스케줄한다. 테스트는 가짜 WS 와 가짜 스케줄러를 주입한다.

- [ ] **Step 1: 실패 테스트**

`streamdeck-plugin/tests/bridge-client.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { BridgeClient, type WebSocketLike } from "../src/bridge-client.js";

class FakeWs implements WebSocketLike {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; this.onclose?.(); }
  emit(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

function make() {
  const sockets: FakeWs[] = [];
  const scheduled: Array<() => void> = [];
  const client = new BridgeClient(
    "ws://x/ws",
    () => { const w = new FakeWs(); sockets.push(w); return w; },
    (fn) => { scheduled.push(fn); },
  );
  return { client, sockets, scheduled };
}

describe("BridgeClient", () => {
  it("applies sync/added/resolved and emits change", () => {
    const { client, sockets } = make();
    const changes = vi.fn();
    client.onChange(changes);
    client.start();
    const ws = sockets[0];
    ws.onopen?.();
    ws.emit({ type: "sync", questions: [] });
    ws.emit({ type: "question_added", question: { session: "U1", header: "h", question: "q", multiSelect: false, claude_session_id: "c", options: [{ label: "A", description: "" }] } });
    expect(client.state.activeSession()).toBe("U1");
    ws.emit({ type: "question_resolved", session: "U1" });
    expect(client.state.active()).toBeNull();
    expect(changes).toHaveBeenCalled();
  });

  it("answer() and cancel() send correct JSON", () => {
    const { client, sockets } = make();
    client.start();
    const ws = sockets[0];
    ws.onopen?.();
    client.answer("U1", 2);
    client.cancel("U1");
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "answer", session: "U1", index: 2 });
    expect(JSON.parse(ws.sent[1])).toEqual({ type: "cancel", session: "U1" });
  });

  it("ignores malformed messages", () => {
    const { client, sockets } = make();
    client.start();
    const ws = sockets[0];
    ws.onmessage?.({ data: "not json {{{" });
    expect(client.state.active()).toBeNull();
  });

  it("schedules reconnect on close and clears state", () => {
    const { client, sockets, scheduled } = make();
    const changes = vi.fn();
    client.onChange(changes);
    client.start();
    const ws = sockets[0];
    ws.onopen?.();
    ws.emit({ type: "question_added", question: { session: "U1", header: "h", question: "q", multiSelect: false, claude_session_id: "c", options: [] } });
    ws.onclose?.();
    expect(client.state.active()).toBeNull();      // 끊기면 상태 비움
    expect(scheduled.length).toBe(1);
    scheduled[0]();                                 // 재연결 실행
    expect(sockets.length).toBe(2);                 // 새 소켓 생성됨
  });

  it("does not reconnect after stop()", () => {
    const { client, sockets, scheduled } = make();
    client.start();
    sockets[0].onopen?.();
    client.stop();
    expect(scheduled.length).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/bridge-client.test.ts`
Expected: FAIL (Cannot find module).

- [ ] **Step 3: 구현**

`streamdeck-plugin/src/bridge-client.ts`:
```typescript
import { QuestionState } from "./question-state.js";
import type { ServerMsg, ClientMsg } from "./types.js";

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WsFactory = (url: string) => WebSocketLike;
export type Scheduler = (fn: () => void) => void;

export class BridgeClient {
  readonly state = new QuestionState();
  private ws: WebSocketLike | null = null;
  private listeners = new Set<() => void>();
  private closedByUser = false;
  private reconnectScheduled = false;

  constructor(
    private url: string,
    private wsFactory: WsFactory = (u) => new WebSocket(u) as unknown as WebSocketLike,
    private scheduleReconnect: Scheduler = (fn) => { setTimeout(fn, 1000); },
  ) {}

  onChange(cb: () => void): void { this.listeners.add(cb); }
  private emit(): void { for (const cb of this.listeners) cb(); }

  start(): void {
    this.closedByUser = false;
    this.connect();
  }

  stop(): void {
    this.closedByUser = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private connect(): void {
    const ws = this.wsFactory(this.url);
    this.ws = ws;
    ws.onopen = () => { /* 서버가 sync 를 보냄 */ };
    ws.onmessage = (ev) => this.handleMessage(String(ev.data));
    ws.onclose = () => this.handleClose(ws);
    ws.onerror = () => { ws.close(); };
  }

  private handleClose(ws: WebSocketLike): void {
    if (this.ws !== ws && this.ws !== null) return; // 이미 교체된 소켓의 늦은 close 무시
    this.ws = null;
    this.state.applySync([]);
    this.emit();
    if (!this.closedByUser && !this.reconnectScheduled) {
      this.reconnectScheduled = true;
      this.scheduleReconnect(() => { this.reconnectScheduled = false; this.connect(); });
    }
  }

  private handleMessage(raw: string): void {
    let msg: ServerMsg;
    try { msg = JSON.parse(raw) as ServerMsg; } catch { return; }
    switch (msg.type) {
      case "sync": this.state.applySync(msg.questions); break;
      case "question_added": this.state.applyAdded(msg.question); break;
      case "question_resolved": this.state.applyResolved(msg.session); break;
      case "error": return; // 상태 변화 없음
      default: return;
    }
    this.emit();
  }

  private send(msg: ClientMsg): void {
    this.ws?.send(JSON.stringify(msg));
  }

  answer(session: string, index: number): void {
    this.send({ type: "answer", session, index });
  }

  cancel(session: string): void {
    this.send({ type: "cancel", session });
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/bridge-client.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/bridge-client.ts streamdeck-plugin/tests/bridge-client.test.ts
git commit -m "feat(plugin): bridge websocket client with reconnect"
```

---

## Task 5: 프로파일 전환기 (idempotent)

**Files:** Create `streamdeck-plugin/src/profile-switcher.ts`, `streamdeck-plugin/tests/profile-switcher.test.ts`

- [ ] **Step 1: 실패 테스트**

`streamdeck-plugin/tests/profile-switcher.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ProfileSwitcher, type ProfileApi } from "../src/profile-switcher.js";

function make(deviceId: string | null = "DEV1") {
  const calls: Array<[string, string | undefined]> = [];
  const api: ProfileApi = {
    switchToProfile: (id, name) => { calls.push([id, name]); },
  };
  const sw = new ProfileSwitcher(api, () => deviceId, "Claude Answers");
  return { sw, calls };
}

describe("ProfileSwitcher", () => {
  it("enter switches to named profile once; second enter is a no-op", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.enter();
    expect(calls).toEqual([["DEV1", "Claude Answers"]]);
  });

  it("leave switches back with no name; second leave is a no-op", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.leave();
    await sw.leave();
    expect(calls).toEqual([["DEV1", "Claude Answers"], ["DEV1", undefined]]);
  });

  it("enter/leave/enter cycles correctly", async () => {
    const { sw, calls } = make();
    await sw.enter();
    await sw.leave();
    await sw.enter();
    expect(calls).toEqual([
      ["DEV1", "Claude Answers"], ["DEV1", undefined], ["DEV1", "Claude Answers"],
    ]);
  });

  it("no device → no switch, but state still tracked", async () => {
    const { sw, calls } = make(null);
    await sw.enter();
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/profile-switcher.test.ts`
Expected: FAIL (Cannot find module).

- [ ] **Step 3: 구현**

`streamdeck-plugin/src/profile-switcher.ts`:
```typescript
export interface ProfileApi {
  switchToProfile(deviceId: string, profileName?: string): Promise<void> | void;
}

export class ProfileSwitcher {
  private inProfile = false;

  constructor(
    private api: ProfileApi,
    private deviceId: () => string | null,
    private profileName: string,
  ) {}

  async enter(): Promise<void> {
    if (this.inProfile) return;
    const id = this.deviceId();
    if (!id) return;
    this.inProfile = true;
    await this.api.switchToProfile(id, this.profileName);
  }

  async leave(): Promise<void> {
    if (!this.inProfile) return;
    this.inProfile = false;
    const id = this.deviceId();
    if (!id) return;
    await this.api.switchToProfile(id); // 인자 없음 → 직전 프로파일 복귀
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd streamdeck-plugin && npx vitest run tests/profile-switcher.test.ts`
Expected: PASS (4 tests). 그리고 전체: `cd streamdeck-plugin && npx vitest run` → 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/src/profile-switcher.ts streamdeck-plugin/tests/profile-switcher.test.ts
git commit -m "feat(plugin): idempotent profile switcher"
```

---

## Task 6: SDK 액션 (answer / cancel)

**Files:** Create `streamdeck-plugin/src/answer-action.ts`, `streamdeck-plugin/src/cancel-action.ts`

SDK 의존 코드. 단위 테스트 대신 빌드 시 타입 체크 + 후속 수동 e2e 로 검증한다. 코드는 `@elgato/streamdeck` 2.1 기준이며, 시그니처가 다르면 설치된 SDK 의 타입에 맞춰 조정한다(빌드가 게이트).

- [ ] **Step 1: answer-action.ts 작성**

`streamdeck-plugin/src/answer-action.ts`:
```typescript
import {
  action, SingletonAction,
  type WillAppearEvent, type KeyDownEvent, type Action,
} from "@elgato/streamdeck";
import type { BridgeClient } from "./bridge-client.js";

interface AnswerSettings {
  optionIndex?: number;
}

@action({ UUID: "com.shinsanghoon.claude-bridge.answer" })
export class AnswerAction extends SingletonAction<AnswerSettings> {
  constructor(private client: BridgeClient) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<AnswerSettings>): Promise<void> {
    await this.refresh(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<AnswerSettings>): Promise<void> {
    const index = ev.payload.settings.optionIndex ?? 0;
    const session = this.client.state.activeSession();
    if (!session || index < 1 || this.client.state.isMultiSelect()) {
      await ev.action.showAlert();
      return;
    }
    this.client.answer(session, index);
  }

  /** 활성 질문이 바뀌면 화면에 보이는 모든 답변 버튼의 제목을 갱신한다. */
  async refreshAll(): Promise<void> {
    for (const a of this.actions) {
      const settings = await a.getSettings<AnswerSettings>();
      await this.refresh(a, settings);
    }
  }

  private async refresh(a: Action, settings: AnswerSettings): Promise<void> {
    const index = settings.optionIndex ?? 0;
    const label = index >= 1 ? this.client.state.labelFor(index) : null;
    await a.setTitle(label ?? "");
  }
}
```

- [ ] **Step 2: cancel-action.ts 작성**

`streamdeck-plugin/src/cancel-action.ts`:
```typescript
import { action, SingletonAction, type KeyDownEvent } from "@elgato/streamdeck";
import type { BridgeClient } from "./bridge-client.js";

@action({ UUID: "com.shinsanghoon.claude-bridge.cancel" })
export class CancelAction extends SingletonAction {
  constructor(private client: BridgeClient) {
    super();
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    const session = this.client.state.activeSession();
    if (session) this.client.cancel(session);
  }
}
```

- [ ] **Step 3: 타입 체크**

Run: `cd streamdeck-plugin && npx tsc --noEmit`
Expected: 타입 에러 없음. (에러가 나면 설치된 `@elgato/streamdeck` 의 `Action`/이벤트 타입명·`this.actions`·`getSettings`/`setTitle` 시그니처에 맞춰 조정. 핵심 로직 — index→label, multiSelect 가드, activeSession — 은 유지.)

- [ ] **Step 4: Commit**

```bash
git add streamdeck-plugin/src/answer-action.ts streamdeck-plugin/src/cancel-action.ts
git commit -m "feat(plugin): answer and cancel actions"
```

---

## Task 7: 엔트리 + 빌드 + 매니페스트

**Files:** Create `streamdeck-plugin/src/plugin.ts`, `streamdeck-plugin/rollup.config.mjs`, `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`

- [ ] **Step 1: plugin.ts (엔트리/오케스트레이션)**

`streamdeck-plugin/src/plugin.ts`:
```typescript
import streamDeck from "@elgato/streamdeck";
import { BridgeClient } from "./bridge-client.js";
import { ProfileSwitcher } from "./profile-switcher.js";
import { AnswerAction } from "./answer-action.js";
import { CancelAction } from "./cancel-action.js";

const PROFILE = "Claude Answers";
const URL = "ws://127.0.0.1:8787/ws";

const client = new BridgeClient(URL);

function firstDeviceId(): string | null {
  for (const d of streamDeck.devices) {
    if (d.isConnected) return d.id;
  }
  return null;
}

const switcher = new ProfileSwitcher(
  { switchToProfile: (id, name) => streamDeck.profiles.switchToProfile(id, name) },
  firstDeviceId,
  PROFILE,
);

const answerAction = new AnswerAction(client);
const cancelAction = new CancelAction(client);

client.onChange(() => {
  const active = client.state.activeSession();
  if (active) void switcher.enter();
  else void switcher.leave();
  void answerAction.refreshAll();
});

streamDeck.actions.registerAction(answerAction);
streamDeck.actions.registerAction(cancelAction);
streamDeck.connect();
client.start();
```

- [ ] **Step 2: rollup.config.mjs**

`streamdeck-plugin/rollup.config.mjs`:
```javascript
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const sdPlugin = "com.shinsanghoon.claude-bridge.sdPlugin";

export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "esm",
    sourcemap: true,
  },
  external: ["@elgato/streamdeck"],
  plugins: [
    typescript({ tsconfig: "./tsconfig.json", noEmitOnError: true }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
};
```

- [ ] **Step 3: manifest.json**

`streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`:
```json
{
  "Name": "Claude Bridge",
  "Version": "0.1.0.0",
  "Author": "shinsanghoon",
  "Actions": [
    {
      "Name": "Answer",
      "UUID": "com.shinsanghoon.claude-bridge.answer",
      "Icon": "imgs/actions/answer/icon",
      "Tooltip": "클로드 질문의 선택지에 답합니다 (optionIndex)",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/answer/key", "TitleAlignment": "middle" }]
    },
    {
      "Name": "Cancel",
      "UUID": "com.shinsanghoon.claude-bridge.cancel",
      "Icon": "imgs/actions/cancel/icon",
      "Tooltip": "현재 질문을 취소(Esc)하고 복귀합니다",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/cancel/key", "TitleAlignment": "middle" }]
    }
  ],
  "Category": "Claude Bridge",
  "CategoryIcon": "imgs/plugin/category-icon",
  "Icon": "imgs/plugin/marketplace",
  "SDKVersion": 2,
  "Software": { "MinimumVersion": "6.5" },
  "Nodejs": { "Version": "20", "Debug": "enabled" },
  "CodePath": "bin/plugin.js",
  "UUID": "com.shinsanghoon.claude-bridge",
  "OS": [{ "Platform": "mac", "MinimumVersion": "12" }]
}
```

- [ ] **Step 4: 빌드 + 매니페스트 검증**

Run:
```bash
cd streamdeck-plugin
npm run build
npx @elgato/cli validate com.shinsanghoon.claude-bridge.sdPlugin
```
Expected: `bin/plugin.js` 생성, validate 통과(아이콘 자산 경고는 무시 가능 — Step 5에서 플레이스홀더 추가). 빌드/검증 실패 시 메시지에 따라 manifest 필드(SDKVersion/Nodejs/Software 버전)나 rollup 설정을 설치된 SDK 기준으로 조정.

- [ ] **Step 5: 아이콘 플레이스홀더 (validate 통과용 최소 자산)**

매니페스트가 참조하는 이미지가 없으면 validate 가 실패할 수 있다. 최소 1x 투명 PNG 를 생성해 채운다:
```bash
cd streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin
mkdir -p imgs/actions/answer imgs/actions/cancel imgs/plugin
# 72x72 투명 PNG 한 장을 만들어 필요한 이름들로 복사
python3 - <<'PY'
import zlib, struct, shutil, os
def png():
    w=h=72
    raw=b''.join(b'\x00'+b'\x00\x00\x00\x00'*w for _ in range(h))
    def chunk(t,d): return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
    sig=b'\x89PNG\r\n\x1a\n'
    ihdr=struct.pack(">IIBBBBB",w,h,8,6,0,0,0)
    return sig+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
data=png()
for p in ["imgs/actions/answer/icon.png","imgs/actions/answer/key.png",
          "imgs/actions/cancel/icon.png","imgs/actions/cancel/key.png",
          "imgs/plugin/category-icon.png","imgs/plugin/marketplace.png"]:
    os.makedirs(os.path.dirname(p),exist_ok=True)
    open(p,"wb").write(data)
print("icons written")
PY
cd ../.. && npm run build && npx @elgato/cli validate com.shinsanghoon.claude-bridge.sdPlugin
```
Expected: validate 통과(또는 경고만).

- [ ] **Step 6: Commit**

```bash
git add streamdeck-plugin/src/plugin.ts streamdeck-plugin/rollup.config.mjs streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/imgs
git commit -m "feat(plugin): entry point, rollup build, manifest, placeholder icons"
```

---

## Task 8: 링크 · 번들 프로파일 · 수동 e2e · README

**Files:** Modify `README.md`; (수동) 번들 프로파일 생성.

- [ ] **Step 1: 플러그인 링크 + 리로드**

Run:
```bash
cd streamdeck-plugin
npx @elgato/cli link com.shinsanghoon.claude-bridge.sdPlugin
npx @elgato/cli restart com.shinsanghoon.claude-bridge
```
Expected: Stream Deck 앱에 "Claude Bridge" 카테고리(Answer/Cancel 액션) 표시. (link 가 권한/경로 문제로 실패하면 산출물 디렉터리를 `~/Library/Application Support/com.elgato.StreamDeck/Plugins/` 로 심볼릭 링크.)

- [ ] **Step 2: "Claude Answers" 전용 프로파일 만들기 (수동, Stream Deck 앱에서)**

1. Stream Deck 앱 > 프로파일 추가 → 이름 "Claude Answers".
2. 버튼들에 **Answer** 액션을 올리고 각 버튼의 `optionIndex` 를 1,2,3,4… 로 설정.
   (Property Inspector 가 아직 없으므로 임시로는 각 Answer 액션 인스턴스의 설정을
   Stream Deck 앱에서 직접 줄 수 없을 수 있다. 그 경우 이번 단계에서 **간이 Property
   Inspector** 가 필요하다 — 아래 Step 3 참고.)
3. 한 버튼에 **Cancel** 액션 배치.
4. 이 프로파일을 export 해 `com.shinsanghoon.claude-bridge.sdPlugin/Claude Answers.streamDeckProfile` 로 저장하고 매니페스트에 `Profiles` 항목을 추가하면 배포 시 자동 설치된다(후속).

- [ ] **Step 3: optionIndex 설정 수단 확인**

`optionIndex` 를 버튼별로 주는 방법이 필요하다. 둘 중 하나:
- (a) 최소 Property Inspector(HTML) 추가 — 숫자 입력 1개. 매니페스트 액션에 `"PropertyInspectorPath"` 지정.
- (b) 프로파일에 미리 배선된 설정으로 export(번들).

이번 e2e 에서는 (a) 간이 PI 로 각 버튼에 1..N 을 입력해 검증한다. PI 추가는 작은 HTML +
`PropertyInspectorPath` 설정이며, 본 단계에서 구현한다. (구현이 커지면 별도 후속 플랜으로 분리.)

- [ ] **Step 4: 수동 e2e**

1. `python3 -m bridge` 로 브릿지 기동.
2. Stream Deck 을 임의의 사용자 프로파일에 둔다.
3. iTerm2 에서 이 폴더로 `claude` 실행 → 단일선택 AskUserQuestion 유도.
4. 확인: 스트림덱이 **"Claude Answers" 프로파일로 자동 전환**, 버튼에 선택지 라벨 표시.
5. 버튼 2 누름 → iTerm2 메뉴에서 2번 선택 + claude 진행.
6. 확인: **원래 사용자 프로파일로 자동 복귀**.
7. multiSelect 질문은 버튼 눌러도 주입 안 되고 알림만(취소로 복귀).
결과를 기록한다.

- [ ] **Step 5: README 플러그인 섹션 추가**

`README.md` 의 "## scripts" 섹션 바로 위에 삽입:
```markdown
## 스트림덱 플러그인

\`\`\`bash
npm i -g @elgato/cli           # 최초 1회
cd streamdeck-plugin && npm install && npm run build
npx @elgato/cli link com.shinsanghoon.claude-bridge.sdPlugin
npx @elgato/cli restart com.shinsanghoon.claude-bridge
\`\`\`

동작: 브릿지(`python -m bridge`)가 떠 있는 상태에서 클로드 질문이 오면 스트림덱이
"Claude Answers" 프로파일로 자동 전환되고, 버튼으로 답하면 해당 iTerm2 세션에 주입된 뒤
원래 프로파일로 복귀한다. multiSelect 는 알림 전용.
\`\`\`
```

- [ ] **Step 6: 전체 테스트 + Commit**

```bash
cd streamdeck-plugin && npx vitest run    # 전체 단위 테스트 통과 확인
cd .. && git add README.md streamdeck-plugin
git commit -m "docs(plugin): install/e2e instructions; bundle profile & PI for optionIndex"
```

---

## Self-Review 결과

- **Spec coverage:** §2 스택/배치(Task 1) · §3 동작 흐름(Task 7 plugin.ts) · §4 컴포넌트 전부(types T2, question-state T3, bridge-client T4, profile-switcher T5, answer/cancel T6, plugin T7) · §5 프로토콜(T2/T4) · §6 활성 로직(T3) · §7 동작 세부(T6 multiSelect 가드/취소, T7 전환) · §8 에러/엣지(T4 재연결·상태 비움, T5 idempotent) · §9 테스트(각 순수 모듈 TDD + T8 수동 e2e) · §10 빌드/설치(T7/T8) · §11 비목표 · §12 repo 정리(T1 .gitignore) 모두 태스크로 커버됨.
- **알려진 리스크(명시):** SDK 액션/매니페스트/rollup(§T6,T7)은 `@elgato/streamdeck` 2.1 기준 베스트-에포트이며 빌드(`tsc --noEmit`/`rollup`)·`@elgato/cli validate` 가 게이트. 시그니처 상이 시 설치 SDK 타입에 맞춰 조정(핵심 로직 유지). `optionIndex` 주입 수단(PI vs 번들 프로파일)은 T8 Step3 에서 확정.
- **Placeholder scan:** 순수 모듈 태스크는 완전한 코드/테스트 포함. SDK 태스크는 완전한 코드 + 검증 게이트 포함(설계상 "조정 가능" 명시는 플레이스홀더가 아니라 통합 리스크 표기).
- **Type consistency:** `QuestionState`(applySync/applyAdded/applyResolved/active/activeSession/labelFor/isMultiSelect), `BridgeClient`(state/onChange/start/stop/answer/cancel + WebSocketLike), `ProfileSwitcher`(enter/leave/ProfileApi), 액션 UUID(`com.shinsanghoon.claude-bridge.answer|cancel`)가 태스크 간 일치.
