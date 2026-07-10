import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAppServerAdapter,
  normalizeCodexNotification,
} from "../electron/main/agent/adapters/codex-app-server-adapter.mjs";

describe("Codex app-server normalization", () => {
  it("maps current generated-schema notifications to provider-neutral events", () => {
    expect(normalizeCodexNotification({
      method: "thread/started",
      params: { thread: { id: "thread-1", preview: "Fix tests", createdAt: 1, updatedAt: 2 } },
    })[0]).toMatchObject({ type: "session.started", providerSessionId: "thread-1", payload: { title: "Fix tests" } });

    expect(normalizeCodexNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", delta: "hello" },
    })).toEqual([expect.objectContaining({
      type: "assistant.delta",
      providerSessionId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      payload: { delta: "hello" },
    })]);

    expect(normalizeCodexNotification({
      method: "turn/completed",
      params: { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } },
    })[0]).toMatchObject({ type: "turn.interrupted", payload: { status: "interrupted" } });

    expect(normalizeCodexNotification({
      method: "item/fileChange/patchUpdated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-1",
        changes: [{ path: "src/App.tsx", kind: "update", diff: "+one\n-two\n" }],
      },
    })[0]).toMatchObject({
      type: "file.change.updated",
      payload: { changes: [{ path: "src/App.tsx", kind: "update", additions: 1, deletions: 1 }] },
    });
  });

  it("offers only explicit durable decisions and fails unsupported requests closed", async () => {
    const connection = new FakeConnection();
    const events = [];
    const adapter = new CodexAppServerAdapter({
      executablePath: "/usr/local/bin/codex",
      environment: {},
      workspaceRoot: "/workspace",
      appVersion: "test",
      connectionFactory: () => connection,
      onEvent: (event) => events.push(event),
    });
    await adapter.connect();
    adapter.threadId = "thread-1";
    connection.emit("request", {
      method: "item/commandExecution/requestApproval",
      id: 7,
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        command: "npm test",
        startedAtMs: Date.now(),
      },
    });
    const approval = events.find((event) => event.type === "approval.requested");
    expect(approval.payload.availableDecisions).toEqual(["accept", "decline", "cancel"]);
    expect(approval.payload.availableDecisions).not.toContain("acceptForSession");
    adapter.resolveApproval({
      requestId: "codex:7",
      decision: "accept",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(connection.responses.at(-1)).toEqual({ id: 7, result: { decision: "accept" } });

    connection.emit("request", {
      method: "item/tool/requestUserInput",
      id: 8,
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-2" },
    });
    expect(connection.errors.at(-1)).toMatchObject({ id: 8, code: -32601 });
    expect(events.at(-1)).toMatchObject({ type: "provider.warning" });
    adapter.dispose();
  });

  it("cancels pending approvals during interrupt and dispose", async () => {
    const connection = new FakeConnection();
    connection.results.set("turn/interrupt", {});
    const adapter = new CodexAppServerAdapter({
      executablePath: "/usr/local/bin/codex",
      environment: {},
      workspaceRoot: "/workspace",
      appVersion: "test",
      connectionFactory: () => connection,
    });
    await adapter.connect();
    adapter.threadId = "thread-1";
    connection.emit("request", {
      method: "item/fileChange/requestApproval",
      id: 9,
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", startedAtMs: Date.now() },
    });
    await adapter.interruptTurn({ turnId: "turn-1" });
    expect(connection.responses).toContainEqual({ id: 9, result: { decision: "cancel" } });
    adapter.dispose();
  });
});

class FakeConnection extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
    this.responses = [];
    this.errors = [];
    this.results = new Map([["initialize", { userAgent: "codex" }]]);
  }

  request(method) {
    return Promise.resolve(this.results.get(method) ?? {});
  }

  notify() {}

  respond(id, result) {
    this.responses.push({ id, result });
  }

  respondError(id, code, message) {
    this.errors.push({ id, code, message });
  }

  dispose() {
    this.closed = true;
    this.emit("exit", { expected: true });
  }
}
