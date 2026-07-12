import fs from "node:fs";
import path from "node:path";
import { deriveLocalConnection } from "./local-agent-connection-policy.mjs";
import { resolveFirstExecutable } from "./probes/executable-candidates.mjs";
import { createLocalAgentToolRegistry } from "./tools/local-agent-tool-registry.mjs";
import { sanitizeAgentLocalConnectionsSnapshot } from "../../../../shared/agent-contract/local-connection-schema.mjs";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const PERSISTED_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_PERSISTED_CACHE_BYTES = 64 * 1024;
const PERSISTED_CACHE_VERSION = 1;

export function createLocalAgentInventory({
  appVersion = "0.0.0",
  env = process.env,
  homedir,
  platform = process.platform,
  now = Date.now,
  cacheTtlMs = CACHE_TTL_MS,
  persistedCacheTtlMs = PERSISTED_CACHE_TTL_MS,
  cacheFilePath = null,
  fsModule = fs,
  logger = console,
  toolDescriptors = createLocalAgentToolRegistry(),
  resolveCandidate = (tool) => resolveFirstExecutable({
    names: tool.executableNames,
    env,
    ...(homedir ? { homedir } : {}),
    platform,
  }),
  probes = {},
} = {}) {
  const tools = createLocalAgentToolRegistry(toolDescriptors);
  let cached = null;
  let inFlight = null;
  let activeController = null;
  let persistedCacheLoaded = false;
  let scanGeneration = 0;
  let disposed = false;

  function discover({ refresh = false, workspaceRoot = null } = {}) {
    if (disposed) return Promise.reject(new Error("Local Agent inventory is closed."));
    if (inFlight && !refresh) return inFlight;
    if (inFlight && refresh) activeController?.abort();
    const startedAt = now();
    if (!refresh && cached && startedAt - cached.cachedAt < cacheTtlMs) return Promise.resolve(cached.snapshot);
    if (refresh) persistedCacheLoaded = true;
    const controller = new AbortController();
    const generation = ++scanGeneration;
    activeController = controller;
    const task = (async () => {
      if (!refresh && !persistedCacheLoaded) {
        persistedCacheLoaded = true;
        const persisted = await readPersistedCache(startedAt);
        if (persisted) return { snapshot: persisted, fromDisk: true };
      }
      return { snapshot: await scan({ workspaceRoot, startedAt, signal: controller.signal }), fromDisk: false };
    })()
      .then(async ({ snapshot, fromDisk }) => {
        if (disposed || generation !== scanGeneration || controller.signal.aborted) {
          throw abortError("Local Agent inventory scan was superseded.");
        }
        if (!fromDisk) await writePersistedCache(snapshot, startedAt);
        return snapshot;
      })
      .then((snapshot) => {
        if (disposed || generation !== scanGeneration || controller.signal.aborted) {
          throw abortError("Local Agent inventory scan was superseded.");
        }
        cached = { cachedAt: startedAt, snapshot };
        return snapshot;
      })
      .finally(() => {
        if (inFlight === task) inFlight = null;
        if (activeController === controller) activeController = null;
      });
    inFlight = task;
    return task;
  }

  async function readPersistedCache(startedAt) {
    if (!cacheFilePath) return null;
    try {
      const metadata = await fsModule.promises.stat(cacheFilePath);
      if (metadata.size > MAX_PERSISTED_CACHE_BYTES) return null;
      const parsed = JSON.parse(await fsModule.promises.readFile(cacheFilePath, "utf8"));
      if (parsed?.version !== PERSISTED_CACHE_VERSION) return null;
      const cachedAt = Number(parsed.cachedAt);
      const age = startedAt - cachedAt;
      if (!Number.isFinite(cachedAt) || age < 0 || age >= persistedCacheTtlMs) return null;
      return sanitizeAgentLocalConnectionsSnapshot(parsed.snapshot);
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.("Unable to read the local Agent inventory cache:", error);
      return null;
    }
  }

  async function writePersistedCache(snapshot, cachedAt) {
    if (!cacheFilePath) return;
    const safeSnapshot = sanitizeAgentLocalConnectionsSnapshot(snapshot);
    const payload = JSON.stringify({ version: PERSISTED_CACHE_VERSION, cachedAt, snapshot: safeSnapshot });
    if (Buffer.byteLength(payload) > MAX_PERSISTED_CACHE_BYTES) return;
    const temporaryPath = `${cacheFilePath}.${process.pid}.tmp`;
    try {
      await fsModule.promises.mkdir(path.dirname(cacheFilePath), { recursive: true });
      await fsModule.promises.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
      await fsModule.promises.chmod?.(temporaryPath, 0o600);
      await fsModule.promises.rename(temporaryPath, cacheFilePath);
    } catch (error) {
      logger.warn?.("Unable to write the local Agent inventory cache:", error);
      await fsModule.promises.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  async function scan({ workspaceRoot, startedAt, signal }) {
    const outcomes = await Promise.all(tools.map(async (tool) => {
      try {
        const candidate = await resolveCandidate(tool);
        const probe = probes[tool.id] ?? tool.probe;
        if (typeof probe !== "function") throw new Error("Missing local tool probe.");
        const result = await probe({
          candidate,
          appVersion,
          workspaceRoot: workspaceRoot || undefined,
          env,
          signal,
        });
        return {
          tool,
          result: { ...result, unavailableMessage: tool.unavailableMessage },
          failed: false,
        };
      } catch (error) {
        if (signal.aborted || error?.name === "AbortError") throw error;
        return {
          tool,
          failed: true,
          result: {
            id: tool.id,
            displayName: tool.displayName,
            installation: "broken",
            version: null,
            authentication: "error",
            protocolCompatible: false,
            hasModels: false,
          },
        };
      }
    }));
    return {
      connections: outcomes.map(({ result }) => deriveLocalConnection(result)),
      scannedAt: new Date(startedAt).toISOString(),
      warnings: outcomes
        .filter(({ failed }) => failed)
        .map(({ tool }) => `${tool.displayName} could not be inspected. Refresh to try again.`),
    };
  }

  function dispose() {
    disposed = true;
    scanGeneration += 1;
    activeController?.abort();
    activeController = null;
    cached = null;
  }

  return { discover, dispose };
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export const localAgentInventoryPolicy = Object.freeze({
  cacheTtlMs: CACHE_TTL_MS,
  persistedCacheTtlMs: PERSISTED_CACHE_TTL_MS,
  maxPersistedCacheBytes: MAX_PERSISTED_CACHE_BYTES,
  tools: createLocalAgentToolRegistry(),
});
