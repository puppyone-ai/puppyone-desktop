import { describe, expect, it } from "vitest";
import {
  agentProjectionLimits,
  applyAgentEvent,
  applyAgentEvents,
  createAgentProjection,
} from "../src/features/desktop-agent/agentProjection";
import type { AgentEvent, AgentEventType } from "../src/features/desktop-agent/agentTypes";

describe("Desktop Agent transcript projection", () => {
  it("concatenates assistant deltas and lets completed content finalize authoritatively", () => {
    const projection = applyAgentEvents(createAgentProjection(), [
      event(1, "turn.started", { prompt: "Fix the test" }, "turn-1"),
      event(2, "assistant.delta", { delta: "I found " }, "turn-1", "message-1"),
      event(3, "assistant.delta", { delta: "the issue." }, "turn-1", "message-1"),
      event(4, "assistant.completed", { text: "I found and fixed the issue." }, "turn-1", "message-1"),
      event(5, "turn.completed", { status: "completed" }, "turn-1"),
    ]);

    expect(projection.messages).toHaveLength(2);
    expect(projection.messages[0]).toMatchObject({ role: "user", text: "Fix the test" });
    expect(projection.messages[1]).toMatchObject({
      role: "assistant",
      text: "I found and fixed the issue.",
      streaming: false,
      terminalState: "completed",
    });
  });

  it("ignores duplicates, marks gaps, and keeps partial assistant text after interruption", () => {
    let projection = applyAgentEvent(createAgentProjection(), event(1, "turn.started", { prompt: "Go" }, "turn-1"));
    projection = applyAgentEvent(projection, event(3, "assistant.delta", { delta: "Partial" }, "turn-1", "message-1"));
    projection = applyAgentEvent(projection, event(3, "assistant.delta", { delta: " duplicate" }, "turn-1", "message-1"));
    projection = applyAgentEvent(projection, event(4, "turn.interrupted", {}, "turn-1"));

    expect(projection.partialHistory).toBe(true);
    expect(projection.missingRanges).toEqual([{ from: 2, to: 2 }]);
    expect(projection.messages[1]).toMatchObject({ text: "Partial", terminalState: "interrupted" });
  });

  it("tracks tool lifecycle, bounded command output, and stale approval removal", () => {
    const largeOutput = "x".repeat(80 * 1024);
    const projection = applyAgentEvents(createAgentProjection(), [
      event(1, "tool.started", { kind: "command", label: "npm test", status: "running" }, "turn-1", "tool-1"),
      event(2, "command.output.delta", { delta: largeOutput }, "turn-1", "tool-1"),
      event(3, "approval.requested", {
        requestId: "codex:7",
        kind: "command",
        title: "Run command",
        availableDecisions: ["accept", "decline"],
      }, "turn-1", "tool-1"),
      event(4, "tool.completed", { kind: "command", label: "npm test", status: "completed" }, "turn-1", "tool-1"),
      event(5, "approval.resolved", { requestId: "codex:7", decision: "decline" }, "turn-1", "tool-1"),
    ]);

    expect(projection.activities[0]).toMatchObject({ status: "completed", label: "npm test" });
    expect(projection.activities[0].output.length).toBe(64 * 1024);
    expect(projection.approvals).toEqual([]);
  });

  it("bounds streamed messages and reasoning before they reach renderer state", () => {
    const oversized = "x".repeat(agentProjectionLimits.maxMessageText * 2);
    const projection = applyAgentEvents(createAgentProjection(), [
      event(1, "turn.started", { prompt: oversized }, "turn-bound"),
      event(2, "assistant.delta", { delta: oversized }, "turn-bound", "message-bound"),
      event(3, "assistant.delta", { delta: oversized }, "turn-bound", "message-bound"),
      event(4, "reasoning.summary.delta", { delta: oversized }, "turn-bound", "reasoning-bound"),
      event(5, "reasoning.summary.delta", { delta: oversized }, "turn-bound", "reasoning-bound"),
    ]);

    expect(projection.messages[0].text).toHaveLength(agentProjectionLimits.maxMessageText);
    expect(projection.messages[1].text).toHaveLength(agentProjectionLimits.maxMessageText);
    expect(String(projection.activities[0].detail.delta)).toHaveLength(agentProjectionLimits.maxActivityText);
  });

  it("renders legacy nested provider errors as readable text", () => {
    const projection = applyAgentEvent(createAgentProjection(), event(1, "provider.error", {
      message: JSON.stringify({
        type: "error",
        error: { message: "Invalid value: 'max'. Use 'xhigh'.", param: "reasoning.effort" },
        status: 400,
      }),
    }, "turn-1"));

    expect(projection.activities[0].label).toBe("Invalid value: 'max'. Use 'xhigh'.");
  });

  it("normalizes unrecognized provider activity status to a neutral unknown state", () => {
    const projection = applyAgentEvent(createAgentProjection(), event(1, "provider.activity", {
      label: "Future provider activity",
      status: "teleporting",
    }, "turn-1", "activity-1"));

    expect(projection.activities[0]).toMatchObject({ status: "unknown" });
    expect(projection.parts.find((part) => part.kind === "tool")).toMatchObject({ status: "unknown" });
  });

  it("collapses duplicate provider terminal errors for the same turn", () => {
    const projection = applyAgentEvents(createAgentProjection(), [
      event(1, "turn.started", { prompt: "Hello" }, "turn-1"),
      event(2, "provider.error", { message: "API key not valid." }, "turn-1", "assistant-1"),
      event(3, "turn.failed", { status: "failed", message: "API key not valid." }, "turn-1"),
      event(4, "provider.error", { message: "API key not valid." }, "turn-1"),
    ]);

    expect(projection.activities.filter((activity) => activity.kind === "error")).toHaveLength(1);
    expect(projection.parts.filter((part) => part.kind === "error")).toHaveLength(1);
    expect(projection.activities.find((activity) => activity.kind === "error")?.label).toBe("API key not valid.");
  });
});

function event(
  sequence: number,
  type: AgentEventType,
  payload: Record<string, unknown>,
  turnId: string | null = null,
  itemId: string | null = null,
): AgentEvent {
  return {
    schemaVersion: 1,
    sequence,
    sessionId: "session-1",
    provider: "codex",
    providerSessionId: "thread-1",
    turnId,
    itemId,
    emittedAt: new Date(sequence * 1000).toISOString(),
    type,
    payload,
  };
}
