import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CursorAcpAdapter } from "../electron/main/agent/runtimes/cursor/cursor-acp-adapter.mjs";
import { discoverCursorBackend } from "../electron/main/agent/runtimes/cursor/cursor-discovery.mjs";

describe("Cursor ACP runtime", () => {
  it("classifies a detected signed-in Cursor CLI as an ACP-ready Agent", async () => {
    const readiness = await discoverCursorBackend({
      resolveCandidate: async () => ({ executablePath: "/tools/agent", argsPrefix: [], source: "path-installation" }),
      probe: async () => ({ installation: "detected", version: "2026.08.1", authentication: "signed-in", source: "path-installation" }),
    });
    expect(readiness).toMatchObject({
      status: "ready",
      executablePath: "/tools/agent",
      compatibility: "acp-v1",
      selectable: true,
    });
  });

  it("uses agent acp with Cursor login, permissions, questions and streaming", async () => {
    const onEvent = vi.fn();
    const connection = new FakeCursorConnection();
    const adapter = new CursorAcpAdapter({
      readiness: { executablePath: "/tools/agent", environment: {}, version: "2026.08.1", source: "path-installation" },
      workspaceRoot: "/workspace",
      appVersion: "0.3.11",
      onEvent,
      connectionFactory: (options) => {
        connection.options = options;
        return connection;
      },
      fileSystemFactory: () => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }),
      projectInstructionLoader: vi.fn(async () => ({ source: null, text: "", bytes: 0 })),
    });

    const inspection = await adapter.inspect();
    expect(connection.options.args).toEqual(["acp"]);
    expect(connection.request).toHaveBeenCalledWith("authenticate", { methodId: "cursor_login" }, expect.any(Object));
    expect(inspection.capabilities).toMatchObject({
      protocol: { name: "acp", version: 1 },
      manualApprovals: true,
      structuredQuestions: true,
      resume: true,
    });

    await adapter.createSession({ mode: "agent" });
    const { turnId } = await adapter.startTurn({ prompt: "Fix it" });
    connection.sendUpdate({ sessionUpdate: "agent_message_chunk", messageId: "answer", content: { type: "text", text: "Done" } });
    connection.sendRequest(11, "cursor/ask_question", {
      toolCallId: "question-tool",
      title: "Choose mode",
      questions: [{ id: "mode", prompt: "Mode?", options: [{ id: "agent", label: "Agent" }] }],
    });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "question.requested", turnId })));
    const question = onEvent.mock.calls.map(([event]) => event).find((event) => event.type === "question.requested");
    adapter.resolveQuestion({ requestId: question.payload.requestId, answers: [["agent"]], rejected: false, turnId });
    await vi.waitFor(() => expect(connection.respond).toHaveBeenCalledWith(11, expect.objectContaining({ outcome: "answered" })));
    connection.finishPrompt({ stopReason: "end_turn" });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.completed" })));
    await adapter.dispose();
  });
});

class FakeCursorConnection extends EventEmitter {
  constructor() {
    super();
    this.closed = false;
    this.prompt = deferred();
    this.request = vi.fn(async (method) => {
      if (method === "initialize") return {
        protocolVersion: 1,
        agentInfo: { name: "Cursor", version: "2026.08.1" },
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: {} },
          promptCapabilities: { image: true },
          _meta: { cursor: { askQuestion: 1 } },
        },
        authMethods: [{ id: "cursor_login" }],
      };
      if (method === "authenticate") return {};
      if (method === "session/new" || method === "session/load") return {
        sessionId: "cursor-session",
        modes: { currentModeId: "agent", availableModes: [{ id: "agent", name: "Agent" }, { id: "plan", name: "Plan" }] },
      };
      if (method === "session/prompt") return this.prompt.promise;
      if (method === "session/set_mode") return {};
      throw new Error(`Unexpected Cursor ACP request: ${method}`);
    });
    this.notify = vi.fn();
    this.respond = vi.fn();
    this.respondError = vi.fn();
  }
  sendUpdate(update) { this.emit("notification", { method: "session/update", params: { sessionId: "cursor-session", update } }); }
  sendRequest(id, method, params) { this.emit("request", { id, method, params }); }
  finishPrompt(result) { this.prompt.resolve(result); this.prompt = deferred(); }
  dispose(reason, { expected = true } = {}) { this.closed = true; this.emit("exit", { expected, reason }); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
