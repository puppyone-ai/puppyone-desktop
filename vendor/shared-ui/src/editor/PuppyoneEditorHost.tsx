"use client";

import { useState } from "react";
import {
  ExternalViewerAdapter,
  resolveEditorViewer,
  resolveViewerRouteForDocument,
} from "./viewerRegistry";
import type {
  EditorDocument,
  EditorSaveMode,
  ExternalViewerSurfaceRenderer,
  MarkdownAssetUrlResolver,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
} from "./viewerTypes";
import type { ViewerContribution, ViewerPackSnapshot } from "./viewerPackTypes";
import type { AppPreviewController, OfficeDocumentConverter } from "../core/types";
import type { FileIconThemeId } from "../file/fileIcons";
import type { AiEditFile } from "./ai-edits/types";
import type { ReactNode } from "react";

export type { EditorDocument, EditorDocumentKind, EditorSaveMode, MarkdownHtmlTrustMode } from "./viewerTypes";

export type ViewerPackInstallFallbackRenderer = (request: {
  document: EditorDocument;
}) => ReactNode;

export type PuppyoneEditorHostProps = {
  document: EditorDocument;
  loading?: boolean;
  error?: string | null;
  fileUrlLoading?: boolean;
  fileUrlError?: string | null;
  onSaveContent?: (content: string) => Promise<void>;
  aiEditFile?: AiEditFile | null;
  hideSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
  saveMode?: EditorSaveMode;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  viewerPackSnapshot?: ViewerPackSnapshot | null;
  externalViewerSurface?: ExternalViewerSurfaceRenderer | null;
  /**
   * Host-provided install CTA for placeholder-grade local documents with no
   * matching enabled pack. Catalog is disabled by default; this is the Stage B1
   * local-install path. Shared-ui never picks files or talks to Electron.
   */
  viewerPackInstallFallback?: ViewerPackInstallFallbackRenderer | null;
};

export function PuppyoneEditorHost({
  document,
  loading = false,
  error = null,
  fileUrlLoading = false,
  fileUrlError = null,
  onSaveContent,
  aiEditFile = null,
  hideSourceView = false,
  fileIconTheme = "default",
  saveMode = "manual",
  htmlTrustMode = "safe",
  workspaceId = "",
  workspaceRoot = null,
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  appPreview = null,
  openExternalFile,
  convertOfficeDocumentToDocx,
  viewerPackSnapshot = null,
  externalViewerSurface = null,
  viewerPackInstallFallback = null,
}: PuppyoneEditorHostProps) {
  const { viewer, format, resolvedExtension } = resolveEditorViewer(document);

  // Placeholder-grade documents are the plugin-eligible surface. Route them
  // deterministically (§5.1); only a local doc with exactly one (or a chosen)
  // enabled pack activates. The main process is still the sole authority — this
  // only decides which host-provided surface slot to render.
  if (externalViewerSurface || viewerPackInstallFallback) {
    const route = resolveViewerRouteForDocument(document, viewerPackSnapshot);
    if (externalViewerSurface && route.kind === "plugin") {
      return (
        <ExternalViewerAdapter
          document={document}
          contribution={route.contribution}
          renderSurface={externalViewerSurface}
        />
      );
    }
    if (externalViewerSurface && route.kind === "chooser") {
      return (
        <ExternalViewerChooser
          document={document}
          candidates={route.candidates}
          renderSurface={externalViewerSurface}
        />
      );
    }
    if (
      viewerPackInstallFallback &&
      route.kind === "unsupported" &&
      route.reason === "no-match" &&
      document.sourceKind !== "cloud" &&
      document.sourceKind !== "unknown"
    ) {
      return <>{viewerPackInstallFallback({ document })}</>;
    }
  }

  const rawContent = viewer.allowPreviewContent === false
    ? document.content ?? ""
    : document.content ?? document.preview ?? "";
  const content = viewer.normalizeContent?.(rawContent, document) ?? rawContent;
  const canEdit = Boolean(onSaveContent && viewer.isEditable?.({ document, format, resolvedExtension, content }));

  if (viewer.source !== "resource" && loading && !content) {
    return <div className="editor-state">Loading file...</div>;
  }

  if (viewer.source !== "resource" && error && !content) {
    return (
      <EditorUnavailableState
        title="Cannot open in editor"
        message={error}
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <>
      {viewer.render({
        document,
        format,
        resolvedExtension,
        content,
        aiEditFile,
        fileUrl: document.url,
        fileUrlLoading,
        fileUrlError,
        loading,
        error,
        canEdit,
        hideSourceView,
        fileIconTheme,
        saveMode,
        htmlTrustMode,
        workspaceId,
        workspaceRoot,
        markdownLinkGraph,
        markdownAssetUrlResolver,
        appPreview,
        openExternalFile,
        convertOfficeDocumentToDocx,
        onSaveContent,
        viewerPackSnapshot,
        externalViewerSurface,
      })}
    </>
  );
}

function ExternalViewerChooser({
  document,
  candidates,
  renderSurface,
}: {
  document: EditorDocument;
  candidates: readonly ViewerContribution[];
  renderSurface: ExternalViewerSurfaceRenderer;
}) {
  const [selected, setSelected] = useState<ViewerContribution | null>(null);

  if (selected) {
    return (
      <ExternalViewerAdapter
        document={document}
        contribution={selected}
        renderSurface={renderSurface}
      />
    );
  }

  return (
    <div className="external-viewer-chooser">
      <strong>Choose a viewer for {document.name}</strong>
      <ul>
        {candidates.map((candidate) => (
          <li key={`${candidate.pluginId}@${candidate.version}`}>
            <button type="button" onClick={() => setSelected(candidate)}>
              {candidate.label}
              <span>{candidate.publisher} · v{candidate.version}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditorUnavailableState({
  title,
  message,
  documentPath,
  openExternalFile,
}: {
  title: string;
  message: string;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
}) {
  return (
    <div className="editor-state editor-state--stacked danger">
      <strong>{title}</strong>
      <span>{message}</span>
      {openExternalFile && (
        <button type="button" onClick={() => void openExternalFile(documentPath)}>
          Open in default app
        </button>
      )}
    </div>
  );
}
