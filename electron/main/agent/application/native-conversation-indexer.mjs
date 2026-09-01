import { randomUUID } from "node:crypto";
import { redactSecretText } from "../agent-events.mjs";
import { resolveAgentSessionHistoryPort } from "../runtime/agent-session-history-port.mjs";

export const DEFAULT_NATIVE_CONVERSATION_DISCOVERY_TIMEOUT_MS = 15_000;
const NATIVE_CONVERSATION_CLEANUP_TIMEOUT_MS = 2_000;
const NATIVE_SCAN_TTL_MS = 5 * 60_000;

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
  discoveryTimeoutMs = DEFAULT_NATIVE_CONVERSATION_DISCOVERY_TIMEOUT_MS,
}) {
  if (!runtimeResolutionCoordinator || typeof runtimeResolutionCoordinator.resolveForOperation !== "function") {
    throw new TypeError("NativeConversationIndexer requires the runtime resolution authority.");
  }
  const scans = new Map();
  return {
    async refresh({ workspaceRoot, runtimeId, cursor = null, scanId = null, limit = 50 }) {
      let adapter = null;
      discardExpiredScans(scans);
      let scan;
      try {
        scan = resolveScan(scans, { workspaceRoot, runtimeId, cursor, scanId });
        const selected = await runtimeResolutionCoordinator.resolveForOperation({
          runtimeId,
          workspaceRoot,
          operation: "history",
        });
        if (selected.descriptor.ownership?.session !== "runtime") {
          return { runtimeId, status: "unsupported", nextCursor: null, scanId: null, indexed: 0, warnings: [] };
        }
        adapter = runtimeRegistry.createAdapter(runtimeId, {
          readiness: selected.readiness,
          workspaceRoot,
          onEvent: () => {},
          onExit: () => {},
        });
        const history = resolveAgentSessionHistoryPort(adapter);
        if (typeof history?.discover !== "function") {
          return { runtimeId, status: "unsupported", nextCursor: null, scanId: null, indexed: 0, warnings: [] };
        }
        const result = await processSupervisor.runStart(
          { label: `${runtimeId}:history-discovery` },
          () => withDeadline(
            () => history.discover({ cursor, limit }),
            discoveryTimeoutMs,
            `${runtimeId} history discovery`,
          ),
        );
        if (!result?.supported) {
          return { runtimeId, status: "unsupported", nextCursor: null, scanId: null, indexed: 0, warnings: [] };
        }
        let indexed = 0;
        const locators = normalizeLocators(result.sessions, limit);
        const nextCursor = normalizeNextCursor(result.nextCursor);
        for (const locator of locators) {
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
          scan.providerSessionIds.add(locator.providerSessionId);
          indexed += 1;
        }
        if (nextCursor) {
          scan.nextCursor = nextCursor;
          scan.expiresAt = Date.now() + NATIVE_SCAN_TTL_MS;
          scans.set(scan.id, scan);
        } else {
          scans.delete(scan.id);
          await sessionRepository.reconcileNative?.({
            workspaceRoot,
            runtimeId,
            providerSessionIds: [...scan.providerSessionIds],
          });
        }
        return {
          runtimeId,
          status: nextCursor ? "partial" : "complete",
          nextCursor,
          scanId: nextCursor ? scan.id : null,
          indexed,
          warnings: [],
        };
      } catch (error) {
        runtimeResolutionCoordinator.recordOperationFailure({ runtimeId, workspaceRoot });
        return failed(runtimeId, error instanceof Error ? error.message : String(error));
      } finally {
        await withDeadline(
          () => adapter?.dispose?.(),
          NATIVE_CONVERSATION_CLEANUP_TIMEOUT_MS,
          `${runtimeId} history cleanup`,
        ).catch(() => {});
      }
    },
  };
}

function resolveScan(scans, { workspaceRoot, runtimeId, cursor, scanId }) {
  if (!cursor) {
    return {
      id: randomUUID(),
      workspaceRoot,
      runtimeId,
      providerSessionIds: new Set(),
      nextCursor: null,
      expiresAt: Date.now() + NATIVE_SCAN_TTL_MS,
    };
  }
  const scan = typeof scanId === "string" ? scans.get(scanId) : null;
  if (
    !scan
    || scan.workspaceRoot !== workspaceRoot
    || scan.runtimeId !== runtimeId
    || scan.nextCursor !== cursor
  ) {
    throw new Error("Native conversation discovery continuation is no longer valid. Refresh history to restart the scan.");
  }
  return scan;
}

function discardExpiredScans(scans) {
  const now = Date.now();
  for (const [scanId, scan] of scans) {
    if (scan.expiresAt <= now) scans.delete(scanId);
  }
}

function withDeadline(operation, timeoutMs, label) {
  const boundedTimeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_NATIVE_CONVERSATION_DISCOVERY_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out.`)), boundedTimeout);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
  });
}

function normalizeLocators(value, limit) {
  if (!Array.isArray(value)) throw new Error("Native conversation discovery returned an invalid session page.");
  const maximumPageSize = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  if (value.length > maximumPageSize) {
    throw new Error("Native conversation discovery returned more sessions than the negotiated page bound.");
  }
  return value.map((entry) => {
    const providerSessionId = safeId(entry?.providerSessionId);
    const updatedAt = isoDate(entry?.updatedAt);
    if (!providerSessionId || !updatedAt) {
      throw new Error("Native conversation discovery returned an invalid session locator.");
    }
    return {
      providerSessionId,
      title: bounded(entry?.title, 500) || "Agent session",
      createdAt: isoDate(entry?.createdAt) ?? updatedAt,
      updatedAt,
      selectedProviderId: safeId(entry?.selectedProviderId),
      selectedModel: bounded(entry?.selectedModel, 512),
      selectedEffort: bounded(entry?.selectedEffort, 160),
      selectedMode: bounded(entry?.selectedMode, 160),
    };
  });
}

function failed(runtimeId, message) {
  return {
    runtimeId,
    status: "failed",
    nextCursor: null,
    scanId: null,
    indexed: 0,
    warnings: [redactSecretText(message).slice(0, 4_000)],
  };
}

function normalizeNextCursor(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && value.length <= 1_024) return value;
  throw new Error("Native conversation discovery returned an invalid continuation cursor.");
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
