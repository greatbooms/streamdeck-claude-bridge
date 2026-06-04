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
    if (this.ws !== ws && this.ws !== null) return;
    this.ws = null;
    this.state.applySync([]);
    this.emit();
    if (!this.closedByUser && !this.reconnectScheduled) {
      this.reconnectScheduled = true;
      this.scheduleReconnect(() => {
        this.reconnectScheduled = false;
        if (this.closedByUser) return; // stop() 이 그 사이 호출됐으면 재연결하지 않음
        this.connect();
      });
    }
  }

  private handleMessage(raw: string): void {
    let msg: ServerMsg;
    try { msg = JSON.parse(raw) as ServerMsg; } catch { return; }
    switch (msg.type) {
      case "sync": this.state.applySync(msg.questions); break;
      case "question_added": this.state.applyAdded(msg.question); break;
      case "question_resolved": this.state.applyResolved(msg.session); break;
      case "error": return;
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
