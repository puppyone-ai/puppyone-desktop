"use client";

import { normalizeDocumentSourceKind } from "./documentSource";
import { resolveViewerRoute } from "./viewerCapability";
import type { ExternalViewerSurfaceRenderer } from "./viewerHostAdapters";
import {
  EMPTY_VIEWER_PACK_SNAPSHOT,
  type ViewerContribution,
  type ViewerPackSnapshot,
  type ViewerRouteResult,
} from "./viewerPackTypes";
import { resolveEditorViewer } from "./viewerRegistry";
import type { EditorDocument } from "./viewerTypes";

/**
 * Renderer-side route preview for the optional Viewer Pack adapter. The main
 * process repeats the policy before activation and remains authoritative.
 */
export function resolveViewerRouteForDocument(
  document: EditorDocument,
  snapshot: ViewerPackSnapshot | null | undefined = EMPTY_VIEWER_PACK_SNAPSHOT,
): ViewerRouteResult {
  const { viewer, resolvedExtension } = resolveEditorViewer(document);
  const extensions = candidateExtensions(document.name);
  if (resolvedExtension) extensions.push(`.${resolvedExtension}`);

  return resolveViewerRoute({
    coreViewerId: viewer.id,
    coreViewerCapability: viewer.capability,
    extensions,
    mimeTypes: document.mimeType ? [document.mimeType] : [],
    snapshot: snapshot ?? EMPTY_VIEWER_PACK_SNAPSHOT,
    sourceKind: normalizeDocumentSourceKind(document.sourceKind),
  });
}

export type ExternalViewerAdapterProps = {
  document: EditorDocument;
  contribution: ViewerContribution;
  /** Host-owned renderer for the sandboxed/native extension surface. */
  renderSurface?: ExternalViewerSurfaceRenderer | null;
};

/**
 * Pure composition adapter: it never imports Electron, opens resources, or
 * executes extension code inside the application renderer.
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

function candidateExtensions(name: string): string[] {
  const base = name.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const extensions: string[] = [];
  for (let index = base.indexOf("."); index >= 0; index = base.indexOf(".", index + 1)) {
    if (index < base.length - 1) extensions.push(base.slice(index));
  }
  return [...new Set(extensions)].sort((left, right) => right.length - left.length);
}
