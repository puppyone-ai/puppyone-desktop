import { describe, expect, it, vi } from "vitest";
import { ClaudeAgentSdkAdapter } from "../electron/main/agent/runtimes/claude/claude-agent-sdk-adapter.mjs";

describe("Claude Agent SDK runtime adapter", () => {
  it("inspects the native account/model catalog with user-only settings and the Claude Code prompt", async () => {
    const query = inspectionQuery();
    const sdk = { query: vi.fn(() => query) };
    const adapter = createAdapter({ sdk });

    const inspection = await adapter.inspect();

    expect(inspection.account).toMatchObject({
      account: { type: "firstParty", email: "user@example.test", planType: "api" },
      requiresRuntimeSetup: false,
    });
    expect(inspection.models[0]).toMatchObject({ model: "claude-sonnet", variants: ["low", "high"] });
    expect(inspection.capabilities).toMatchObject({ manualApprovals: true, structuredQuestions: true, fork: true });
    const options = sdk.query.mock.calls[0][0].options;
    expect(options.settingSources).toEqual(["user"]);
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code" });
    expect(options.permissionMode).toBe("default");
    expect(options.allowDangerouslySkipPermissions).toBeUndefined();
    expect(query.close).toHaveBeenCalled();
    adapter.dispose();
  });

  it("does not route third-party product traffic through Claude subscription OAuth", async () => {
    const query = inspectionQuery({
      email: "subscriber@example.test",
      subscriptionType: "pro",
      apiProvider: "firstParty",
      tokenSource: "oauth",
    });
    const adapter = createAdapter({ sdk: { query: vi.fn(() => query) } });

    const inspection = await adapter.inspect();

    expect(inspection.account).toMatchObject({
      account: null,
      requiresRuntimeSetup: true,
      error: expect.stringContaining("subscription OAuth cannot be used"),
    });
    adapter.dispose();
  });

  it("correlates native approvals and structured questions without persisting permission changes", async () => {
    const controller = runningQuery();
    const sdk = {
      query: vi.fn(() => controller.query),
      getSessionInfo: vi.fn(),
      getSessionMessages: vi.fn(),
      forkSession: vi.fn(),
    };
    const onEvent = vi.fn();
    const adapter = createAdapter({ sdk, onEvent });
    await adapter.createSession({ model: "claude-sonnet", mode: "agent" });
    const { turnId } = await adapter.startTurn({ prompt: "Fix it", model: "claude-sonnet", mode: "agent" });
    await tick();

    const options = sdk.query.mock.calls[0][0].options;
    const approval = options.canUseTool("Bash", { command: "npm test" }, {
      toolUseID: "tool-1",
      title: "Allow command",
      suggestions: [
        { type: "addRules", destination: "session", rules: [], behavior: "allow" },
        { type: "addRules", destination: "localSettings", rules: [], behavior: "allow" },
      ],
    });
    await tick();
    const approvalEvent = onEvent.mock.calls.map(([event]) => event).find((event) => event.type === "approval.requested");
    expect(approvalEvent).toMatchObject({ turnId, itemId: "tool-1" });
    adapter.resolveApproval({ requestId: approvalEvent.payload.requestId, decision: "acceptForSession", turnId });
    await expect(approval).resolves.toMatchObject({
      behavior: "allow",
      updatedPermissions: [{ destination: "session" }],
    });

    const question = options.canUseTool("AskUserQuestion", {
      questions: [{ header: "Choice", question: "Continue?", multiSelect: false, options: [{ label: "Yes" }] }],
    }, { toolUseID: "question-1" });
    await tick();
    const questionEvent = onEvent.mock.calls.map(([event]) => event).find((event) => event.type === "question.requested");
    adapter.resolveQuestion({ requestId: questionEvent.payload.requestId, answers: [["Yes"]], rejected: false, turnId });
    await expect(question).resolves.toEqual({
      behavior: "allow",
      updatedInput: expect.objectContaining({ answers: { "Continue?": "Yes" } }),
    });

    controller.finish();
    await tick();
    expect(onEvent.mock.calls.map(([event]) => event.type)).toContain("turn.completed");
    adapter.dispose();
  });
});

function createAdapter({ sdk, onEvent = vi.fn() }) {
  return new ClaudeAgentSdkAdapter({
    readiness: { status: "ready", source: "user-installed", version: "2.1.0", executablePath: "/tools/claude", environment: { PATH: "/usr/bin", HOME: "/home/test" } },
    workspaceRoot: "/workspace",
    appVersion: "1.2.3",
    sdkLoader: vi.fn(async () => sdk),
    onEvent,
    projectInstructionLoader: vi.fn(async () => []),
  });
}

function inspectionQuery(account = {
  email: "user@example.test",
  subscriptionType: "api",
  apiProvider: "firstParty",
  apiKeySource: "environment",
}) {
  return {
    initializationResult: vi.fn(async () => ({
      account,
      models: [{ value: "claude-sonnet", displayName: "Sonnet", description: "Fast", supportedEffortLevels: ["low", "high"] }],
      commands: [{ name: "review", description: "Review changes", argumentHint: "" }],
    })),
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {},
  };
}

function runningQuery() {
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  return {
    finish,
    query: {
      interrupt: vi.fn(async () => undefined),
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init", session_id: "claude-session-1", model: "claude-sonnet", permissionMode: "default" };
        await finished;
        yield { type: "result", subtype: "success", session_id: "claude-session-1", usage: {}, num_turns: 1 };
      },
    },
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
