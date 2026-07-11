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
    expect(() => createAgentEventEnvelope({
      sequence: 2,
      sessionId: "session-1",
      providerSessionId: "x".repeat(257),
      type: "assistant.delta",
    })).toThrow(/invalid normalized/i);
  });

  it("bounds hostile object shapes before renderer delivery", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"safe":"ok"}');
    const event = createAgentEventEnvelope({
      sequence: 1,
      sessionId: "session-1",
      type: "tool.completed",
      payload,
    });
    expect(event.payload).toEqual({ safe: "ok" });
    expect({}.polluted).toBeUndefined();
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

  it("preserves token usage metrics while redacting common environment secrets", () => {
    const redacted = redactSecrets({
      tokenUsage: {
        inputTokens: 1200,
        cachedInputTokens: 400,
        outputTokens: 88,
        totalTokens: 1288,
      },
      accessToken: "secret-access-token",
    });
    expect(redacted.tokenUsage).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 400,
      outputTokens: 88,
      totalTokens: 1288,
    });
    expect(redacted.accessToken).toBe("[redacted]");
    expect(redactSecretText("AWS_SECRET_ACCESS_KEY=very-secret-value")).toBe("AWS_SECRET_ACCESS_KEY=[redacted]");
    expect(redactSecretText("CLIENT_SECRET=very-secret-value")).toBe("CLIENT_SECRET=[redacted]");
  });
});
