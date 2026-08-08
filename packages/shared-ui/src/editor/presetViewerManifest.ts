import manifestJson from "./presetViewerManifest.json";
import {
  PRESET_VIEWER_CAPABILITIES,
  PRESET_VIEWER_CONTRACT_VERSION,
  PRESET_VIEWER_RUNTIMES,
  PRESET_VIEWER_SOURCES,
  type CoreViewerCapability,
  type PresetViewerContractVersion,
  type PresetViewerRuntime,
  type PresetViewerSource,
} from "./viewerContract";

export type PresetViewerDefinition = Readonly<{
  contractVersion: PresetViewerContractVersion;
  id: string;
  formatViewerIds: readonly string[];
  capability: CoreViewerCapability;
  source: PresetViewerSource;
  runtime: PresetViewerRuntime;
}>;

export type PresetViewerManifest = Readonly<{
  contractVersion: PresetViewerContractVersion;
  fallbackViewerId: string;
  viewers: readonly PresetViewerDefinition[];
}>;

const VIEWER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MANIFEST_KEYS = new Set(["contractVersion", "fallbackViewerId", "viewers"]);
const DEFINITION_KEYS = new Set([
  "id",
  "formatViewerIds",
  "capability",
  "source",
  "runtime",
]);

export const PRESET_VIEWER_MANIFEST = parsePresetViewerManifest(manifestJson);

const definitionsById = new Map(
  PRESET_VIEWER_MANIFEST.viewers.map((definition) => [definition.id, definition]),
);
const definitionsByViewerId = new Map<string, PresetViewerDefinition>();

for (const definition of PRESET_VIEWER_MANIFEST.viewers) {
  definitionsByViewerId.set(definition.id, definition);
  for (const viewerId of definition.formatViewerIds) {
    definitionsByViewerId.set(viewerId, definition);
  }
}

export function getPresetViewerDefinition(id: string): PresetViewerDefinition {
  const definition = definitionsById.get(id);
  if (!definition) {
    throw new TypeError(`Preset viewer ${id || "<empty>"} is not declared in the canonical manifest.`);
  }
  return definition;
}

/**
 * Resolves both canonical contribution ids and file-format `defaultViewer`
 * ids through the same serializable manifest consumed by Electron main.
 */
export function getPresetViewerDefinitionForViewerId(
  viewerId: string,
): PresetViewerDefinition {
  const definition = definitionsByViewerId.get(viewerId);
  if (!definition) {
    throw new TypeError(`Core viewer ${viewerId || "<empty>"} is not declared in the canonical manifest.`);
  }
  return definition;
}

export function coreViewerCapability(viewerId: string): CoreViewerCapability {
  return getPresetViewerDefinitionForViewerId(viewerId).capability;
}

function parsePresetViewerManifest(input: unknown): PresetViewerManifest {
  const record = assertRecord(input, "Preset viewer manifest");
  assertExactKeys(record, MANIFEST_KEYS, "Preset viewer manifest");
  if (record.contractVersion !== PRESET_VIEWER_CONTRACT_VERSION) {
    throw new TypeError("Preset viewer manifest uses an unsupported contract version.");
  }
  if (typeof record.fallbackViewerId !== "string" || !VIEWER_ID_PATTERN.test(record.fallbackViewerId)) {
    throw new TypeError("Preset viewer manifest has an invalid fallback viewer id.");
  }
  if (!Array.isArray(record.viewers) || record.viewers.length === 0) {
    throw new TypeError("Preset viewer manifest must declare at least one viewer.");
  }

  const ids = new Set<string>();
  const allViewerIds = new Set<string>();
  const viewers = record.viewers.map((rawDefinition, index) => {
    const definition = parseDefinition(rawDefinition, index);
    if (ids.has(definition.id)) {
      throw new TypeError(`Preset viewer manifest declares ${definition.id} more than once.`);
    }
    ids.add(definition.id);
    for (const viewerId of [definition.id, ...definition.formatViewerIds]) {
      if (allViewerIds.has(viewerId)) {
        throw new TypeError(`Core viewer id ${viewerId} maps to more than one preset viewer.`);
      }
      allViewerIds.add(viewerId);
    }
    return definition;
  });

  const fallback = viewers.find((definition) => definition.id === record.fallbackViewerId);
  if (!fallback || fallback.capability !== "placeholder" || fallback.source !== "none") {
    throw new TypeError("Preset viewer fallback must be a declared placeholder with source 'none'.");
  }
  if (viewers.filter((definition) => definition.capability === "placeholder").length !== 1) {
    throw new TypeError("Preset viewer manifest must declare exactly one placeholder fallback.");
  }

  return Object.freeze({
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    fallbackViewerId: record.fallbackViewerId,
    viewers: Object.freeze(viewers),
  });
}

function parseDefinition(input: unknown, index: number): PresetViewerDefinition {
  const label = `Preset viewer definition at index ${index}`;
  const record = assertRecord(input, label);
  assertExactKeys(record, DEFINITION_KEYS, label);
  if (typeof record.id !== "string" || !VIEWER_ID_PATTERN.test(record.id)) {
    throw new TypeError(`${label} has an invalid id.`);
  }
  if (!Array.isArray(record.formatViewerIds) || record.formatViewerIds.some(
    (viewerId) => typeof viewerId !== "string" || !VIEWER_ID_PATTERN.test(viewerId),
  )) {
    throw new TypeError(`Preset viewer ${record.id} has invalid format viewer ids.`);
  }
  if (new Set(record.formatViewerIds).size !== record.formatViewerIds.length) {
    throw new TypeError(`Preset viewer ${record.id} repeats a format viewer id.`);
  }
  if (!PRESET_VIEWER_CAPABILITIES.includes(record.capability as never)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported capability.`);
  }
  if (!PRESET_VIEWER_SOURCES.includes(record.source as never)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported source requirement.`);
  }
  if (!PRESET_VIEWER_RUNTIMES.includes(record.runtime as never)) {
    throw new TypeError(`Preset viewer ${record.id} has an unsupported runtime boundary.`);
  }

  const capability = record.capability as CoreViewerCapability;
  const source = record.source as PresetViewerSource;
  if (capability === "edit" && source !== "content" && source !== "content-and-resource") {
    throw new TypeError(`Editable preset viewer ${record.id} must receive content.`);
  }
  if (capability === "preview" && source === "none") {
    throw new TypeError(`Preview preset viewer ${record.id} must declare a content or resource source.`);
  }
  if (capability === "placeholder" && source !== "none") {
    throw new TypeError(`Placeholder preset viewer ${record.id} must use source 'none'.`);
  }

  return Object.freeze({
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: record.id,
    formatViewerIds: Object.freeze([...record.formatViewerIds]) as readonly string[],
    capability,
    source,
    runtime: record.runtime as PresetViewerRuntime,
  });
}

function assertRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new TypeError(`${label} has unknown field(s): ${unknown.join(", ")}.`);
  }
}
