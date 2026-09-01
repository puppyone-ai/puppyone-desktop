import { describe, expect, it } from "vitest";
import {
  applyAgentEvents,
  createAgentProjection,
} from "../src/features/desktop-agent/agentProjection";
import type { AgentEvent, AgentEventType } from "../src/features/desktop-agent/agentTypes";
import { LIVE_AGENT_ACTIVITY_STATUSES } from "../src/features/desktop-agent/domain/agent-turn-lifecycle";

const harnessFixtures = [
  {
    runtimeId: "codex",
    events: [
      event("codex", 1, "turn.started", { prompt: "Inspect it" }),
      event("codex", 2, "reasoning.summary.delta", { delta: "", boundary: true }, "reasoning-1"),
      event("codex", 3, "assistant.delta", { delta: "Done" }, "assistant-1"),
      event("codex", 4, "assistant.completed", { text: "Done" }, "assistant-1"),
    ],
  },
  {
    runtimeId: "cursor",
    events: [
      event("cursor", 1, "turn.started", { prompt: "?" }),
      event("cursor", 2, "reasoning.summary.delta", { delta: "", boundary: true, status: "working" }, "cursor-thought-1"),
      event("cursor", 3, "assistant.delta", { delta: "I'm here." }, "cursor-message-1"),
      event("cursor", 4, "assistant.completed", { text: "I'm here." }, "cursor-message-1"),
    ],
  },
  {
    runtimeId: "claude",
    events: [
      event("claude", 1, "turn.started", { prompt: "Inspect it" }),
      event("claude", 2, "reasoning.summary.delta", { delta: "", boundary: true }, "claude-thinking-1"),
      event("claude", 3, "tool.started", { kind: "read", tool: "read", label: "Read file", status: "running" }, "tool-1"),
      event("claude", 4, "tool.completed", { kind: "read", tool: "read", label: "Read file", status: "completed" }, "tool-1"),
      event("claude", 5, "assistant.completed", { text: "Done" }, "claude-message-1"),
    ],
  },
  {
    runtimeId: "opencode",
    events: [
      event("opencode", 1, "turn.started", { prompt: "Inspect it" }),
      event("opencode", 2, "reasoning.summary.delta", { delta: "", boundary: true, status: "working" }, "opencode-thought-1"),
      event("opencode", 3, "plan.updated", { steps: [{ step: "Inspect", status: "in-progress" }] }, "current-plan"),
      event("opencode", 4, "assistant.completed", { text: "Done" }, "opencode-message-1"),
    ],
  },
] satisfies Array<{ runtimeId: string; events: AgentEvent[] }>;

const terminalScenarios = [
  { terminalType: "turn.completed", expectedStatus: "completed" },
  { terminalType: "turn.failed", expectedStatus: "failed" },
  { terminalType: "turn.interrupted", expectedStatus: "interrupted" },
] as const;

describe("Desktop Agent normalized Harness lifecycle conformance", () => {
  const cases = harnessFixtures.flatMap((fixture) => terminalScenarios.map((terminal) => ({ ...fixture, ...terminal })));

  it("defines the complete shared set of live activity states", () => {
    expect([...LIVE_AGENT_ACTIVITY_STATUSES]).toEqual([
      "queued",
      "running",
      "pending",
      "in-progress",
      "waiting-for-user",
    ]);
  });

  it.each(cases)("settles every $runtimeId child on $terminalType", ({ runtimeId, events, terminalType, expectedStatus }) => {
    const sequence = Math.max(...events.map((entry) => entry.sequence)) + 1;
    const pendingTurnState = [
      event(runtimeId, sequence, "provider.connection.updated", {
        state: "reconnecting",
        message: "Reconnecting",
        attempt: 1,
        maxAttempts: 5,
      }),
      event(runtimeId, sequence + 1, "approval.requested", {
        requestId: `${runtimeId}-approval`,
        kind: "command",
      }, `${runtimeId}-approval`),
      event(runtimeId, sequence + 2, "question.requested", {
        requestId: `${runtimeId}-question`,
        questions: [],
      }, `${runtimeId}-question`),
    ];
    const terminal = event(runtimeId, sequence + pendingTurnState.length, terminalType, { status: expectedStatus });
    const projection = applyAgentEvents(createAgentProjection(), [...events, ...pendingTurnState, terminal]);
    const turn = projection.turns.find((entry) => entry.id === "turn-1");
    const liveActivities = projection.activities.filter((activity) => LIVE_AGENT_ACTIVITY_STATUSES.has(activity.status));
    const liveParts = projection.parts.filter((part) => (
      "status" in part && typeof part.status === "string" && LIVE_AGENT_ACTIVITY_STATUSES.has(part.status)
    ));

    expect(turn).toMatchObject({ status: expectedStatus });
    expect(projection.runningTurnId).toBeNull();
    expect(projection.connectionStatus).toBeNull();
    expect(projection.approvals).toHaveLength(0);
    expect(projection.questions).toHaveLength(0);
    expect(projection.parts.find((part) => part.kind === "permission")).toMatchObject({ state: "resolved" });
    expect(projection.parts.find((part) => part.kind === "question")).toMatchObject({ state: "resolved" });
    expect(liveActivities).toEqual([]);
    expect(liveParts).toEqual([]);
    expect(projection.parts.filter((part) => part.kind === "reasoning")).toEqual([
      expect.objectContaining({ turnId: "turn-1", status: expectedStatus }),
    ]);
    expect(projection.parts.find((part) => part.kind === "assistant")).toMatchObject({
      streaming: false,
      terminalState: expectedStatus,
    });
  });
});

function event(
  provider: string,
  sequence: number,
  type: AgentEventType,
  payload: Record<string, unknown>,
  itemId: string | null = null,
): AgentEvent {
  return {
    schemaVersion: 1,
    sequence,
    sessionId: `session-${provider}`,
    provider,
    providerSessionId: `${provider}-native-session`,
    turnId: "turn-1",
    itemId,
    emittedAt: new Date(sequence * 1000).toISOString(),
    type,
    payload,
  };
}
