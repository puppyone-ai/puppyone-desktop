import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CodexAppServerAdapter,
  normalizeCodexNotification,
} from "../electron/main/agent/adapters/codex-app-server-adapter.mjs";

describe("Codex app-server normalization", () => {
  it("keeps the tested Codex 0.144.1 generated-schema fixture compatible", () => {
    const fixture = JSON.parse(readFileSync(new URL(
      "./fixtures/codex-app-server/v0.144.1-notifications.json",
      import.meta.url,
    ), "utf8"));
    expect(fixture.codexVersion).toBe("0.144.1");
    for (const notification of fixture.notifications) {
      expect(normalizeCodexNotification(notification).map((event) => event.type)).toContain(notification.expectedType);
    }
  });

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

    expect(normalizeCodexNotification({
      method: "configWarning",
      params: { summary: "Invalid config", details: "Unknown key", path: "/workspace/.codex/config.toml" },
    })[0]).toMatchObject({
      type: "provider.warning",
      payload: { message: "Invalid config Unknown key (/workspace/.codex/config.toml)" },
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
      method: "item/commandExecution/requestApproval",
      id: 8,
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-network",
        networkApprovalContext: { host: "registry.npmjs.org:443", protocol: "https" },
        reason: "Download package metadata",
        startedAtMs: Date.now(),
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: "approval.requested",
      payload: {
        title: "Allow network access",
        networkApprovalContext: { host: "registry.npmjs.org:443", protocol: "https" },
      },
    });
    connection.emit("notification", {
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: 8 },
    });
    expect(events.at(-1)).toMatchObject({
      type: "approval.resolved",
      payload: { requestId: "codex:8", decision: "cancel", reason: "provider-resolved" },
    });
    expect(() => adapter.resolveApproval({
      requestId: "codex:8",
      decision: "accept",
      threadId: "thread-1",
      turnId: "turn-1",
    })).toThrow(/no longer pending/i);

    connection.emit("request", {
      method: "item/fileChange/requestApproval",
      id: 9,
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-file",
        grantRoot: "/workspace/generated",
        startedAtMs: Date.now(),
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: "approval.requested",
      payload: { grantRoot: "/workspace/generated" },
    });
    adapter.resolveApproval({
      requestId: "codex:9",
      decision: "decline",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    connection.emit("request", {
      method: "item/tool/requestUserInput",
      id: 10,
      params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-2" },
    });
    expect(connection.errors.at(-1)).toMatchObject({ id: 10, code: -32601 });
    expect(events.at(-1)).toMatchObject({ type: "provider.warning" });
    adapter.dispose();
  });

  it("cancels pending approvals only after Codex accepts an interrupt", async () => {
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

    connection.emit("request", {
      method: "item/fileChange/requestApproval",
      id: 10,
      params: { threadId: "thread-1", turnId: "turn-2", itemId: "item-2", startedAtMs: Date.now() },
    });
    connection.failures.set("turn/interrupt", new Error("interrupt transport failed"));
    await expect(adapter.interruptTurn({ turnId: "turn-2" })).rejects.toThrow(/transport failed/i);
    expect(() => adapter.resolveApproval({
      requestId: "codex:10",
      decision: "decline",
      threadId: "thread-1",
      turnId: "turn-2",
    })).not.toThrow();
    expect(connection.responses).toContainEqual({ id: 10, result: { decision: "decline" } });
    adapter.dispose();
  });

  it("distinguishes an account-read failure from an unauthenticated account", async () => {
    const connection = new FakeConnection();
    connection.failures.set("account/read", new Error("account service unavailable"));
    connection.results.set("model/list", { data: [{ id: "gpt-5", model: "gpt-5" }] });
    const adapter = new CodexAppServerAdapter({
      executablePath: "/usr/local/bin/codex",
      environment: {},
      workspaceRoot: "/workspace",
      appVersion: "test",
      connectionFactory: () => connection,
    });

    const inspection = await adapter.inspect();

    expect(inspection.account).toMatchObject({ account: null, requiresOpenaiAuth: false });
    expect(inspection.warnings[0]).toMatch(/account service unavailable/i);
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
    this.failures = new Map();
  }

  request(method) {
    if (this.failures.has(method)) return Promise.reject(this.failures.get(method));
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
