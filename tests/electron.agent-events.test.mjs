import { describe, expect, it } from "vitest";
import {
  createAgentEventEnvelope,
  isAgentEventEnvelope,
  redactSecretText,
  redactSecrets,
} from "../electron/main/agent/agent-events.mjs";

describe("normalized AgentEvent envelopes", () => {
  it("validates a versioned normalized event and rejects unknown vocabulary", () => {
    const event = createAgentEventEnvelope({
      sequence: 1,
      sessionId: "session-1",
      type: "assistant.delta",
      payload: { delta: "hello" },
    });
    expect(isAgentEventEnvelope(event)).toBe(true);
    expect(() => createAgentEventEnvelope({
      sequence: 2,
      sessionId: "session-1",
      type: "codex/raw/event",
    })).toThrow(/invalid normalized/i);
  });

  it("redacts common credential shapes recursively before renderer delivery", () => {
    const redacted = redactSecrets({
      authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
      nested: { apiKey: "sk-abcdefghijklmnopqrstuvwxyz" },
      message: "refresh_token=secret-value",
    });
    expect(JSON.stringify(redacted)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(JSON.stringify(redacted)).not.toContain("secret-value");
    expect(redactSecretText("Bearer abcdefghijklmnopqrstuvwxyz")).toBe("Bearer [redacted]");
  });
});
