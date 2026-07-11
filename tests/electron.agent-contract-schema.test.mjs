import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_EVENT_TYPES,
  AGENT_IPC_CHANNELS,
  AGENT_RUNTIME_CAPABILITIES,
  assertAgentEventEnvelope,
  assertAgentIpcResponse,
  assertAgentRuntimeCapabilities,
  parseAgentIpcRequest,
} from "../shared/agent-contract/schema.mjs";

describe("shared Agent contract", () => {
  it("keeps runtime constants synchronized with the TypeScript contract", () => {
    const source = readFileSync(new URL("../shared/agent-contract/types.ts", import.meta.url), "utf8");
    expect(typeLiterals(source, "AgentEventType", "AgentEventPayloadBase")).toEqual([...AGENT_EVENT_TYPES]);
    expect(typeKeys(source, "AgentCapabilities", "AgentAccountState")).toEqual([...AGENT_RUNTIME_CAPABILITIES]);
    expect(typeLiterals(source, "AgentIpcChannel", null)).toEqual([...AGENT_IPC_CHANNELS]);
  });

  it("parses and strips IPC input before workspace authorization", () => {
    expect(parseAgentIpcRequest("agent:turn-start", {
      rootPath: "/workspace",
      sessionId: "session-1",
      prompt: "  keep whitespace  ",
      unknownPrivilegedField: { shell: true },
      attachments: [{ path: "/workspace/a.md", name: "a.md", bytes: "not-authorized" }],
    })).toEqual({
      rootPath: "/workspace",
      sessionId: "session-1",
      prompt: "  keep whitespace  ",
      attachments: [{ path: "/workspace/a.md", name: "a.md" }],
    });
    expect(() => parseAgentIpcRequest("agent:approval-resolve", {
      rootPath: "/workspace",
      sessionId: "s",
      turnId: "t",
      requestId: "r",
      decision: "always-and-never-ask",
    })).toThrow(/Invalid Agent contract.*decision/i);
  });

  it("rejects malformed main-to-renderer responses and blocking events", () => {
    expect(() => assertAgentIpcResponse("agent:session-create", {
      session: { id: "s", runtimeId: "codex", provider: "codex", title: "Session" },
    })).toThrow(/workspaceRoot/i);
    expect(() => assertAgentEventEnvelope(event("approval.requested", {}))).toThrow(/requestId/i);
    expect(assertAgentEventEnvelope(event("assistant.delta", { delta: "safe" }))).toBeTruthy();
    expect(() => assertAgentIpcResponse("agent:providers-discover", {
      readiness: { runtimeId: "opencode", status: "ready" },
      providers: [{ id: "openai", displayName: "OpenAI", modelCount: -1 }],
      models: [],
      capabilities: {},
      warnings: [],
    })).toThrow(/modelCount/i);
  });

  it("requires methods for capabilities a runtime advertises", () => {
    expect(() => assertAgentRuntimeCapabilities({}, { manualApprovals: true }, "fixture")).toThrow(/resolveApproval/i);
    expect(assertAgentRuntimeCapabilities({ resolveApproval: vi.fn() }, { manualApprovals: true }, "fixture").manualApprovals).toBe(true);
  });
});

function event(type, payload) {
  return {
    schemaVersion: 1,
    sequence: 1,
    sessionId: "session-1",
    runtimeId: "fixture",
    provider: "fixture",
    providerSessionId: "native-1",
    turnId: "turn-1",
    itemId: "item-1",
    emittedAt: "2026-07-11T00:00:00.000Z",
    type,
    payload,
  };
}

function typeLiterals(source, startName, endName) {
  const block = typeBlock(source, startName, endName);
  return Array.from(block.matchAll(/\|\s*"([^"]+)"/g), (match) => match[1]);
}

function typeKeys(source, startName, endName) {
  const block = typeBlock(source, startName, endName);
  return Array.from(block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm), (match) => match[1]);
}

function typeBlock(source, startName, endName) {
  const start = source.indexOf(`export type ${startName}`);
  const end = endName ? source.indexOf(`${endName}`, start) : source.length;
  if (start < 0 || end < 0) throw new Error(`Type block ${startName} was not found.`);
  return source.slice(start, end);
}
