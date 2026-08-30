import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_EVENT_TYPES,
  AGENT_IPC_CHANNELS,
  AGENT_READINESS_CODES,
  AGENT_RUNTIME_CAPABILITIES,
  assertAgentEventEnvelope,
  assertAgentIpcResponse,
  assertAgentRuntimeCapabilities,
  normalizeReferenceInputCapabilities,
  parseAgentIpcRequest,
} from "../shared/agent-contract/schema.mjs";

describe("shared Agent contract", () => {
  it("keeps runtime constants synchronized with the TypeScript contract", () => {
    const source = readFileSync(new URL("../shared/agent-contract/types.ts", import.meta.url), "utf8");
    expect(typeLiterals(source, "AgentEventType", "AgentEventPayloadBase")).toEqual([...AGENT_EVENT_TYPES]);
    expect(typeLiterals(source, "AgentReadinessCode", "AgentRuntimeDescriptor")).toEqual([...AGENT_READINESS_CODES]);
    expect(typeKeys(source, "AgentCapabilities", "AgentAccountState")).toEqual([...AGENT_RUNTIME_CAPABILITIES]);
    expect(typeLiterals(source, "AgentIpcChannel", null)).toEqual([...AGENT_IPC_CHANNELS]);
  });

  it("parses and strips IPC input before workspace authorization", () => {
    expect(parseAgentIpcRequest("agent:local-connections-discover", {
      rootPath: "/workspace",
      refresh: true,
      executablePath: "/private/should-not-cross",
    })).toEqual({ rootPath: "/workspace", refresh: true });
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
    expect(assertAgentIpcResponse("agent:local-connections-discover", {
      connections: [{
        id: "codex",
        displayName: "Codex CLI",
        installation: "detected",
        version: "0.144.1",
        authentication: "signed-in",
        integration: "bridge-required",
        capabilities: { versionProbe: true, authenticationProbe: true, protocolProbe: true },
        selectable: false,
        statusMessage: "Detected; direct harness not enabled.",
        actions: [{ id: "refresh", label: "Refresh" }],
        source: "user-installation",
        executablePath: "/Users/private/.local/bin/codex",
        rawStatus: "private@example.test",
      }],
      scannedAt: "2026-07-12T00:00:00.000Z",
      warnings: [],
      environment: { OPENAI_API_KEY: "secret" },
    })).toEqual({
      connections: [{
        id: "codex",
        displayName: "Codex CLI",
        installation: "detected",
        version: "0.144.1",
        authentication: "signed-in",
        integration: "bridge-required",
        capabilities: { versionProbe: true, authenticationProbe: true, protocolProbe: true },
        selectable: false,
        statusMessage: "Detected; direct harness not enabled.",
        actions: [{ id: "refresh", label: "Refresh" }],
        source: "user-installation",
      }],
      scannedAt: "2026-07-12T00:00:00.000Z",
      warnings: [],
    });
    expect(() => assertAgentIpcResponse("agent:local-connections-discover", {
      connections: [{ id: "codex", displayName: "Codex CLI", installation: "ready" }],
      scannedAt: "not-a-date",
      warnings: [],
    })).toThrow(/installation|contract/i);
    expect(() => assertAgentIpcResponse("agent:session-create", {
      session: { id: "s", runtimeId: "codex", provider: "codex", title: "Session" },
    })).toThrow(/workspaceRoot/i);
    expect(() => assertAgentEventEnvelope(event("approval.requested", {}))).toThrow(/requestId/i);
    expect(assertAgentEventEnvelope(event("assistant.delta", { delta: "safe" }))).toBeTruthy();
    const referenceDisplay = { id: "ref-1", kind: "attachment", displayName: "capture.png", mime: "image/png", size: 3 };
    expect(assertAgentEventEnvelope(event("turn.started", { referenceDisplays: [referenceDisplay] }))).toBeTruthy();
    expect(() => assertAgentEventEnvelope(event("turn.started", {
      referenceDisplays: [{ ...referenceDisplay, token: "opaque-secret" }],
    }))).toThrow(/renderer-safe reference metadata/i);
    expect(() => assertAgentEventEnvelope(event("turn.started", {
      referenceDisplays: [{ ...referenceDisplay, kind: "workspace-file", relativePath: "/private/source.txt" }],
    }))).toThrow(/workspace-relative/i);
    expect(() => assertAgentIpcResponse("agent:providers-discover", {
      readiness: { runtimeId: "opencode", status: "ready", code: "READY" },
      providers: [{ id: "openai", displayName: "OpenAI", modelCount: -1 }],
      models: [],
      capabilities: {},
      warnings: [],
    })).toThrow(/modelCount/i);
    expect(() => assertAgentIpcResponse("agent:providers-discover", {
      readiness: { runtimeId: "cursor", status: "installed-not-authenticated", code: "AUTHENTICATION_PROBE_FAILED" },
      providers: [],
      models: [],
      capabilities: {},
      warnings: [],
    })).toThrow(/incompatible with status/i);
  });

  it("bounds native history discovery and strips transcript-shaped list fields", () => {
    expect(parseAgentIpcRequest("agent:sessions-list", {
      rootPath: "/workspace",
      runtimeId: "codex",
      discoverNative: true,
      cursor: "page-2",
      limit: 20,
      scanPrivateDatabase: true,
    })).toEqual({
      rootPath: "/workspace",
      runtimeId: "codex",
      discoverNative: true,
      cursor: "page-2",
      limit: 20,
    });
    const response = assertAgentIpcResponse("agent:sessions-list", {
      sessions: [{
        id: "session-1",
        runtimeId: "codex",
        provider: "codex",
        providerSessionId: "thread-1",
        workspaceRoot: "/workspace",
        title: "Saved thread",
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        terminalState: "idle",
        selectedModel: null,
        lastSequence: 0,
        origin: "native-discovery",
        transcript: [{ role: "user", text: "must not cross" }],
        events: [{ payload: { secret: true } }],
      }],
      discovery: {
        runtimeId: "codex",
        status: "partial",
        nextCursor: "page-3",
        indexed: 1,
        warnings: [],
      },
      warnings: [],
    });
    expect(response.sessions[0]).not.toHaveProperty("transcript");
    expect(response.sessions[0]).not.toHaveProperty("events");
    expect(() => assertAgentIpcResponse("agent:sessions-list", {
      sessions: [],
      discovery: { runtimeId: "codex", status: "scanning-everything", nextCursor: null, indexed: 0, warnings: [] },
      warnings: [],
    })).toThrow(/discovery.status/i);
  });

  it("requires methods for capabilities a runtime advertises", () => {
    expect(() => assertAgentRuntimeCapabilities({}, { manualApprovals: true }, "fixture")).toThrow(/resolveApproval/i);
    expect(assertAgentRuntimeCapabilities({ resolveApproval: vi.fn() }, { manualApprovals: true }, "fixture").manualApprovals).toBe(true);
  });

  it("fails unknown reference transports closed instead of projecting legacy attachment support", () => {
    expect(normalizeReferenceInputCapabilities({ images: "future-transport" }, { attachments: true }))
      .toMatchObject({ images: "none", genericFiles: "none" });
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
