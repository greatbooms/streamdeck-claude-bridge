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
    expect(client.state.active()).toBeNull();
    expect(scheduled.length).toBe(1);
    scheduled[0]();
    expect(sockets.length).toBe(2);
  });

  it("does not reconnect after stop()", () => {
    const { client, sockets, scheduled } = make();
    client.start();
    sockets[0].onopen?.();
    client.stop();
    expect(scheduled.length).toBe(0);
  });
});

describe("BridgeClient stop during pending reconnect", () => {
  it("stop() before a scheduled reconnect fires prevents reconnect", () => {
    const sockets: FakeWs[] = [];
    const scheduled: Array<() => void> = [];
    const client = new BridgeClient(
      "ws://x/ws",
      () => { const w = new FakeWs(); sockets.push(w); return w; },
      (fn) => { scheduled.push(fn); },
    );
    client.start();
    sockets[0].onopen?.();
    sockets[0].onclose?.();          // 비정상 종료 → 재연결 예약
    expect(scheduled.length).toBe(1);
    client.stop();                   // 예약 실행 전에 사용자가 중단
    scheduled[0]();                  // 예약된 콜백 실행
    expect(sockets.length).toBe(1);  // 새 소켓 생성 안 됨
  });
});
