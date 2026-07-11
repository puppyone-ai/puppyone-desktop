import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manifestJson = require("../../../vendor/shared-ui/src/editor/presetViewerManifest.json");

const CONTRACT_VERSION = 2;
const CAPABILITIES = new Set(["edit", "preview", "placeholder"]);
const SOURCES = new Set(["content", "resource", "content-and-resource", "none"]);
const RUNTIMES = new Set(["eager", "lazy"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MANIFEST_KEYS = new Set(["contractVersion", "fallbackViewerId", "viewers"]);
const DEFINITION_KEYS = new Set(["id", "formatViewerIds", "capability", "source", "runtime"]);

export const PRESET_VIEWER_MANIFEST = parseManifest(manifestJson);

const definitionsByViewerId = new Map();
for (const definition of PRESET_VIEWER_MANIFEST.viewers) {
  definitionsByViewerId.set(definition.id, definition);
  for (const viewerId of definition.formatViewerIds) {
    definitionsByViewerId.set(viewerId, definition);
  }
}

export function getPresetViewerDefinitionForViewerId(viewerId) {
  const definition = definitionsByViewerId.get(viewerId);
  if (!definition) {
    throw new TypeError(`Core viewer ${viewerId || "<empty>"} is not declared in the canonical manifest.`);
  }
  return definition;
}

export function capabilityForCoreViewer(viewerId) {
  return getPresetViewerDefinitionForViewerId(viewerId).capability;
}

function parseManifest(input) {
  const record = assertRecord(input, "Preset viewer manifest");
  assertExactKeys(record, MANIFEST_KEYS, "Preset viewer manifest");
  if (record.contractVersion !== CONTRACT_VERSION) {
    throw new TypeError("Preset viewer manifest uses an unsupported contract version.");
  }
  if (typeof record.fallbackViewerId !== "string" || !ID_PATTERN.test(record.fallbackViewerId)) {
    throw new TypeError("Preset viewer manifest has an invalid fallback viewer id.");
  }
  if (!Array.isArray(record.viewers) || record.viewers.length === 0) {
    throw new TypeError("Preset viewer manifest must declare at least one viewer.");
  }

  const canonicalIds = new Set();
  const allViewerIds = new Set();
  const viewers = record.viewers.map((raw, index) => {
    const definition = parseDefinition(raw, index);
    if (canonicalIds.has(definition.id)) {
      throw new TypeError(`Preset viewer manifest declares ${definition.id} more than once.`);
    }
    canonicalIds.add(definition.id);
    for (const viewerId of [definition.id, ...definition.formatViewerIds]) {
      if (allViewerIds.has(viewerId)) {
        throw new TypeError(`Core viewer id ${viewerId} maps to more than one preset viewer.`);
      }
      allViewerIds.add(viewerId);
    }
    return definition;
  });

  const fallback = viewers.find(({ id }) => id === record.fallbackViewerId);
  if (!fallback || fallback.capability !== "placeholder" || fallback.source !== "none") {
    throw new TypeError("Preset viewer fallback must be a declared placeholder with source 'none'.");
  }
  if (viewers.filter(({ capability }) => capability === "placeholder").length !== 1) {
    throw new TypeError("Preset viewer manifest must declare exactly one placeholder fallback.");
  }

  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    fallbackViewerId: record.fallbackViewerId,
    viewers: Object.freeze(viewers),
  });
}

function parseDefinition(input, index) {
  const label = `Preset viewer definition at index ${index}`;
  const record = assertRecord(input, label);
  assertExactKeys(record, DEFINITION_KEYS, label);
  if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
    throw new TypeError(`${label} has an invalid id.`);
  }
  if (
    !Array.isArray(record.formatViewerIds) ||
    record.formatViewerIds.some((id) => typeof id !== "string" || !ID_PATTERN.test(id)) ||
    new Set(record.formatViewerIds).size !== record.formatViewerIds.length
  ) {
    throw new TypeError(`Preset viewer ${record.id} has invalid or repeated format viewer ids.`);
  }
  if (!CAPABILITIES.has(record.capability)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported capability.`);
  }
  if (!SOURCES.has(record.source)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported source requirement.`);
  }
  if (!RUNTIMES.has(record.runtime)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported runtime boundary.`);
  }
  if (record.capability === "edit" && !["content", "content-and-resource"].includes(record.source)) {
    throw new TypeError(`Editable preset viewer ${record.id} must receive content.`);
  }
  if (record.capability === "preview" && record.source === "none") {
    throw new TypeError(`Preview preset viewer ${record.id} must declare a content or resource source.`);
  }
  if (record.capability === "placeholder" && record.source !== "none") {
    throw new TypeError(`Placeholder preset viewer ${record.id} must use source 'none'.`);
  }

  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    id: record.id,
    formatViewerIds: Object.freeze([...record.formatViewerIds]),
    capability: record.capability,
    source: record.source,
    runtime: record.runtime,
  });
}

function assertRecord(input, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return input;
}

function assertExactKeys(record, allowed, label) {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`${label} has unknown field(s): ${unknown.join(", ")}.`);
  }
}
