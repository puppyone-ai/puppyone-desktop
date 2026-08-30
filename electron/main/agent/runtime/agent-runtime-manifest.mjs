import { sanitizeAgentRuntimeDescriptor } from "../../../../shared/agent-contract/runtime-schema.mjs";

export const AGENT_RUNTIME_MANIFEST_VERSION = 1;

const EXECUTION_KINDS = Object.freeze([
  "managed-local-process",
  "local-process",
  "sdk-mediated-process",
  "remote-service",
]);
const DISTRIBUTIONS = Object.freeze([
  "bundled",
  "user-installed",
  "managed-download",
  "remote",
]);
const CONTROLLERS = Object.freeze(["bundled-adapter", "bundled-sdk", "remote-client"]);
const PROTOCOL_KINDS = Object.freeze(["acp", "app-server", "agent-sdk", "rpc", "http-api"]);
const PROTOCOL_TRANSPORTS = Object.freeze(["stdio-json-rpc", "in-process-sdk", "https"]);
const INTEGRATION_KINDS = Object.freeze([
  "managed-harness",
  "specialized-native",
  "native-protocol",
  "compatibility-bridge",
  "user-defined",
]);
const ADAPTER_KINDS = Object.freeze(["specialized", "generic-acp", "custom"]);
const TRUST_LEVELS = Object.freeze([
  "bundled-verified",
  "first-party",
  "reviewed-bridge",
  "user-defined",
]);
const OWNERS = Object.freeze(["puppyone", "runtime", "user-provider"]);

/**
 * Define the main-process-only facts that classify one Agent runtime.
 *
 * Launch commands, executable paths, credentials and environment maps are
 * deliberately excluded. Discovery and concrete adapters own those secrets
 * and operational details; the manifest owns stable routing semantics.
 */
export function defineAgentRuntimeManifest(value) {
  const source = record(value, "manifest");
  exactKeys(source, "manifest", [
    "schemaVersion",
    "id",
    "displayName",
    "description",
    "iconKey",
    "priority",
    "execution",
    "protocol",
    "integration",
    "trust",
    "ownership",
    "source",
    "compatibility",
  ]);
  const schemaVersion = source.schemaVersion ?? AGENT_RUNTIME_MANIFEST_VERSION;
  if (schemaVersion !== AGENT_RUNTIME_MANIFEST_VERSION) {
    throw invalid("schemaVersion", `must be ${AGENT_RUNTIME_MANIFEST_VERSION}`);
  }

  const id = runtimeId(source.id);
  const displayName = text(source.displayName, "displayName", 160);
  const executionSource = record(source.execution, "execution");
  const protocolSource = record(source.protocol, "protocol");
  const integrationSource = record(source.integration, "integration");
  const trustSource = record(source.trust, "trust");
  const ownershipSource = record(source.ownership, "ownership");
  exactKeys(executionSource, "execution", ["kind", "distribution", "controller"]);
  exactKeys(protocolSource, "protocol", ["kind", "transport"]);
  exactKeys(integrationSource, "integration", ["kind", "adapter"]);
  exactKeys(trustSource, "trust", ["level", "publisher"]);
  exactKeys(ownershipSource, "ownership", ["harness", "credentials", "models", "billing", "session"]);

  const manifest = {
    schemaVersion,
    id,
    displayName,
    description: optionalText(source.description, "description", 2_000),
    iconKey: optionalText(source.iconKey, "iconKey", 80) || id,
    priority: Number.isSafeInteger(source.priority) ? source.priority : 0,
    execution: {
      kind: choice(executionSource.kind, "execution.kind", EXECUTION_KINDS),
      distribution: choice(executionSource.distribution, "execution.distribution", DISTRIBUTIONS),
      controller: choice(executionSource.controller, "execution.controller", CONTROLLERS),
    },
    protocol: {
      kind: choice(protocolSource.kind, "protocol.kind", PROTOCOL_KINDS),
      transport: choice(protocolSource.transport, "protocol.transport", PROTOCOL_TRANSPORTS),
    },
    integration: {
      kind: choice(integrationSource.kind, "integration.kind", INTEGRATION_KINDS),
      adapter: choice(integrationSource.adapter, "integration.adapter", ADAPTER_KINDS),
    },
    trust: {
      level: choice(trustSource.level, "trust.level", TRUST_LEVELS),
      publisher: text(trustSource.publisher, "trust.publisher", 160),
    },
    ownership: {
      harness: choice(ownershipSource.harness, "ownership.harness", OWNERS),
      credentials: ownerList(ownershipSource.credentials, "ownership.credentials"),
      models: choice(ownershipSource.models, "ownership.models", OWNERS),
      billing: ownerList(ownershipSource.billing, "ownership.billing"),
      session: choice(ownershipSource.session, "ownership.session", OWNERS),
    },
    source: optionalText(source.source, "source", 80),
    compatibility: optionalText(source.compatibility, "compatibility", 120),
  };

  validateRelationships(manifest);
  return deepFreeze(manifest);
}

/** Create the bounded public projection; never expose operational launch data. */
export function runtimeDescriptorFromManifest(value) {
  const manifest = defineAgentRuntimeManifest(value);
  return deepFreeze(sanitizeAgentRuntimeDescriptor({
    id: manifest.id,
    displayName: manifest.displayName,
    description: manifest.description,
    iconKey: manifest.iconKey,
    priority: manifest.priority,
    kind: manifest.integration.kind,
    distribution: manifest.execution.distribution,
    execution: manifest.execution,
    protocol: manifest.protocol,
    integration: manifest.integration,
    trust: manifest.trust,
    ownership: manifest.ownership,
    source: manifest.source,
    compatibility: manifest.compatibility,
  }));
}

function validateRelationships(manifest) {
  if (manifest.integration.adapter === "generic-acp" && manifest.protocol.kind !== "acp") {
    throw invalid("integration.adapter", "generic-acp requires protocol.kind acp");
  }
  if (manifest.integration.kind === "compatibility-bridge" && manifest.trust.level !== "reviewed-bridge") {
    throw invalid("trust.level", "compatibility-bridge requires reviewed-bridge trust");
  }
  if (manifest.integration.kind === "user-defined" && manifest.trust.level !== "user-defined") {
    throw invalid("trust.level", "user-defined integration requires user-defined trust");
  }
  if (manifest.trust.level === "bundled-verified" && !["bundled", "managed-download"].includes(manifest.execution.distribution)) {
    throw invalid("execution.distribution", "bundled-verified trust requires bundled or managed-download distribution");
  }
  if (manifest.execution.kind === "remote-service" && manifest.protocol.transport !== "https") {
    throw invalid("protocol.transport", "remote-service requires https");
  }
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(label, "must be an object");
  return value;
}

function exactKeys(value, label, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw invalid(label, `contains unsupported field ${unknown[0]}`);
}

function runtimeId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(value)) throw invalid("id", "is invalid");
  return value;
}

function text(value, label, limit) {
  if (typeof value !== "string" || !value.trim()) throw invalid(label, "must be non-empty text");
  const normalized = value.trim();
  if (normalized.length > limit) throw invalid(label, `exceeds ${limit} characters`);
  return normalized;
}

function optionalText(value, label, limit) {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, label, limit);
}

function choice(value, label, allowed) {
  if (!allowed.includes(value)) throw invalid(label, `must be one of ${allowed.join(", ")}`);
  return value;
}

function ownerList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > OWNERS.length) {
    throw invalid(label, "must be a non-empty bounded owner list");
  }
  const normalized = value.map((entry, index) => choice(entry, `${label}[${index}]`, OWNERS));
  if (new Set(normalized).size !== normalized.length) throw invalid(label, "must not contain duplicates");
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function invalid(path, reason) {
  return new TypeError(`Invalid Agent runtime manifest: ${path} ${reason}.`);
}
