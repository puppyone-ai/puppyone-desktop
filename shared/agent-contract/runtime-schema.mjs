import { AGENT_RUNTIME_CAPABILITIES } from "./constants.mjs";
import {
  assertArray,
  assertRecord,
  assertRuntimeId,
  enumValue,
  requiredString,
} from "./validation.mjs";

const CAPABILITY_METHODS = Object.freeze({
  manualApprovals: "resolveApproval",
  structuredQuestions: "resolveQuestion",
  fork: "forkSession",
  steer: "steerTurn",
  compaction: "compactSession",
});

export function assertAgentInspection(value) {
  const inspection = assertRecord(value, "Agent inspection");
  if (inspection.runtime !== undefined) assertRuntimeDescriptor(inspection.runtime);
  if (inspection.readiness !== undefined) assertReadiness(inspection.readiness);
  assertArray(inspection.providers ?? [], "Agent inspection.providers").forEach(assertAgentInferenceProvider);
  assertArray(inspection.models ?? [], "Agent inspection.models").forEach(assertAgentModel);
  assertArray(inspection.modes ?? [], "Agent inspection.modes").forEach((mode) => assertNamedEntry(mode, "mode"));
  assertArray(inspection.commands ?? [], "Agent inspection.commands").forEach((command) => assertNamedEntry(command, "command", "name"));
  normalizeCapabilitySnapshot(inspection.capabilities ?? {});
  assertArray(inspection.warnings ?? [], "Agent inspection.warnings").forEach((warning) => requiredString(warning, "warning", 32_768));
  return value;
}

export function assertAgentRuntimeCapabilities(adapter, capabilities, runtimeId = "unknown") {
  const normalized = normalizeCapabilitySnapshot(capabilities);
  for (const [capability, method] of Object.entries(CAPABILITY_METHODS)) {
    if (normalized[capability] && typeof adapter?.[method] !== "function") {
      throw new TypeError(`Agent runtime ${runtimeId} advertises ${capability} but is missing ${method}().`);
    }
  }
  return normalized;
}

export function normalizeCapabilitySnapshot(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map((capability) => [capability, source[capability] === true]));
}

function assertRuntimeDescriptor(value) {
  const descriptor = assertRecord(value, "runtime descriptor");
  assertRuntimeId(descriptor.id, "runtime descriptor.id");
  requiredString(descriptor.displayName, "runtime descriptor.displayName", 160);
  return value;
}

/** Project a trusted/native descriptor onto the bounded Renderer-safe DTO. */
export function sanitizeAgentRuntimeDescriptor(value) {
  const descriptor = assertRecord(value, "runtime descriptor");
  const id = assertRuntimeId(descriptor.id, "runtime descriptor.id");
  const displayName = requiredString(descriptor.displayName, "runtime descriptor.displayName", 160);
  return {
    id,
    displayName,
    description: boundedOptionalText(descriptor.description, 2_000),
    kind: boundedOptionalText(descriptor.kind, 80) || "native",
    iconKey: boundedOptionalText(descriptor.iconKey, 80) || id,
    priority: Number.isSafeInteger(descriptor.priority) ? descriptor.priority : 0,
    ...(boundedOptionalText(descriptor.distribution, 80) ? { distribution: boundedOptionalText(descriptor.distribution, 80) } : {}),
    ...(boundedOptionalText(descriptor.version, 80) ? { version: boundedOptionalText(descriptor.version, 80) } : {}),
    ...(boundedOptionalText(descriptor.source, 80) ? { source: boundedOptionalText(descriptor.source, 80) } : {}),
    ...(boundedOptionalText(descriptor.compatibility, 120) ? { compatibility: boundedOptionalText(descriptor.compatibility, 120) } : {}),
  };
}

function assertReadiness(value) {
  const readiness = assertRecord(value, "runtime readiness");
  assertRuntimeId(readiness.runtimeId ?? readiness.provider, "runtime readiness.runtimeId");
  enumValue(readiness.status, "runtime readiness.status", ["not-installed", "installed-not-authenticated", "unsupported-version", "protocol-unavailable", "ready", "error"]);
  return value;
}

export function assertAgentModel(value) {
  const model = assertRecord(value, "Agent model");
  requiredString(model.id, "Agent model.id", 512);
  requiredString(model.model, "Agent model.model", 512);
  requiredString(model.displayName, "Agent model.displayName", 512);
  if (model.providerId !== undefined) requiredString(model.providerId, "Agent model.providerId", 160);
  if (model.modelId !== undefined) requiredString(model.modelId, "Agent model.modelId", 300);
  return value;
}

export function assertAgentInferenceProvider(value) {
  const provider = assertRecord(value, "Agent inference provider");
  requiredString(provider.id, "Agent inference provider.id", 160);
  requiredString(provider.displayName, "Agent inference provider.displayName", 160);
  if (provider.source !== undefined && provider.source !== null) requiredString(provider.source, "Agent inference provider.source", 40);
  if (provider.defaultModel !== undefined && provider.defaultModel !== null) requiredString(provider.defaultModel, "Agent inference provider.defaultModel", 512);
  if (!Number.isSafeInteger(provider.modelCount) || provider.modelCount < 0 || provider.modelCount > 500) {
    throw new TypeError("Agent inference provider.modelCount must be a bounded non-negative integer.");
  }
  return value;
}

function assertNamedEntry(value, label, idKey = "id") {
  const entry = assertRecord(value, `Agent ${label}`);
  requiredString(entry[idKey], `Agent ${label}.${idKey}`, 512);
  return value;
}

function boundedOptionalText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
