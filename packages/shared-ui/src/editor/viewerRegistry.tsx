"use client";

import { getResolvedFileExtension, resolveFileFormat } from "../core/fileFormats";
import type {
  EditorDocument,
  EditorSourceRequirement,
  EditorViewerMatch,
  PresetViewerContribution,
  PresetViewerImplementation,
} from "./viewerTypes";
import {
  type CoreViewerCapability,
} from "./viewerContract";
import {
  getPresetViewerDefinition,
  PRESET_VIEWER_MANIFEST,
} from "./presetViewerManifest";
import { AppPreviewViewer } from "./viewers/AppPreviewViewer";
import { JsonViewer, TextFileViewer, canEditTextFile } from "./viewers/CodeViewer";
import { CsvViewer, canEditCsv } from "./viewers/CsvViewer";
import { DocumentPreview } from "./viewers/DocumentFallbackViewer";
import { HtmlViewer } from "./viewers/HtmlViewer";
import {
  AudioResourceViewer,
  ImageResourceViewer,
  PdfResourceViewer,
  VideoResourceViewer,
} from "./viewers/ResourceViewers";
import { formatJson } from "./viewers/viewerUtils";
import { useLocalization } from "@puppyone/localization/react";

const PRESET_VIEWER_IMPLEMENTATION_KEYS = new Set([
  "id",
  "match",
  "allowPreviewContent",
  "normalizeContent",
  "isEditable",
  "render",
  "load",
]);

const RESOLVED_PRESET_VIEWER_KEYS = new Set([
  "contractVersion",
  "id",
  "formatViewerIds",
  "capability",
  "source",
  "runtime",
  ...PRESET_VIEWER_IMPLEMENTATION_KEYS,
]);

const OPTIONAL_FUNCTION_KEYS = ["normalizeContent", "isEditable"] as const;

/**
 * Runtime validation complements TypeScript's excess-property checks. It is
 * intentionally small and strict so a contribution loaded through an adapter
 * cannot silently acquire host authority through an unknown field.
 */
export function definePresetViewer(
  implementation: PresetViewerImplementation,
): PresetViewerContribution {
  const record = implementation as unknown as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !PRESET_VIEWER_IMPLEMENTATION_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`Preset viewer ${String(record.id ?? "<unknown>")} has unknown field(s): ${unknownKeys.join(", ")}.`);
  }
  if (typeof record.id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(record.id)) {
    throw new TypeError("Preset viewer id must be a stable lowercase kebab-case identifier.");
  }
  const definition = getPresetViewerDefinition(record.id);
  return normalizePresetViewerContribution({
    ...definition,
    ...implementation,
  } as PresetViewerContribution);
}

function normalizePresetViewerContribution(
  contribution: PresetViewerContribution,
): PresetViewerContribution {
  const record = contribution as unknown as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !RESOLVED_PRESET_VIEWER_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`Preset viewer ${String(record.id ?? "<unknown>")} has unknown field(s): ${unknownKeys.join(", ")}.`);
  }
  if (typeof record.id !== "string") {
    throw new TypeError("Preset viewer id must be a string.");
  }
  const definition = getPresetViewerDefinition(record.id);
  for (const key of ["contractVersion", "capability", "source", "runtime"] as const) {
    if (record[key] !== definition[key]) {
      throw new TypeError(`Preset viewer ${record.id} does not match canonical ${key} metadata.`);
    }
  }
  if (
    !Array.isArray(record.formatViewerIds) ||
    record.formatViewerIds.length !== definition.formatViewerIds.length ||
    record.formatViewerIds.some((value, index) => value !== definition.formatViewerIds[index])
  ) {
    throw new TypeError(`Preset viewer ${record.id} does not match canonical format viewer ids.`);
  }
  if (typeof record.match !== "function") {
    throw new TypeError(`Preset viewer ${record.id} must define a match function.`);
  }
  if (record.allowPreviewContent !== undefined && typeof record.allowPreviewContent !== "boolean") {
    throw new TypeError(`Preset viewer ${record.id} has an invalid allowPreviewContent value.`);
  }
  for (const key of OPTIONAL_FUNCTION_KEYS) {
    if (record[key] !== undefined && typeof record[key] !== "function") {
      throw new TypeError(`Preset viewer ${record.id} has an invalid ${key} function.`);
    }
  }
  if (definition.capability === "edit" && typeof record.isEditable !== "function") {
    throw new TypeError(`Editable preset viewer ${record.id} must define isEditable.`);
  }
  if (definition.capability !== "edit" && record.isEditable !== undefined) {
    throw new TypeError(`Non-editable preset viewer ${record.id} cannot define isEditable.`);
  }
  if (
    record.allowPreviewContent !== undefined &&
    definition.source !== "content-and-resource"
  ) {
    throw new TypeError(`Preset viewer ${record.id} can only configure preview content for a combined source.`);
  }
  if (
    record.normalizeContent !== undefined &&
    definition.source !== "content" &&
    definition.source !== "content-and-resource"
  ) {
    throw new TypeError(`Preset viewer ${record.id} cannot normalize content it does not receive.`);
  }
  if (definition.runtime === "eager") {
    if (typeof record.render !== "function" || record.load !== undefined) {
      throw new TypeError(`Eager preset viewer ${record.id} must define render and cannot define load.`);
    }
  } else if (typeof record.load !== "function" || record.render !== undefined) {
    throw new TypeError(`Lazy preset viewer ${record.id} must define load and cannot define render.`);
  }

  return Object.freeze({
    ...contribution,
    formatViewerIds: definition.formatViewerIds,
  });
}

export type PresetViewerRegistry = Readonly<{
  contributions: readonly PresetViewerContribution[];
  fallback: PresetViewerContribution;
  resolve: (match: EditorViewerMatch) => PresetViewerContribution;
}>;

/** Creates an immutable, order-preserving registry with one honest fallback. */
export function createPresetViewerRegistry(
  contributions: readonly PresetViewerContribution[],
  fallback: PresetViewerContribution,
): PresetViewerRegistry {
  const normalized = contributions.map(normalizePresetViewerContribution);
  const normalizedFallback = normalizePresetViewerContribution(fallback);
  const ids = new Set<string>();
  for (const contribution of [...normalized, normalizedFallback]) {
    if (ids.has(contribution.id)) {
      throw new TypeError(`Preset viewer id ${contribution.id} is registered more than once.`);
    }
    ids.add(contribution.id);
  }
  if (normalizedFallback.id !== PRESET_VIEWER_MANIFEST.fallbackViewerId) {
    throw new TypeError(`The preset viewer fallback must be ${PRESET_VIEWER_MANIFEST.fallbackViewerId}.`);
  }

  const frozenContributions = Object.freeze(normalized);
  return Object.freeze({
    contributions: frozenContributions,
    fallback: normalizedFallback,
    resolve: (match: EditorViewerMatch) => (
      frozenContributions.find((contribution) => contribution.match(match)) ?? normalizedFallback
    ),
  });
}

const PRESET_VIEWER_DEFINITIONS: PresetViewerContribution[] = [
  definePresetViewer({
    id: "app-preview",
    match: ({ document, format }) => document.type === "app" || format.defaultViewer === "app-preview",
    render: (context) => <AppPreviewViewer {...context} />,
  }),
  definePresetViewer({
    id: "markdown",
    match: ({ document, format }) => document.type === "markdown" || format.defaultViewer === "markdown-editor",
    isEditable: () => true,
    load: () => import("./viewers/MarkdownViewer").then(({ MarkdownViewer }) => ({
      default: MarkdownViewer,
    })),
  }),
  definePresetViewer({
    id: "json",
    match: ({ document, format }) => document.type === "json" || format.id === "json" || format.id === "jsonl",
    normalizeContent: formatJson,
    isEditable: () => true,
    render: (context) => <JsonViewer {...context} />,
  }),
  definePresetViewer({
    id: "csv-table",
    match: ({ format }) => format.defaultViewer === "csv-table",
    isEditable: canEditCsv,
    render: (context) => <CsvViewer {...context} />,
  }),
  definePresetViewer({
    id: "html-artifact",
    allowPreviewContent: false,
    match: ({ document, format }) => document.type === "html" || format.defaultViewer === "html-artifact",
    render: (context) => <HtmlViewer {...context} />,
  }),
  definePresetViewer({
    id: "image-preview",
    match: ({ document, format }) => document.type === "image" || format.defaultViewer === "image-preview",
    render: (context) => <ImageResourceViewer {...context} />,
  }),
  definePresetViewer({
    id: "pdf-preview",
    match: ({ document, format }) => document.type === "pdf" || format.defaultViewer === "pdf-preview",
    render: (context) => <PdfResourceViewer {...context} />,
  }),
  definePresetViewer({
    id: "office-preview",
    match: ({ format }) => format.defaultViewer === "office-preview",
    load: () => import("./viewers/OfficeViewer").then(({ OfficeViewer }) => ({
      default: OfficeViewer,
    })),
  }),
  definePresetViewer({
    id: "audio-preview",
    match: ({ document, format }) => document.type === "audio" || format.defaultViewer === "audio-preview",
    render: (context) => <AudioResourceViewer {...context} />,
  }),
  definePresetViewer({
    id: "video-preview",
    match: ({ document, format }) => document.type === "video" || format.defaultViewer === "video-preview",
    render: (context) => <VideoResourceViewer {...context} />,
  }),
  definePresetViewer({
    id: "text",
    match: ({ document, format }) => (
      document.type === "code" ||
      document.type === "text" ||
      format.defaultViewer === "plain-text" ||
      format.defaultViewer === "monaco-code"
    ),
    isEditable: canEditTextFile,
    render: (context) => <TextFileViewer {...context} />,
  }),
];

const FALLBACK_VIEWER = definePresetViewer({
  id: "document-placeholder",
  match: () => true,
  render: (context) => <FallbackDocumentPreview {...context} />,
});

function FallbackDocumentPreview({ document, content }: Parameters<NonNullable<PresetViewerImplementation["render"]>>[0]) {
  const { t } = useLocalization();
  return <DocumentPreview document={document} title={content || t("editor.preview.binaryFile")} />;
}

export const PRESET_VIEWER_REGISTRY = assertCompletePresetViewerRegistry(
  createPresetViewerRegistry(PRESET_VIEWER_DEFINITIONS, FALLBACK_VIEWER),
);
export const PRESET_VIEWERS = PRESET_VIEWER_REGISTRY.contributions;

/** @deprecated Prefer PRESET_VIEWERS; retained for downstream compatibility. */
export const EDITOR_VIEWERS = PRESET_VIEWERS;

function assertCompletePresetViewerRegistry(
  registry: PresetViewerRegistry,
): PresetViewerRegistry {
  const registeredIds = new Set([
    ...registry.contributions.map(({ id }) => id),
    registry.fallback.id,
  ]);
  const missing = PRESET_VIEWER_MANIFEST.viewers
    .map(({ id }) => id)
    .filter((id) => !registeredIds.has(id));
  if (missing.length > 0) {
    throw new TypeError(`Preset viewer manifest has no implementation for: ${missing.join(", ")}.`);
  }
  if (registeredIds.size !== PRESET_VIEWER_MANIFEST.viewers.length) {
    throw new TypeError("Preset viewer registry contains an implementation outside the canonical manifest.");
  }
  return registry;
}

export function resolveEditorViewer(document: EditorDocument): {
  viewer: PresetViewerContribution;
  format: EditorViewerMatch["format"];
  resolvedExtension: string | null;
} {
  const format = resolveFileFormat({ name: document.name, mimeType: document.mimeType });
  const resolvedExtension = getResolvedFileExtension(
    { name: document.name, mimeType: document.mimeType },
    format,
  );
  const match = { document, format, resolvedExtension };
  return {
    viewer: PRESET_VIEWER_REGISTRY.resolve(match),
    format,
    resolvedExtension,
  };
}

export function getEditorSourceRequirement(input: {
  name: string;
  type?: string | null;
  mimeType?: string | null;
}): EditorSourceRequirement {
  const { viewer } = resolveEditorViewer({
    path: input.name,
    name: input.name,
    type: input.type ?? "file",
    mimeType: input.mimeType ?? null,
  });
  return viewer.source;
}

export function shouldReadEditorContent(input: {
  name: string;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  const requirement = getEditorSourceRequirement(input);
  return requirement === "content" || requirement === "content-and-resource";
}

/**
 * Capability classification (`edit` | `preview` | `placeholder`) for the
 * viewer that would resolve for a document. Placeholder-grade documents are
 * the plugin-eligible surface.
 */
export function classifyEditorViewerCapability(document: EditorDocument): CoreViewerCapability {
  const { viewer } = resolveEditorViewer(document);
  return viewer.capability;
}
