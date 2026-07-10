"use client";

import { getResolvedFileExtension, resolveFileFormat } from "../core/fileFormats";
import type {
  EditorDocument,
  EditorSourceRequirement,
  EditorViewer,
  EditorViewerMatch,
  ExternalViewerSurfaceRenderer,
} from "./viewerTypes";
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

export const EDITOR_VIEWERS: EditorViewer[] = [
  {
    id: "app-preview",
    source: "content",
    match: ({ document, format }) => document.type === "app" || format.defaultViewer === "app-preview",
    render: (context) => <AppPreviewViewer {...context} />,
  },
  {
    id: "markdown",
    source: "content",
    match: ({ document, format }) => document.type === "markdown" || format.defaultViewer === "markdown-editor",
    isEditable: canEditMarkdown,
    render: (context) => <MarkdownViewer {...context} />,
  },
  {
    id: "json",
    source: "content",
    match: ({ document, format }) => document.type === "json" || format.id === "json" || format.id === "jsonl",
    normalizeContent: formatJson,
    isEditable: () => true,
    render: (context) => <JsonViewer {...context} />,
  },
  {
    id: "csv-table",
    source: "content",
    match: ({ format }) => format.defaultViewer === "csv-table",
    isEditable: canEditCsv,
    render: (context) => <CsvViewer {...context} />,
  },
  {
    id: "html-artifact",
    source: "content-and-resource",
    allowPreviewContent: false,
    match: ({ document, format }) => document.type === "html" || format.defaultViewer === "html-artifact",
    render: (context) => <HtmlViewer {...context} />,
  },
  {
    id: "image-preview",
    source: "resource",
    match: ({ document, format }) => document.type === "image" || format.defaultViewer === "image-preview",
    render: (context) => <ImageResourceViewer {...context} />,
  },
  {
    id: "pdf-preview",
    source: "resource",
    match: ({ document, format }) => document.type === "pdf" || format.defaultViewer === "pdf-preview",
    render: (context) => <PdfResourceViewer {...context} />,
  },
  {
    id: "office-preview",
    source: "resource",
    match: ({ format }) => format.defaultViewer === "office-preview",
    render: (context) => <OfficeViewer {...context} />,
  },
  {
    id: "audio-preview",
    source: "resource",
    match: ({ document, format }) => document.type === "audio" || format.defaultViewer === "audio-preview",
    render: (context) => <AudioResourceViewer {...context} />,
  },
  {
    id: "video-preview",
    source: "resource",
    match: ({ document, format }) => document.type === "video" || format.defaultViewer === "video-preview",
    render: (context) => <VideoResourceViewer {...context} />,
  },
  {
    id: "text",
    source: "content",
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

const FALLBACK_VIEWER: EditorViewer = {
  id: "document-placeholder",
  source: "none",
  match: () => true,
  render: ({ document, content }) => (
    <DocumentPreview document={document} title={content || "Binary file"} />
  ),
};

export function resolveEditorViewer(document: EditorDocument): {
  viewer: EditorViewer;
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
    viewer: EDITOR_VIEWERS.find((viewer) => viewer.match(match)) ?? FALLBACK_VIEWER,
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
  return coreViewerCapability(viewer.id);
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
  const { viewer, format, resolvedExtension } = resolveEditorViewer(document);
  const extensions: string[] = [];
  if (resolvedExtension) extensions.push(`.${resolvedExtension}`);
  for (const extension of format.extensions ?? []) extensions.push(extension);

  const mimeTypes: string[] = [];
  if (document.mimeType) mimeTypes.push(document.mimeType);
  for (const mimeType of format.mimeTypes ?? []) mimeTypes.push(mimeType);

  return resolveViewerRoute({
    coreViewerId: viewer.id,
    extensions,
    mimeTypes,
    snapshot: snapshot ?? EMPTY_VIEWER_PACK_SNAPSHOT,
    sourceKind: normalizeDocumentSourceKind(document.sourceKind),
  });
}

function normalizeDocumentSourceKind(sourceKind: DocumentSourceKind | undefined): DocumentSourceKind {
  return sourceKind === "cloud" || sourceKind === "unknown" ? sourceKind : "local";
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
