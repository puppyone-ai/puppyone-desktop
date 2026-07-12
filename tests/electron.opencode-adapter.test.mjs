import { describe, expect, it, vi } from "vitest";
import { OpenCodeSidecarAdapter } from "../electron/main/agent/runtimes/opencode/opencode-sidecar-adapter.mjs";

describe("OpenCode AgentRuntimePort adapter", () => {
  it("uses native harness sessions, typed controls, files, history, fork and compaction", async () => {
    let eventListener = null;
    const client = clientFixture();
    const host = {
      acquire: vi.fn(async () => client),
      subscribe: vi.fn((listener) => { eventListener = listener; return () => { eventListener = null; }; }),
      onExit: vi.fn(() => () => {}),
      snapshot: vi.fn(() => ({ state: "ready" })),
    };
    const onEvent = vi.fn();
    const adapter = new OpenCodeSidecarAdapter({
      readiness: { status: "ready", executablePath: "/opencode", version: "1.17.18", source: "bundled", compatibility: "pinned" },
      workspaceRoot: "/workspace",
      host,
      onEvent,
      projectInstructionLoader: vi.fn(async () => ({ source: "AGENTS.md", text: "Keep tests green.", bytes: 17 })),
    });
    const inspection = await adapter.inspect();
    expect(inspection.providers).toEqual([expect.objectContaining({ id: "openai", displayName: "OpenAI", modelCount: 1 })]);
    expect(inspection.models[0]).toMatchObject({ model: "openai/gpt-5", providerId: "openai", isDefault: true });
    expect(inspection.modes.map((mode) => mode.id)).toContain("build");
    expect(inspection.capabilities).toMatchObject({ structuredQuestions: true, mcp: true, skills: true, compaction: true });

    await adapter.createSession({ model: "openai/gpt-5:high", mode: "build" });
    expect(client.createSession).toHaveBeenCalledWith(expect.objectContaining({
      permission: expect.arrayContaining([
        { permission: "*", pattern: "*", action: "ask" },
        { permission: "read", pattern: "*", action: "allow" },
      ]),
      metadata: expect.objectContaining({
        "puppyone.runtimeCommit": "b8374b5a7c532e51aeb66b1dee9278de91526ef5",
        "puppyone.promptManifestSha256": "28ae2331636a9d9ba852953f00ee5cea1ca09fccd4dfff37d92b1cc70605406d",
      }),
    }));
    const turn = await adapter.startTurn({
      prompt: "Fix it",
      model: "openai/gpt-5:high",
      mode: "build",
      attachments: [{ path: "/workspace/image.png", name: "image.png", mime: "image/png", snapshotUrl: "data:image/png;base64,aW1hZ2U=" }],
      contextReferences: [{ path: "/workspace/readme.md", name: "readme.md", mime: "text/markdown", snapshotUrl: "data:text/markdown;base64,cmVhZG1l" }],
    });
    expect(turn.turnId).toMatch(/^opencode:/);
    expect(client.promptAsync).toHaveBeenCalledWith(expect.objectContaining({
      directory: "/workspace",
      sessionID: "ses_1",
      model: { providerID: "openai", modelID: "gpt-5", variant: "high" },
      agent: "build",
      system: expect.stringContaining("Keep tests green."),
      parts: expect.arrayContaining([
        { type: "text", text: "Fix it" },
        expect.objectContaining({ type: "file", filename: "readme.md", url: "data:text/markdown;base64,cmVhZG1l" }),
        expect.objectContaining({ type: "file", filename: "image.png", url: "data:image/png;base64,aW1hZ2U=" }),
      ]),
    }));

    await eventListener({ directory: "/workspace", payload: { type: "session.idle", properties: { sessionID: "ses_1" } } });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.completed", turnId: turn.turnId }));
    const commandTurn = await adapter.startTurn({ prompt: "/init fast", model: "openai/gpt-5:high", mode: "build" });
    expect(client.command).toHaveBeenCalledWith(expect.objectContaining({
      command: "init",
      arguments: "fast",
      model: { providerID: "openai", modelID: "gpt-5", variant: "high" },
      variant: "high",
      parts: expect.arrayContaining([expect.objectContaining({ filename: "AGENTS.md", url: expect.stringMatching(/^data:text\/plain;base64,/) })]),
    }), { timeoutMs: 21_600_000 });
    await eventListener({ directory: "/workspace", payload: { type: "session.idle", properties: { sessionID: "ses_1" } } });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.completed", turnId: commandTurn.turnId }));
    await adapter.resumeSession({ threadId: "ses_1", model: "openai/gpt-5:high", mode: "build" });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.started", turnId: "opencode:resumed:ses_1" }));
    await adapter.resolveApproval({ requestId: "perm_1", decision: "accept" });
    await adapter.resolveQuestion({ requestId: "question_1", answers: [["Yes"]] });
    await adapter.readHistory();
    await adapter.forkSession();
    await adapter.compactSession();
    expect(client.replyPermission).toHaveBeenCalledWith(expect.objectContaining({ requestID: "perm_1", reply: "once" }));
    expect(client.replyPermission).toHaveBeenCalledWith(expect.objectContaining({ requestID: "stale_perm", reply: "reject" }));
    expect(client.rejectQuestion).toHaveBeenCalledWith(expect.objectContaining({ requestID: "stale_question" }));
    expect(client.updateSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: "ses_1",
      permission: expect.arrayContaining([{ permission: "*", pattern: "*", action: "ask" }]),
    }));
    expect(client.replyQuestion).toHaveBeenCalledWith(expect.objectContaining({ requestID: "question_1", answers: [["Yes"]] }));
    expect(client.messages).toHaveBeenCalled();
    expect(client.forkSession).toHaveBeenCalled();
    expect(client.summarize).toHaveBeenCalledWith(expect.objectContaining({ model: { providerID: "openai", modelID: "gpt-5", variant: "high" } }));
    await adapter.dispose();
    expect(eventListener).toBeNull();
    expect(client.abortSession).toHaveBeenCalledWith(expect.objectContaining({ sessionID: "ses_1" }), { timeoutMs: 2_000 });
  });

  it("reconciles missed output and blocking requests before completing a reconnected turn", async () => {
    let reconnectListener = null;
    const client = clientFixture();
    client.messages.mockResolvedValue([
      {
        info: { id: "user_1", sessionID: "ses_1", role: "user" },
        parts: [{ id: "prompt_1", type: "text", text: "Fix it" }],
      },
      {
        info: {
          id: "assistant_1",
          parentID: "user_1",
          sessionID: "ses_1",
          role: "assistant",
          tokens: { input: 5, output: 3 },
        },
        parts: [
          { id: "answer_1", type: "text", text: "Recovered output" },
          {
            id: "tool_1",
            callID: "call_1",
            type: "tool",
            tool: "bash",
            state: { status: "completed", title: "Tests", output: "passed" },
          },
        ],
      },
    ]);
    client.permissions.mockResolvedValue([{
      id: "permission_1",
      sessionID: "ses_1",
      permission: "bash",
      metadata: { command: "npm test" },
    }]);
    client.questions.mockResolvedValue([{
      id: "question_1",
      sessionID: "ses_1",
      questions: [{ header: "Choice", question: "Continue?", options: [{ label: "Yes" }] }],
    }]);
    client.sessionStatus.mockResolvedValue({ ses_1: { type: "idle" } });
    const host = {
      acquire: vi.fn(async () => client),
      subscribe: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      onReconnect: vi.fn((listener) => {
        reconnectListener = listener;
        return () => { reconnectListener = null; };
      }),
      snapshot: vi.fn(() => ({ state: "ready" })),
    };
    const onEvent = vi.fn();
    const adapter = new OpenCodeSidecarAdapter({
      readiness: { status: "ready", executablePath: "/opencode", version: "1.17.18", source: "bundled", compatibility: "pinned" },
      workspaceRoot: "/workspace",
      host,
      onEvent,
      projectInstructionLoader: vi.fn(async () => ({ source: null, text: "", bytes: 0 })),
    });

    await adapter.createSession({ model: "openai/gpt-5", mode: "build" });
    const { turnId } = await adapter.startTurn({ prompt: "Fix it", model: "openai/gpt-5", mode: "build" });
    await reconnectListener();

    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "assistant.completed",
      "tool.completed",
      "usage.updated",
      "approval.requested",
      "question.requested",
      "turn.completed",
    ]);
    expect(onEvent.mock.calls.every(([event]) => event.turnId === turnId)).toBe(true);
    expect(client.messages).toHaveBeenCalledWith({ directory: "/workspace", sessionID: "ses_1" });
    await adapter.dispose();
    expect(reconnectListener).toBeNull();
  });

  it("reports missing model-provider setup instead of creating an unusable chat", async () => {
    const client = clientFixture();
    client.providerCatalog.mockResolvedValue({ all: [], connected: [], default: {} });
    const host = {
      acquire: vi.fn(async () => client),
      subscribe: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      snapshot: vi.fn(() => ({ state: "ready" })),
    };
    const adapter = new OpenCodeSidecarAdapter({
      readiness: { status: "ready", executablePath: "/opencode", version: "1.17.18", source: "bundled", compatibility: "pinned" },
      workspaceRoot: "/workspace",
      host,
    });

    const inspection = await adapter.inspect();

    expect(inspection.account).toMatchObject({ account: null, requiresRuntimeSetup: true });
    expect(inspection.models).toEqual([]);
    await adapter.dispose();
  });

  it("offers only connected providers and text-and-tools Agent models", async () => {
    const client = clientFixture();
    client.providerCatalog.mockResolvedValue({
      all: [
        {
          id: "google",
          name: "Google",
          source: "env",
          models: {
            "gemini-3-pro": model("gemini-3-pro", "Gemini 3 Pro"),
            "nano-banana-pro": model("nano-banana-pro", "Nano Banana Pro", { output: { text: false, image: true }, toolcall: false }),
            "gemini-embedding-001": model("gemini-embedding-001", "Gemini Embedding 001", { output: { text: false }, toolcall: false }),
            "gemini-tts": model("gemini-tts", "Gemini TTS", { output: { text: false, audio: true }, toolcall: false }),
            "unknown-capabilities": { id: "unknown-capabilities", name: "Unknown Capabilities", status: "active" },
          },
        },
        { id: "openai", name: "OpenAI", source: "api", models: { "gpt-5": model("gpt-5", "GPT-5") } },
      ],
      connected: ["google"],
      default: { google: "gemini-3-pro", openai: "gpt-5" },
    });
    const host = {
      acquire: vi.fn(async () => client),
      subscribe: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      snapshot: vi.fn(() => ({ state: "ready" })),
    };
    const adapter = new OpenCodeSidecarAdapter({
      readiness: { status: "ready", executablePath: "/opencode", version: "1.17.18", source: "bundled", compatibility: "pinned" },
      workspaceRoot: "/workspace",
      host,
    });

    const inspection = await adapter.inspect();

    expect(inspection.providers.map((provider) => provider.id)).toEqual(["google"]);
    expect(inspection.models.map((entry) => entry.model)).toEqual(["google/gemini-3-pro"]);
    await adapter.dispose();
  });
});

function clientFixture() {
  return {
    providerCatalog: vi.fn(async () => ({
      all: [{ id: "openai", name: "OpenAI", source: "api", models: { "gpt-5": { ...model("gpt-5", "GPT-5"), family: "gpt", variants: { high: {} } } } }],
      connected: ["openai"],
      default: { openai: "gpt-5" },
    })),
    agents: vi.fn(async () => [{ name: "build", mode: "primary", description: "Build", hidden: false }]),
    commands: vi.fn(async () => [{ name: "init", description: "Initialize", source: "builtin" }]),
    createSession: vi.fn(async () => ({ id: "ses_1", title: "Session", time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 } })),
    getSession: vi.fn(async () => ({ id: "ses_1", title: "Session" })),
    sessionStatus: vi.fn(async () => ({ ses_1: { type: "busy" } })),
    permissions: vi.fn(async () => [{ id: "stale_perm", sessionID: "ses_1" }]),
    questions: vi.fn(async () => [{ id: "stale_question", sessionID: "ses_1" }]),
    promptAsync: vi.fn(async () => null),
    command: vi.fn(async () => null),
    abortSession: vi.fn(async () => true),
    replyPermission: vi.fn(async () => true),
    replyQuestion: vi.fn(async () => true),
    rejectQuestion: vi.fn(async () => true),
    messages: vi.fn(async () => []),
    forkSession: vi.fn(async () => ({ id: "ses_2", title: "Fork" })),
    updateSession: vi.fn(async () => true),
    deleteSession: vi.fn(async () => true),
    listSessions: vi.fn(async () => []),
    summarize: vi.fn(async () => true),
  };
}

function model(id, name, capabilities = {}) {
  return {
    id,
    name,
    family: "gemini",
    status: "active",
    limit: { context: 128_000 },
    capabilities: {
      input: { text: true },
      output: { text: true },
      toolcall: true,
      ...capabilities,
    },
  };
}
