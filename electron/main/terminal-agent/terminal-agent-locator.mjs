import os from "node:os";
import { performance } from "node:perf_hooks";
import { createTerminalAgentCandidateResolver } from "./terminal-agent-candidate-resolver.mjs";
import { createTerminalAgentCatalog } from "./terminal-agent-catalog.mjs";

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const TARGET_COLD_SCAN_MS = 50;

/**
 * Filesystem-only availability for the Terminal selector. It intentionally
 * never runs an Agent, reads account state, lists models, or opens a protocol.
 */
export function createTerminalAgentLocator(options = {}) {
  const {
    catalog = createTerminalAgentCatalog(),
    env = process.env,
    homedir = os.homedir(),
    platform = process.platform,
    now = Date.now,
    monotonicNow = () => performance.now(),
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  } = options;
  const candidateResolver = options.candidateResolver ?? createTerminalAgentCandidateResolver({
    env,
    homedir,
    platform,
  });
  const createResolutionContext = options.createResolutionContext
    ?? (options.resolveCandidate ? async () => Object.freeze({}) : () => candidateResolver.createContext());
  const resolveCandidate = options.resolveCandidate
    ?? ((definition, context) => candidateResolver.resolve(definition, context));
  const definitions = createTerminalAgentCatalog(catalog);
  let cached = null;
  let inFlight = null;
  let generation = 0;
  let disposed = false;
  const diagnostics = {
    cacheHitCount: 0,
    catalogSize: definitions.length,
    lastAvailableCount: 0,
    lastScanCompletedAt: null,
    lastScanDurationMs: null,
    scanCount: 0,
  };

  function locate({ refresh = false, onProgress = null } = {}) {
    if (disposed) return Promise.reject(new Error("Terminal Agent locator is closed."));
    const requestedAt = now();
    if (!refresh && cached && requestedAt - cached.cachedAt < cacheTtlMs) {
      diagnostics.cacheHitCount += 1;
      return Promise.resolve({ ...cached.snapshot, source: "memory-cache" });
    }
    if (!refresh && inFlight) {
      addObserver(inFlight.observers, onProgress);
      return inFlight.promise;
    }

    const requestGeneration = ++generation;
    const observers = new Set();
    addObserver(observers, onProgress);
    const scanStartedAt = monotonicNow();
    const task = Promise.resolve(createResolutionContext())
      .then(async (resolutionContext) => {
        const available = new Set();
        let completedAgentCount = 0;
        await Promise.all(definitions.map(async (definition) => {
          const candidate = await resolveCandidate(definition, resolutionContext).catch(() => null);
          if (candidate) available.add(definition.id);
          completedAgentCount += 1;
          publishProgress(observers, {
            availableAgentIds: stableAvailableIds(definitions, available),
            completedAgentCount,
            totalAgentCount: definitions.length,
          });
        }));
        return stableAvailableIds(definitions, available);
      })
      .then((availableAgentIds) => ({
        availableAgentIds,
        scannedAt: new Date(requestedAt).toISOString(),
        source: "scan",
      }))
      .then((snapshot) => {
        const completedAt = now();
        diagnostics.scanCount += 1;
        diagnostics.lastScanDurationMs = roundDuration(monotonicNow() - scanStartedAt);
        diagnostics.lastScanCompletedAt = new Date(completedAt).toISOString();
        diagnostics.lastAvailableCount = snapshot.availableAgentIds.length;
        if (!disposed && requestGeneration === generation) {
          cached = { cachedAt: completedAt, snapshot };
        }
        return snapshot;
      })
      .finally(() => {
        if (inFlight?.promise === task) inFlight = null;
      });
    inFlight = { observers, promise: task };
    return task;
  }

  function getDiagnostics() {
    return Object.freeze({ ...diagnostics });
  }

  function dispose() {
    disposed = true;
    generation += 1;
    cached = null;
    inFlight = null;
  }

  return Object.freeze({ locate, dispose, getDiagnostics });
}

function addObserver(observers, observer) {
  if (typeof observer === "function") observers.add(observer);
}

function publishProgress(observers, progress) {
  const snapshot = Object.freeze({
    ...progress,
    availableAgentIds: Object.freeze([...progress.availableAgentIds]),
  });
  for (const observer of observers) {
    try {
      observer(snapshot);
    } catch {
      // A renderer disappearing must not interrupt the filesystem scan.
    }
  }
}

function stableAvailableIds(definitions, available) {
  return definitions.map(({ id }) => id).filter((id) => available.has(id));
}

function roundDuration(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : null;
}

export const terminalAgentLocatorPolicy = Object.freeze({
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  targetColdScanMs: TARGET_COLD_SCAN_MS,
});
