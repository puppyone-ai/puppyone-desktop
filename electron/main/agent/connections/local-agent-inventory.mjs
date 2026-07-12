import { deriveLocalConnection } from "./local-agent-connection-policy.mjs";
import { resolveFirstExecutable } from "./probes/executable-candidates.mjs";
import { createLocalAgentToolRegistry } from "./tools/local-agent-tool-registry.mjs";

const CACHE_TTL_MS = 5 * 60 * 1_000;

export function createLocalAgentInventory({
  appVersion = "0.0.0",
  env = process.env,
  homedir,
  platform = process.platform,
  now = Date.now,
  cacheTtlMs = CACHE_TTL_MS,
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
  let disposed = false;

  function discover({ refresh = false, workspaceRoot = null } = {}) {
    if (disposed) return Promise.reject(new Error("Local Agent inventory is closed."));
    if (inFlight) return inFlight;
    const startedAt = now();
    if (!refresh && cached && startedAt - cached.cachedAt < cacheTtlMs) return Promise.resolve(cached.snapshot);
    const controller = new AbortController();
    activeController = controller;
    const task = scan({ workspaceRoot, startedAt, signal: controller.signal })
      .then((snapshot) => {
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
          result: { ...result, bridgeRequiredMessage: tool.bridgeRequiredMessage },
          failed: false,
        };
      } catch {
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
    activeController?.abort();
    activeController = null;
    cached = null;
  }

  return { discover, dispose };
}

export const localAgentInventoryPolicy = Object.freeze({
  cacheTtlMs: CACHE_TTL_MS,
  tools: createLocalAgentToolRegistry(),
});
