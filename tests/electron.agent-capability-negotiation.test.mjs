import { describe, expect, it } from "vitest";
import {
  assertAgentRuntimeCapabilities,
  normalizeCapabilitySnapshot,
} from "../shared/agent-contract/runtime-schema.mjs";
import {
  ACP_INLINE_IMAGE_MAX_BYTES,
  AcpRuntimeAdapter,
  BASE_ACP_CAPABILITIES,
} from "../electron/main/agent/protocols/acp/acp-runtime-adapter.mjs";
import {
  CODEX_CAPABILITIES,
  CodexAppServerAdapter,
} from "../electron/main/agent/runtimes/codex/codex-app-server-adapter.mjs";
import {
  CLAUDE_CAPABILITIES,
  ClaudeAgentSdkAdapter,
} from "../electron/main/agent/runtimes/claude/claude-agent-sdk-adapter.mjs";
import { CursorAcpAdapter } from "../electron/main/agent/runtimes/cursor/cursor-acp-adapter.mjs";
import { assertAgentRuntimePort } from "../electron/main/agent/runtime/agent-runtime-port.mjs";

describe("Agent capability negotiation", () => {
  it("preserves only bounded protocol metadata, constraints and the compatibility projection", () => {
    expect(normalizeCapabilitySnapshot({
      streamingText: true,
      revision: "cursor-acp:1",
      protocol: {
        name: "acp",
        version: 1,
        agentVersion: "2026.08.1",
        extensions: { "cursor.askQuestion": 1, unsafe: "drop" },
      },
      constraints: { modelSwitch: "turn-boundary", forkRequiresIdle: true, unsafe: "drop" },
      unknownCapability: true,
    })).toMatchObject({
      streamingText: true,
      revision: "cursor-acp:1",
      protocol: {
        name: "acp",
        version: 1,
        agentVersion: "2026.08.1",
        extensions: { "cursor.askQuestion": 1 },
      },
      constraints: { modelSwitch: "turn-boundary", forkRequiresIdle: true },
    });
  });

  it("rejects capabilities that do not have a corresponding runtime operation", () => {
    expect(() => assertAgentRuntimeCapabilities({}, { structuredQuestions: true }, "broken"))
      .toThrow(/structuredQuestions.*resolveQuestion/);
  });

  it("keeps ACP data-url images below the JSONL frame budget", () => {
    expect(BASE_ACP_CAPABILITIES.referenceInputs.maxReferenceBytes).toBe(ACP_INLINE_IMAGE_MAX_BYTES);
    expect(ACP_INLINE_IMAGE_MAX_BYTES).toBeLessThan(1024 * 1024);
  });

  it.each([
    ["codex", CodexAppServerAdapter, CODEX_CAPABILITIES],
    ["claude", ClaudeAgentSdkAdapter, CLAUDE_CAPABILITIES],
    ["opencode-acp", AcpRuntimeAdapter, {
      ...BASE_ACP_CAPABILITIES,
      revision: "opencode-acp:1",
      protocol: { name: "acp", version: 1 },
    }],
    ["cursor", CursorAcpAdapter, {
      ...BASE_ACP_CAPABILITIES,
      structuredQuestions: true,
      revision: "cursor-acp:1",
      protocol: { name: "acp", version: 1 },
    }],
  ])("keeps the %s adapter and advertised operations conformant", (runtimeId, Adapter, capabilities) => {
    const adapter = Object.create(Adapter.prototype);
    expect(() => assertAgentRuntimePort(adapter, runtimeId)).not.toThrow();
    const normalized = assertAgentRuntimeCapabilities(adapter, capabilities, runtimeId);
    expect(normalized.revision).toMatch(/.+/);
    expect(normalized.protocol?.name).toMatch(/.+/);
  });
});
