import { describe, expect, it, vi } from "vitest";
import {
  createNativeConversationIndexer,
} from "../electron/main/agent/application/native-conversation-indexer.mjs";
import {
  createAgentProcessSupervisor,
} from "../electron/main/agent/application/processes/agent-process-supervisor.mjs";

describe("native Agent conversation indexing", () => {
  it("times out one stalled Harness discovery, releases its process slot, and disposes the adapter", async () => {
    const dispose = vi.fn(async () => {});
    const recordOperationFailure = vi.fn();
    const processSupervisor = createAgentProcessSupervisor({ maxConcurrentStarts: 1 });
    const indexer = createNativeConversationIndexer({
      runtimeRegistry: {
        createAdapter: vi.fn(() => ({
          getSessionHistoryPort: () => ({ discover: vi.fn(() => new Promise(() => {})) }),
          dispose,
        })),
      },
      runtimeResolutionCoordinator: {
        resolveForOperation: vi.fn(async () => ({
          descriptor: {
            id: "cursor",
            displayName: "Cursor",
            ownership: { session: "runtime" },
          },
          readiness: { status: "ready" },
        })),
        recordOperationFailure,
      },
      sessionRepository: { upsertNative: vi.fn() },
      processSupervisor,
      discoveryTimeoutMs: 10,
    });

    await expect(indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
    })).resolves.toMatchObject({
      runtimeId: "cursor",
      status: "failed",
      indexed: 0,
      warnings: [expect.stringMatching(/timed out/i)],
    });
    expect(recordOperationFailure).toHaveBeenCalledWith({
      runtimeId: "cursor",
      workspaceRoot: "/workspace/a",
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(processSupervisor.snapshot()).toMatchObject({ inUse: 0, queued: 0 });
  });

  it("reconciles only after every native page completes", async () => {
    const discoverSessions = vi.fn()
      .mockResolvedValueOnce({
        supported: true,
        sessions: [locator("session-a")],
        nextCursor: "provider-page-2",
      })
      .mockResolvedValueOnce({
        supported: true,
        sessions: [locator("session-b")],
        nextCursor: null,
      });
    const repository = {
      upsertNative: vi.fn(async () => undefined),
      reconcileNative: vi.fn(async () => ({ unavailableSessionIds: [] })),
    };
    const indexer = createIndexer({ discoverSessions, repository });

    const first = await indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
      limit: 1,
    });
    expect(first).toMatchObject({ status: "partial", nextCursor: "provider-page-2" });
    expect(first.scanId).toEqual(expect.any(String));
    expect(repository.reconcileNative).not.toHaveBeenCalled();

    await expect(indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
      cursor: first.nextCursor,
      scanId: first.scanId,
      limit: 1,
    })).resolves.toMatchObject({ status: "complete", nextCursor: null, scanId: null });
    expect(repository.reconcileNative).toHaveBeenCalledWith({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
      providerSessionIds: ["session-a", "session-b"],
    });
  });

  it("never reconciles a failed or detached pagination continuation", async () => {
    const discoverSessions = vi.fn()
      .mockResolvedValueOnce({ supported: true, sessions: [locator("session-a")], nextCursor: "page-2" })
      .mockRejectedValueOnce(new Error("provider page failed"));
    const repository = {
      upsertNative: vi.fn(async () => undefined),
      reconcileNative: vi.fn(async () => ({ unavailableSessionIds: [] })),
    };
    const indexer = createIndexer({ discoverSessions, repository });
    const first = await indexer.refresh({ workspaceRoot: "/workspace/a", runtimeId: "cursor" });

    await expect(indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
      cursor: first.nextCursor,
      scanId: first.scanId,
    })).resolves.toMatchObject({ status: "failed" });
    await expect(indexer.refresh({
      workspaceRoot: "/workspace/b",
      runtimeId: "cursor",
      cursor: first.nextCursor,
      scanId: first.scanId,
    })).resolves.toMatchObject({
      status: "failed",
      warnings: [expect.stringMatching(/continuation is no longer valid/i)],
    });
    expect(repository.reconcileNative).not.toHaveBeenCalled();
  });

  it("rejects an out-of-order provider cursor within the same scan epoch", async () => {
    const discoverSessions = vi.fn()
      .mockResolvedValueOnce({ supported: true, sessions: [locator("session-a")], nextCursor: "page-2" });
    const repository = {
      upsertNative: vi.fn(async () => undefined),
      reconcileNative: vi.fn(async () => ({ unavailableSessionIds: [] })),
    };
    const indexer = createIndexer({ discoverSessions, repository });
    const first = await indexer.refresh({ workspaceRoot: "/workspace/a", runtimeId: "cursor" });

    await expect(indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
      cursor: "page-3",
      scanId: first.scanId,
    })).resolves.toMatchObject({
      status: "failed",
      warnings: [expect.stringMatching(/continuation is no longer valid/i)],
    });
    expect(discoverSessions).toHaveBeenCalledOnce();
    expect(repository.reconcileNative).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed locator", { supported: true, sessions: [{ title: "missing identity" }], nextCursor: null }],
    ["malformed cursor", { supported: true, sessions: [locator("session-a")], nextCursor: { page: 2 } }],
  ])("preserves the catalog when a provider returns a %s", async (_label, providerPage) => {
    const discoverSessions = vi.fn().mockResolvedValueOnce(providerPage);
    const repository = {
      upsertNative: vi.fn(async () => undefined),
      reconcileNative: vi.fn(async () => ({ unavailableSessionIds: [] })),
    };
    const indexer = createIndexer({ discoverSessions, repository });

    await expect(indexer.refresh({
      workspaceRoot: "/workspace/a",
      runtimeId: "cursor",
    })).resolves.toMatchObject({
      status: "failed",
      warnings: [expect.stringMatching(/invalid/i)],
    });
    expect(repository.upsertNative).not.toHaveBeenCalled();
    expect(repository.reconcileNative).not.toHaveBeenCalled();
  });
});

function createIndexer({ discoverSessions, repository }) {
  return createNativeConversationIndexer({
    runtimeRegistry: {
      createAdapter: vi.fn(() => ({
        getSessionHistoryPort: () => ({ discover: discoverSessions }),
        dispose: vi.fn(async () => undefined),
      })),
    },
    runtimeResolutionCoordinator: {
      resolveForOperation: vi.fn(async () => ({
        descriptor: { id: "cursor", displayName: "Cursor", ownership: { session: "runtime" } },
        readiness: { status: "ready" },
      })),
      recordOperationFailure: vi.fn(),
    },
    sessionRepository: repository,
    processSupervisor: createAgentProcessSupervisor({ maxConcurrentStarts: 1 }),
  });
}

function locator(providerSessionId) {
  return {
    providerSessionId,
    title: providerSessionId,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}
