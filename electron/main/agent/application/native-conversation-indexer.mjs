import { redactSecretText } from "../agent-events.mjs";

/**
 * Explicit, capability-gated native conversation discovery.
 *
 * This indexes provider-owned locators only. It never scans private product
 * databases and it never copies a native transcript into PuppyOne storage.
 */
export function createNativeConversationIndexer({
  runtimeRegistry,
  runtimeResolutionCoordinator,
  sessionRepository,
  processSupervisor,
}) {
  if (!runtimeResolutionCoordinator || typeof runtimeResolutionCoordinator.resolveForOperation !== "function") {
    throw new TypeError("NativeConversationIndexer requires the runtime resolution authority.");
  }
  return {
    async refresh({ workspaceRoot, runtimeId, cursor = null, limit = 50 }) {
      let adapter = null;
      try {
        const selected = await runtimeResolutionCoordinator.resolveForOperation({
          runtimeId,
          workspaceRoot,
          operation: "history",
        });
        if (selected.descriptor.ownership?.session !== "runtime") {
          return { runtimeId, status: "unsupported", nextCursor: null, indexed: 0, warnings: [] };
        }
        adapter = runtimeRegistry.createAdapter(runtimeId, {
          readiness: selected.readiness,
          workspaceRoot,
          onEvent: () => {},
          onExit: () => {},
        });
        if (typeof adapter.discoverSessions !== "function") {
          return { runtimeId, status: "unsupported", nextCursor: null, indexed: 0, warnings: [] };
        }
        const result = await processSupervisor.runStart(
          { label: `${runtimeId}:history-discovery` },
          () => adapter.discoverSessions({ cursor, limit }),
        );
        if (!result?.supported) {
          return { runtimeId, status: "unsupported", nextCursor: null, indexed: 0, warnings: [] };
        }
        let indexed = 0;
        for (const locator of normalizeLocators(result.sessions, limit)) {
          await sessionRepository.upsertNative({
            workspaceRoot,
            runtimeId,
            runtime: selected.descriptor,
            providerSessionId: locator.providerSessionId,
            title: locator.title,
            createdAt: locator.createdAt,
            updatedAt: locator.updatedAt,
            selectedProviderId: locator.selectedProviderId,
            selectedModel: locator.selectedModel,
            selectedEffort: locator.selectedEffort,
            selectedMode: locator.selectedMode,
            terminalState: "idle",
            lastSequence: 0,
          });
          indexed += 1;
        }
        const nextCursor = safeCursor(result.nextCursor);
        return {
          runtimeId,
          status: nextCursor ? "partial" : "complete",
          nextCursor,
          indexed,
          warnings: [],
        };
      } catch (error) {
        runtimeResolutionCoordinator.recordOperationFailure({ runtimeId, workspaceRoot });
        return failed(runtimeId, error instanceof Error ? error.message : String(error));
      } finally {
        await Promise.resolve(adapter?.dispose?.()).catch(() => {});
      }
    },
  };
}

function normalizeLocators(value, limit) {
  const pageSize = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  return (Array.isArray(value) ? value : []).slice(0, pageSize).flatMap((entry) => {
    const providerSessionId = safeId(entry?.providerSessionId);
    const updatedAt = isoDate(entry?.updatedAt);
    if (!providerSessionId || !updatedAt) return [];
    return [{
      providerSessionId,
      title: bounded(entry?.title, 500) || "Agent session",
      createdAt: isoDate(entry?.createdAt) ?? updatedAt,
      updatedAt,
      selectedProviderId: safeId(entry?.selectedProviderId),
      selectedModel: bounded(entry?.selectedModel, 512),
      selectedEffort: bounded(entry?.selectedEffort, 160),
      selectedMode: bounded(entry?.selectedMode, 160),
    }];
  });
}

function failed(runtimeId, message) {
  return {
    runtimeId,
    status: "failed",
    nextCursor: null,
    indexed: 0,
    warnings: [redactSecretText(message).slice(0, 4_000)],
  };
}

function safeCursor(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1_024 ? value : null;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._/-]{1,512}$/.test(value) ? value : null;
}

function bounded(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) || null : null;
}

function isoDate(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}
