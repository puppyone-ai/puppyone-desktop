import { describe, expect, it, vi } from "vitest";
import { createAgentService } from "../electron/main/agent/application/agent-service.mjs";
import { AgentRuntimeRegistry } from "../electron/main/agent/runtime/agent-runtime-registry.mjs";

describe("Authoritative runtime resolution", () => {
  it.each([
    ["AUTHENTICATION_PROBE_FAILED"],
    ["AUTHENTICATION_PROBE_CRASHED"],
    ["AUTHENTICATION_PROBE_TIMED_OUT"],
    ["AUTHENTICATION_STATUS_UNKNOWN"],
  ])("creates a session after Catalog recovers %s through ACP", async (code) => {
    const harness = createHarness(cursorProbeFailure(code));

    const catalog = await harness.service.discoverProviders(
      sender(),
      { runtimeId: "cursor" },
      "/workspace",
    );
    expect(catalog.readiness).toMatchObject({ status: "ready", code: "READY" });

    const snapshot = await harness.service.createSession(
      sender(),
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace",
    );

    expect(snapshot.session).toMatchObject({ runtimeId: "cursor", providerSessionId: "cursor-session" });
    expect(harness.adapters).toHaveLength(2);
    expect(harness.adapters[0].inspect).toHaveBeenCalledTimes(1);
    expect(harness.adapters[1].bootstrapSession).toHaveBeenCalledTimes(1);
    expect(harness.adapters[1].inspect).not.toHaveBeenCalled();
  });

  it("keeps an explicit signed-out result closed and preserves its structured reason", async () => {
    const harness = createHarness({
      ...cursorProbeFailure(),
      status: "installed-not-authenticated",
      code: "AUTHENTICATION_REQUIRED",
      inspectionFallback: undefined,
      message: "Sign in to Cursor Agent.",
    });

    await expect(harness.service.createSession(
      sender(),
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace",
    )).rejects.toMatchObject({
      name: "AgentRuntimeResolutionError",
      code: "AUTHENTICATION_REQUIRED",
      operation: "create",
      retryable: false,
    });
    expect(harness.adapters).toHaveLength(0);
  });

  it("resolves transient fallback independently for multiple workspaces", async () => {
    const harness = createHarness(cursorProbeFailure());

    const first = await harness.service.createSession(
      sender(),
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace-a",
    );
    const second = await harness.service.createSession(
      sender(),
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace-b",
    );

    expect(first.session.id).not.toBe(second.session.id);
    expect(harness.adapters).toHaveLength(2);
    expect(harness.adapters.every((adapter) => adapter.bootstrapSession.mock.calls.length === 1)).toBe(true);
  });

  it("resumes a persisted session through the same runtime authority", async () => {
    const harness = createHarness(cursorProbeFailure());
    const owner = sender();
    const created = await harness.service.createSession(
      owner,
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace",
    );
    await harness.service.closeSession(owner, { sessionId: created.session.id }, "/workspace");

    const resumed = await harness.service.resumeSession(
      owner,
      { runtimeId: "cursor", sessionId: created.session.id },
      "/workspace",
    );

    expect(resumed.session.id).toBe(created.session.id);
    expect(harness.adapters).toHaveLength(2);
    expect(harness.adapters[1].bootstrapSession).toHaveBeenCalledWith(expect.objectContaining({
      kind: "resume",
      threadId: "cursor-session",
    }));
  });

  it("forks a live session without bypassing runtime resolution", async () => {
    const harness = createHarness(cursorProbeFailure());
    const owner = sender();
    const created = await harness.service.createSession(
      owner,
      { runtimeId: "cursor", model: "cursor/auto" },
      "/workspace",
    );

    const forked = await harness.service.forkSession(
      owner,
      { sessionId: created.session.id },
      "/workspace",
    );

    expect(forked.session.id).not.toBe(created.session.id);
    expect(harness.adapters).toHaveLength(2);
    expect(harness.adapters[0].forkSession).toHaveBeenCalledTimes(1);
    expect(harness.adapters[1].bootstrapSession).toHaveBeenCalledWith(expect.objectContaining({
      kind: "resume",
      threadId: "cursor-fork",
    }));
  });

  it("discovers native history through the shared authority without inventing readiness evidence", async () => {
    const harness = createHarness(cursorProbeFailure());

    const result = await harness.service.listSessions(
      sender(),
      { runtimeId: "cursor", discoverNative: true },
      "/workspace",
    );

    expect(result.discovery).toMatchObject({ status: "complete", indexed: 1 });
    expect(harness.adapters).toHaveLength(1);
    expect(harness.adapters[0].discoverSessions).toHaveBeenCalledTimes(1);
    expect(harness.persistence.upsertNative).toHaveBeenCalledWith(expect.objectContaining({
      runtimeId: "cursor",
      providerSessionId: "cursor-history",
    }));
  });
});

function createHarness(readiness) {
  const adapters = [];
  const registry = new AgentRuntimeRegistry([{
    manifest: {
      id: "cursor",
      displayName: "Cursor Agent",
      priority: 1,
      execution: { kind: "local-process", distribution: "user-installed", controller: "bundled-adapter" },
      protocol: { kind: "acp", transport: "stdio-json-rpc" },
      integration: { kind: "native-protocol", adapter: "generic-acp" },
      trust: { level: "first-party", publisher: "Cursor" },
      ownership: {
        harness: "runtime",
        credentials: ["runtime"],
        models: "runtime",
        billing: ["runtime"],
        session: "runtime",
      },
    },
    discovery: { discover: vi.fn(async () => readiness) },
    createAdapter: () => {
      const adapter = fakeAcpAdapter();
      adapters.push(adapter);
      return adapter;
    },
  }]);
  const persisted = new Map();
  const persistence = {
    save: vi.fn(async (entry) => persisted.set(entry.sessionId, entry)),
    findLatest: vi.fn(async (workspaceRoot, runtimeId) => Array.from(persisted.values()).find((entry) => (
      entry.workspaceRoot === workspaceRoot && (!runtimeId || entry.runtimeId === runtimeId)
    )) ?? null),
    findById: vi.fn(async (sessionId, workspaceRoot) => {
      const entry = persisted.get(sessionId) ?? null;
      return entry?.workspaceRoot === workspaceRoot ? entry : null;
    }),
    list: vi.fn(async () => []),
    upsertNative: vi.fn(async () => null),
    archive: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  return {
    adapters,
    persistence,
    service: createAgentService({
      runtimeRegistry: registry,
      persistence,
      logger: { warn: vi.fn() },
    }),
  };
}

function fakeAcpAdapter() {
  return {
    inspect: vi.fn(async () => inspection()),
    bootstrapSession: vi.fn(async ({ kind, threadId }) => ({
      inspection: inspection(),
      providerSession: {
        providerSessionId: kind === "resume" ? threadId : "cursor-session",
        title: "Cursor session",
        model: "cursor/auto",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    })),
    createSession: vi.fn(),
    resumeSession: vi.fn(),
    readHistory: vi.fn(async () => []),
    discoverSessions: vi.fn(async () => ({
      supported: true,
      sessions: [{
        providerSessionId: "cursor-history",
        title: "History",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }],
      nextCursor: null,
    })),
    forkSession: vi.fn(async () => ({ providerSessionId: "cursor-fork" })),
    startTurn: vi.fn(),
    interruptTurn: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
}

function inspection() {
  return {
    account: {
      account: { type: "cursor", email: null, planType: null },
      requiresOpenaiAuth: false,
    },
    providers: [],
    models: [{
      id: "cursor/auto",
      model: "cursor/auto",
      displayName: "Auto",
      isDefault: true,
    }],
    modes: [],
    commands: [],
    capabilities: { fork: true },
    warnings: [],
  };
}

function cursorProbeFailure(code = "AUTHENTICATION_PROBE_TIMED_OUT") {
  return {
    runtimeId: "cursor",
    provider: "cursor",
    status: "error",
    code,
    version: "2026.08.25",
    minimumVersion: null,
    executablePath: "/tools/cursor-agent",
    argsPrefix: [],
    environment: {},
    source: "user-installed",
    compatibility: "acp-v1",
    inspectionFallback: "runtime-handshake",
    message: "Cursor status timed out.",
  };
}

function sender() {
  return { id: 11, isDestroyed: () => false, send: vi.fn() };
}
