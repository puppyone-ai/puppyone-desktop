import os from "node:os";
import { redactSecretText } from "../agent-events.mjs";
import {
  readinessWithAccountState,
  unavailableReadiness,
} from "./agent-input-policy.mjs";
import { publicRuntimeReadiness } from "../runtime/agent-runtime-registry.mjs";
import {
  assertAgentRuntimeInspection,
  normalizeCapabilitySnapshot,
} from "../runtime/agent-runtime-port.mjs";

const INSPECTION_CACHE_MS = 30_000;
// Discovery/account/model inspection must never depend on process.cwd().
const NEUTRAL_INSPECTION_ROOT = os.tmpdir();

export function createAgentRuntimeCatalog({ runtimeRegistry }) {
  const inspectionCache = new Map();

  async function discover(request = {}, workspaceRoot = null) {
    const catalog = await runtimeRegistry.discover({ refresh: Boolean(request.refresh) });
    if (request.refresh) inspectionCache.clear();
    const selected = selectRequestedRuntime(runtimeRegistry, catalog, request.runtimeId);
    const runtimes = catalog.map((entry) => ({
      descriptor: { ...entry.descriptor },
      readiness: publicRuntimeReadiness(entry),
    }));
    if (!selected) {
      return {
        runtimes,
        selectedRuntimeId: null,
        readiness: unavailableReadiness("No Agent runtime is registered."),
        account: null,
        providers: [],
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        warnings: [],
      };
    }
    const publicReadiness = publicRuntimeReadiness(selected);
    if (publicReadiness.status !== "ready") {
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: publicReadiness,
        account: null,
        providers: [],
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        runtime: { ...selected.descriptor },
        warnings: [],
      };
    }
    try {
      const inspection = await inspect({
        runtimeId: selected.descriptor.id,
        readiness: selected.readiness,
        workspaceRoot: workspaceRoot || NEUTRAL_INSPECTION_ROOT,
        refresh: Boolean(request.refresh),
      });
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: readinessWithAccountState(publicReadiness, inspection.account, selected.descriptor.displayName),
        ...inspection,
      };
    } catch (error) {
      const message = redactSecretText(error instanceof Error ? error.message : String(error));
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: { ...publicReadiness, status: "error", message },
        account: null,
        providers: [],
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        runtime: { ...selected.descriptor },
        warnings: [message],
      };
    }
  }

  async function inspect({ runtimeId, readiness, workspaceRoot, refresh = false }) {
    const key = `${runtimeId}\0${workspaceRoot}`;
    const now = Date.now();
    const cached = inspectionCache.get(key);
    if (!refresh && cached && now - cached.createdAt < INSPECTION_CACHE_MS) return cached.value;
    const adapter = runtimeRegistry.createAdapter(runtimeId, {
      readiness,
      workspaceRoot,
      onEvent: () => {},
      onExit: () => {},
    });
    try {
      const inspection = assertAgentRuntimeInspection(adapter, await adapter.inspect(), runtimeId);
      const value = {
        account: inspection.account ?? null,
        providers: Array.isArray(inspection.providers) ? inspection.providers : [],
        models: Array.isArray(inspection.models) ? inspection.models : [],
        modes: Array.isArray(inspection.modes) ? inspection.modes : [],
        commands: Array.isArray(inspection.commands) ? inspection.commands : [],
        capabilities: normalizeCapabilitySnapshot(inspection.capabilities),
        runtime: inspection.runtime ?? runtimeRegistry.require(runtimeId).descriptor,
        warnings: Array.isArray(inspection.warnings) ? inspection.warnings : [],
      };
      inspectionCache.set(key, { createdAt: now, value });
      return value;
    } finally {
      await adapter.dispose();
    }
  }

  return {
    discover,
    listModels: async (request, workspaceRoot) => (await discover(request, workspaceRoot)).models,
    readAccount: async (request, workspaceRoot) => (await discover(request, workspaceRoot)).account,
    clear: () => inspectionCache.clear(),
  };
}

function selectRequestedRuntime(runtimeRegistry, catalog, value) {
  if (value !== undefined && value !== null && !/^[a-z][a-z0-9-]{1,39}$/.test(value)) {
    throw new Error("Agent runtime selection is invalid.");
  }
  const selected = runtimeRegistry.select(catalog, value || null);
  if (value && selected?.descriptor?.id !== value) throw new Error(`Agent runtime ${value} is not registered.`);
  return selected;
}
