import { assertAgentRuntimePort } from "./agent-runtime-port.mjs";

export class AgentRuntimeRegistry {
  constructor(definitions) {
    this.definitions = new Map();
    for (const definition of definitions) {
      validateDefinition(definition);
      if (this.definitions.has(definition.descriptor.id)) {
        throw new Error(`Duplicate Agent runtime: ${definition.descriptor.id}`);
      }
      this.definitions.set(definition.descriptor.id, definition);
    }
    if (this.definitions.size === 0) throw new Error("At least one Agent runtime must be registered.");
  }

  descriptors() {
    return Array.from(this.definitions.values())
      .map((definition) => ({ ...definition.descriptor }))
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  }

  async discover({ refresh = false } = {}) {
    const results = await Promise.all(this.descriptors().map(async (descriptor) => {
      const definition = this.require(descriptor.id);
      try {
        const readiness = await definition.discovery.discover({ refresh });
        return { descriptor, readiness };
      } catch (error) {
        return {
          descriptor,
          readiness: {
            runtimeId: descriptor.id,
            provider: descriptor.id,
            status: "error",
            version: null,
            minimumVersion: null,
            executablePath: null,
            environment: {},
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }));
    return results;
  }

  select(catalog, preferredRuntimeId = null) {
    if (preferredRuntimeId) {
      const preferred = catalog.find((entry) => entry.descriptor.id === preferredRuntimeId);
      if (preferred) return preferred;
    }
    return catalog.find((entry) => entry.readiness.status === "ready") ?? catalog[0] ?? null;
  }

  createAdapter(runtimeId, options) {
    const definition = this.require(runtimeId);
    return assertAgentRuntimePort(definition.createAdapter(options), runtimeId);
  }

  require(runtimeId) {
    const definition = this.definitions.get(runtimeId);
    if (!definition) throw new Error(`Unknown Agent runtime: ${runtimeId}`);
    return definition;
  }

  async dispose() {
    await Promise.all(Array.from(this.definitions.values()).map((definition) => definition.dispose?.()));
  }

  hasActiveResources() {
    return Array.from(this.definitions.values()).some((definition) => definition.hasActiveResources?.() === true);
  }
}

/** Main-process lifecycle facade. The renderer never receives this object. */
export class AgentRuntimeHost {
  constructor(registry) {
    if (!(registry instanceof AgentRuntimeRegistry)) throw new TypeError("AgentRuntimeHost requires an AgentRuntimeRegistry.");
    this.registry = registry;
  }

  descriptors() { return this.registry.descriptors(); }
  discover(options) { return this.registry.discover(options); }
  select(catalog, runtimeId) { return this.registry.select(catalog, runtimeId); }
  createAdapter(runtimeId, options) { return this.registry.createAdapter(runtimeId, options); }
  require(runtimeId) { return this.registry.require(runtimeId); }
  hasActiveResources() { return this.registry.hasActiveResources(); }
  dispose() { return this.registry.dispose(); }
}

export function publicRuntimeReadiness(entry) {
  const readiness = entry?.readiness ?? {};
  return {
    runtimeId: entry?.descriptor?.id ?? readiness.runtimeId ?? readiness.provider ?? "unknown",
    provider: entry?.descriptor?.id ?? readiness.provider ?? "unknown",
    status: readiness.status ?? "error",
    version: readiness.version ?? null,
    minimumVersion: readiness.minimumVersion ?? null,
    message: readiness.message ?? "",
    source: readiness.source ?? "external",
    compatibility: readiness.compatibility ?? "unknown",
    ...(readiness.diagnostic ? { diagnostic: readiness.diagnostic } : {}),
  };
}

function validateDefinition(definition) {
  const descriptor = definition?.descriptor;
  if (!descriptor || !/^[a-z][a-z0-9-]{1,39}$/.test(descriptor.id)) {
    throw new TypeError("Agent runtime descriptor id is invalid.");
  }
  if (typeof descriptor.displayName !== "string" || !descriptor.displayName.trim()) {
    throw new TypeError(`Agent runtime ${descriptor.id} requires a display name.`);
  }
  if (!definition.discovery || typeof definition.discovery.discover !== "function") {
    throw new TypeError(`Agent runtime ${descriptor.id} requires discovery.`);
  }
  if (typeof definition.createAdapter !== "function") {
    throw new TypeError(`Agent runtime ${descriptor.id} requires an adapter factory.`);
  }
}
