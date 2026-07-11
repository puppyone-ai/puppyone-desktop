"use client";

import { getResolvedFileExtension, resolveFileFormat } from "../core/fileFormats";
import type {
  EditorDocument,
  EditorSourceRequirement,
  EditorViewerMatch,
  ExternalViewerSurfaceRenderer,
  PresetViewerContribution,
} from "./viewerTypes";
import {
  PRESET_VIEWER_CAPABILITIES,
  PRESET_VIEWER_CONTRACT_VERSION,
  PRESET_VIEWER_RUNTIMES,
  PRESET_VIEWER_SOURCES,
} from "./viewerContract";
import { coreViewerCapability, resolveViewerRoute } from "./viewerCapability";
import type {
  CoreViewerCapability,
  DocumentSourceKind,
  ViewerContribution,
  ViewerPackSnapshot,
  ViewerRouteResult,
} from "./viewerPackTypes";
import { EMPTY_VIEWER_PACK_SNAPSHOT } from "./viewerPackTypes";
import { AppPreviewViewer } from "./viewers/AppPreviewViewer";
import { JsonViewer, TextFileViewer, canEditTextFile } from "./viewers/CodeViewer";
import { CsvViewer, canEditCsv } from "./viewers/CsvViewer";
import { DocumentPreview } from "./viewers/DocumentFallbackViewer";
import { HtmlViewer } from "./viewers/HtmlViewer";
import { MarkdownViewer, canEditMarkdown } from "./viewers/MarkdownViewer";
import { OfficeViewer } from "./viewers/OfficeViewer";
import {
  AudioResourceViewer,
  ImageResourceViewer,
  PdfResourceViewer,
  VideoResourceViewer,
} from "./viewers/ResourceViewers";
import { formatJson } from "./viewers/viewerUtils";

const PRESET_VIEWER_CONTRACT_KEYS = new Set([
  "contractVersion",
  "id",
  "capability",
  "source",
  "runtime",
  "match",
  "allowPreviewContent",
  "normalizeContent",
  "isEditable",
  "render",
]);

const OPTIONAL_FUNCTION_KEYS = ["normalizeContent", "isEditable"] as const;

/**
 * Runtime validation complements TypeScript's excess-property checks. It is
 * intentionally small and strict so a contribution loaded through an adapter
 * cannot silently acquire host authority through an unknown field.
 */
export function definePresetViewer(
  contribution: PresetViewerContribution,
): PresetViewerContribution {
  const record = contribution as unknown as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !PRESET_VIEWER_CONTRACT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`Preset viewer ${String(record.id ?? "<unknown>")} has unknown field(s): ${unknownKeys.join(", ")}.`);
  }
  if (record.contractVersion !== PRESET_VIEWER_CONTRACT_VERSION) {
    throw new TypeError(`Preset viewer ${String(record.id ?? "<unknown>")} uses an unsupported contract version.`);
  }
  if (typeof record.id !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(record.id)) {
    throw new TypeError("Preset viewer id must be a stable lowercase kebab-case identifier.");
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
  if (typeof record.match !== "function" || typeof record.render !== "function") {
    throw new TypeError(`Preset viewer ${record.id} must define match and render functions.`);
  }
  if (record.allowPreviewContent !== undefined && typeof record.allowPreviewContent !== "boolean") {
    throw new TypeError(`Preset viewer ${record.id} has an invalid allowPreviewContent value.`);
  }
  for (const key of OPTIONAL_FUNCTION_KEYS) {
    if (record[key] !== undefined && typeof record[key] !== "function") {
      throw new TypeError(`Preset viewer ${record.id} has an invalid ${key} function.`);
    }
  }
  return Object.freeze({ ...contribution });
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
  const normalized = contributions.map(definePresetViewer);
  const normalizedFallback = definePresetViewer(fallback);
  const ids = new Set<string>();
  for (const contribution of [...normalized, normalizedFallback]) {
    if (ids.has(contribution.id)) {
      throw new TypeError(`Preset viewer id ${contribution.id} is registered more than once.`);
    }
    ids.add(contribution.id);
  }
  if (normalizedFallback.capability !== "placeholder" || normalizedFallback.source !== "none") {
    throw new TypeError("The preset viewer fallback must be a placeholder with source 'none'.");
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
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "app-preview",
    capability: "preview",
    source: "content",
    runtime: "eager",
    match: ({ document, format }) => document.type === "app" || format.defaultViewer === "app-preview",
    render: (context) => <AppPreviewViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "markdown",
    capability: "edit",
    source: "content",
    runtime: "lazy",
    match: ({ document, format }) => document.type === "markdown" || format.defaultViewer === "markdown-editor",
    isEditable: canEditMarkdown,
    render: (context) => <MarkdownViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "json",
    capability: "edit",
    source: "content",
    runtime: "eager",
    match: ({ document, format }) => document.type === "json" || format.id === "json" || format.id === "jsonl",
    normalizeContent: formatJson,
    isEditable: () => true,
    render: (context) => <JsonViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "csv-table",
    capability: "edit",
    source: "content",
    runtime: "eager",
    match: ({ format }) => format.defaultViewer === "csv-table",
    isEditable: canEditCsv,
    render: (context) => <CsvViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "html-artifact",
    capability: "preview",
    source: "content-and-resource",
    runtime: "eager",
    allowPreviewContent: false,
    match: ({ document, format }) => document.type === "html" || format.defaultViewer === "html-artifact",
    render: (context) => <HtmlViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "image-preview",
    capability: "preview",
    source: "resource",
    runtime: "eager",
    match: ({ document, format }) => document.type === "image" || format.defaultViewer === "image-preview",
    render: (context) => <ImageResourceViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "pdf-preview",
    capability: "preview",
    source: "resource",
    runtime: "eager",
    match: ({ document, format }) => document.type === "pdf" || format.defaultViewer === "pdf-preview",
    render: (context) => <PdfResourceViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "office-preview",
    capability: "preview",
    source: "resource",
    runtime: "lazy",
    match: ({ format }) => format.defaultViewer === "office-preview",
    render: (context) => <OfficeViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "audio-preview",
    capability: "preview",
    source: "resource",
    runtime: "eager",
    match: ({ document, format }) => document.type === "audio" || format.defaultViewer === "audio-preview",
    render: (context) => <AudioResourceViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "video-preview",
    capability: "preview",
    source: "resource",
    runtime: "eager",
    match: ({ document, format }) => document.type === "video" || format.defaultViewer === "video-preview",
    render: (context) => <VideoResourceViewer {...context} />,
  },
  {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id: "text",
    capability: "edit",
    source: "content",
    runtime: "eager",
    match: ({ document, format }) => (
      document.type === "code" ||
      document.type === "text" ||
      format.defaultViewer === "plain-text" ||
      format.defaultViewer === "monaco-code"
    ),
    isEditable: canEditTextFile,
    render: (context) => <TextFileViewer {...context} />,
  },
];

const FALLBACK_VIEWER: PresetViewerContribution = {
  contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
  id: "document-placeholder",
  capability: "placeholder",
  source: "none",
  runtime: "eager",
  match: () => true,
  render: ({ document, content }) => (
    <DocumentPreview document={document} title={content || "Binary file"} />
  ),
};

export const PRESET_VIEWER_REGISTRY = createPresetViewerRegistry(
  PRESET_VIEWER_DEFINITIONS,
  FALLBACK_VIEWER,
);
export const PRESET_VIEWERS = PRESET_VIEWER_REGISTRY.contributions;

/** @deprecated Prefer PRESET_VIEWERS; retained for downstream compatibility. */
export const EDITOR_VIEWERS = PRESET_VIEWERS;

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

export { coreViewerCapability, resolveViewerRoute } from "./viewerCapability";

/**
 * Capability classification (`edit` | `preview` | `placeholder`) for the
 * viewer that would resolve for a document. Placeholder-grade documents are
 * the plugin-eligible surface.
 */
export function classifyEditorViewerCapability(document: EditorDocument): CoreViewerCapability {
  const { viewer } = resolveEditorViewer(document);
  return viewer.capability;
}

/**
 * Deterministic route for a document against an immutable pack snapshot. This
 * is the renderer-side mirror of the authoritative main-process router; the
 * main process remains the sole authority for activation.
 */
export function resolveViewerRouteForDocument(
  document: EditorDocument,
  snapshot: ViewerPackSnapshot | null | undefined = EMPTY_VIEWER_PACK_SNAPSHOT,
): ViewerRouteResult {
  const { viewer, resolvedExtension } = resolveEditorViewer(document);
  const extensions = candidateExtensions(document.name);
  if (resolvedExtension) extensions.push(`.${resolvedExtension}`);

  const mimeTypes: string[] = [];
  if (document.mimeType) mimeTypes.push(document.mimeType);

  return resolveViewerRoute({
    coreViewerId: viewer.id,
    coreViewerCapability: viewer.capability,
    extensions,
    mimeTypes,
    snapshot: snapshot ?? EMPTY_VIEWER_PACK_SNAPSHOT,
    sourceKind: normalizeDocumentSourceKind(document.sourceKind),
  });
}

function candidateExtensions(name: string): string[] {
  const base = name.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const extensions: string[] = [];
  for (let index = base.indexOf("."); index >= 0; index = base.indexOf(".", index + 1)) {
    if (index < base.length - 1) extensions.push(base.slice(index));
  }
  return [...new Set(extensions)].sort((left, right) => right.length - left.length);
}

function normalizeDocumentSourceKind(sourceKind: DocumentSourceKind | undefined): DocumentSourceKind {
  return sourceKind === "local" || sourceKind === "cloud" ? sourceKind : "unknown";
}

export type ExternalViewerAdapterProps = {
  document: EditorDocument;
  contribution: ViewerContribution;
  /**
   * Host-provided renderer for the sandboxed/native surface. When absent the
   * adapter renders an inert notice instead of attempting to run plugin code
   * (shared-ui never executes packs or touches Electron).
   */
  renderSurface?: ExternalViewerSurfaceRenderer | null;
};

/**
 * Renders the host-provided surface slot for an activated pack. This component
 * is pure dependency injection: it forwards to `renderSurface` and never spawns
 * a session, imports Electron, or executes plugin code.
 */
export function ExternalViewerAdapter({
  document,
  contribution,
  renderSurface,
}: ExternalViewerAdapterProps) {
  if (!renderSurface) {
    return (
      <div className="external-viewer-adapter external-viewer-adapter-unavailable">
        <strong>{contribution.label}</strong>
        <span>This viewer pack cannot render here — no host surface is available.</span>
      </div>
    );
  }

  return (
    <div className="external-viewer-adapter" data-plugin-id={contribution.pluginId}>
      {renderSurface({ document, contribution })}
    </div>
  );
}
