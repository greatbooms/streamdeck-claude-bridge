import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const launcherHtmlPath = join(process.cwd(), "com.shinsanghoon.claude-bridge.sdPlugin", "ui", "launcher.html");

type Listener = (event?: { data?: string }) => void;

interface FakeElement {
  value: string;
  textContent: string;
  disabled: boolean;
  className: string;
  firstChild: FakeElement | null;
  classList: { add: (name: string) => void };
  appendChild: (child: FakeElement) => void;
  removeChild: (child: FakeElement) => void;
  addEventListener: (event: string, listener: Listener) => void;
}

function createFakeElement(): FakeElement {
  const children: FakeElement[] = [];
  const element: FakeElement = {
    value: "",
    textContent: "",
    disabled: false,
    className: "",
    firstChild: null,
    classList: { add: (name) => { element.className = element.className ? `${element.className} ${name}` : name; } },
    appendChild: (child) => {
      children.push(child);
      element.firstChild = children[0] ?? null;
    },
    removeChild: (child) => {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      element.firstChild = children[0] ?? null;
    },
    addEventListener: () => {},
  };
  return element;
}

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly readyState = FakeWebSocket.OPEN;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  emit(event: string, data?: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(data === undefined ? undefined : { data });
    }
  }
}

function launcherScript(): string {
  const html = readFileSync(launcherHtmlPath, "utf8");
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error("launcher.html script tag not found");
  return match[1];
}

describe("launcher Property Inspector", () => {
  it("sends plugin messages to the action instance context, not the property inspector uuid", () => {
    FakeWebSocket.instances = [];
    const elements = new Map<string, FakeElement>();
    const documentStub = {
      getElementById(id: string): FakeElement {
        const existing = elements.get(id);
        if (existing) return existing;
        const element = createFakeElement();
        elements.set(id, element);
        return element;
      },
      createElement: () => createFakeElement(),
    };
    const context = {
      document: documentStub,
      window: {} as Record<string, unknown>,
      WebSocket: FakeWebSocket,
      JSON,
    };

    vm.createContext(context);
    new vm.Script(launcherScript()).runInContext(context);

    const connect = context.window.connectElgatoStreamDeckSocket as (
      port: string,
      uuid: string,
      event: string,
      info: string,
      actionInfo: string,
    ) => void;
    connect("12345", "property-inspector-context", "registerPropertyInspector", "{}", JSON.stringify({
      action: "com.shinsanghoon.claude-bridge.launcher",
      context: "launcher-action-instance",
    }));

    const socket = FakeWebSocket.instances[0];
    socket.emit("open");

    expect(JSON.parse(socket.sent[0])).toEqual({
      event: "registerPropertyInspector",
      uuid: "property-inspector-context",
    });
    expect(JSON.parse(socket.sent[1])).toEqual({
      event: "sendToPlugin",
      action: "com.shinsanghoon.claude-bridge.launcher",
      context: "launcher-action-instance",
      payload: { type: "launcherEditorReady" },
    });
  });
});
