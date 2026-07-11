import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createOpenCodeEventState,
  normalizeOpenCodeActiveTurnHistory,
  normalizeOpenCodeEvent,
  normalizeOpenCodeHistory,
} from "../electron/main/agent/runtimes/opencode/opencode-events.mjs";

describe("OpenCode event normalization", () => {
  it("normalizes the pinned source fixture without leaking the runtime protocol", () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/opencode/v1-events.json", import.meta.url), "utf8"));
    const state = createOpenCodeEventState();
    state.activeTurnId = "turn_1";
    const events = fixture.events.flatMap((event) => normalizeOpenCodeEvent(event, state));
    expect(events.map((event) => event.type)).toEqual([
      "assistant.completed",
      "approval.requested",
      "question.requested",
      "turn.completed",
    ]);
    expect(events[1]).toMatchObject({
      providerSessionId: "ses_1",
      turnId: "turn_1",
      payload: { requestId: "perm_1", availableDecisions: ["accept", "acceptForSession", "decline", "cancel"] },
    });
  });

  it("rebuilds a provider-neutral transcript from OpenCode native history", () => {
    const events = normalizeOpenCodeHistory([
      {
        info: { id: "user_1", sessionID: "ses_1", role: "user", model: { providerID: "openai", modelID: "gpt-5" } },
        parts: [{ id: "text_1", type: "text", text: "Fix tests" }],
      },
      {
        info: { id: "assistant_1", parentID: "user_1", sessionID: "ses_1", role: "assistant", tokens: { input: 4, output: 2 }, cost: 0.1 },
        parts: [
          { id: "text_2", type: "text", text: "Done" },
          { id: "tool_1", callID: "call_1", type: "tool", tool: "bash", state: { status: "completed", title: "Tests", input: {}, output: "ok" } },
        ],
      },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "assistant.completed",
      "tool.completed",
      "usage.updated",
      "turn.completed",
    ]);
  });

  it("emits one terminal boundary for a multi-step assistant loop", () => {
    const events = normalizeOpenCodeHistory([
      {
        info: { id: "user_1", sessionID: "ses_1", role: "user" },
        parts: [{ id: "prompt_1", type: "text", text: "Run tests" }],
      },
      {
        info: { id: "assistant_1", parentID: "user_1", sessionID: "ses_1", role: "assistant" },
        parts: [{ id: "tool_1", callID: "call_1", type: "tool", tool: "bash", state: { status: "completed", output: "ok" } }],
      },
      {
        info: { id: "assistant_2", parentID: "user_1", sessionID: "ses_1", role: "assistant" },
        parts: [{ id: "answer_1", type: "text", text: "All tests pass" }],
      },
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "turn.started",
      "tool.completed",
      "assistant.completed",
      "turn.completed",
    ]);
    expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
  });

  it("reconciles only the active native turn without synthesizing a terminal event", () => {
    const events = normalizeOpenCodeActiveTurnHistory([
      {
        info: { id: "user_old", sessionID: "ses_1", role: "user" },
        parts: [{ id: "old_prompt", type: "text", text: "Old turn" }],
      },
      {
        info: { id: "assistant_old", parentID: "user_old", sessionID: "ses_1", role: "assistant" },
        parts: [{ id: "old_answer", type: "text", text: "Old answer" }],
      },
      {
        info: { id: "user_current", sessionID: "ses_1", role: "user" },
        parts: [{ id: "current_prompt", type: "text", text: "Current turn" }],
      },
      {
        info: {
          id: "assistant_current",
          parentID: "user_current",
          sessionID: "ses_1",
          role: "assistant",
          tokens: { input: 4, output: 3 },
        },
        parts: [
          { id: "current_answer", type: "text", text: "Recovered answer" },
          {
            id: "current_tool",
            callID: "call_current",
            type: "tool",
            tool: "bash",
            state: { status: "completed", title: "Tests", output: "ok" },
          },
        ],
      },
    ], "app_turn_1");

    expect(events.map((event) => event.type)).toEqual([
      "assistant.completed",
      "tool.completed",
      "usage.updated",
    ]);
    expect(events.every((event) => event.turnId === "app_turn_1")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("Old answer");
  });

  it("does not misclassify an out-of-order user text part as assistant output", () => {
    const state = createOpenCodeEventState();
    state.activeTurnId = "turn_1";
    expect(normalizeOpenCodeEvent({
      type: "message.part.updated",
      properties: { part: { id: "part_1", messageID: "message_1", sessionID: "ses_1", type: "text", text: "user text" } },
    }, state)).toEqual([]);
    expect(normalizeOpenCodeEvent({
      type: "message.part.delta",
      properties: { partID: "part_1", messageID: "message_1", sessionID: "ses_1", field: "text", delta: "user delta" },
    }, state)).toEqual([]);
  });
});
