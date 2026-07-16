"use client";

import { useEffect, useState } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { preloadPresetViewer, PresetViewerRenderer } from "./PresetViewerRenderer";
import { resolveEditorViewer } from "./viewerRegistry";
import {
  ExternalViewerAdapter,
  resolveViewerRouteForDocument,
} from "./viewerPackAdapter";
import type {
  EditorDocument,
  EditorInteractionPreferences,
  EditorSaveMode,
  MarkdownAssetUrlResolver,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
} from "./viewerTypes";
import { DEFAULT_EDITOR_INTERACTION_PREFERENCES } from "./viewerTypes";
import type {
  ExternalViewerSurfaceRenderer,
  ViewerExtensionHostAdapter,
} from "./viewerHostAdapters";
import type { ViewerContribution } from "./viewerPackTypes";
import type {
  AppPreviewController,
  DocumentPersistencePort,
  OfficeDocumentConverter,
} from "../core/types";
import type { FileIconThemeId } from "../file/fileIcons";
import type { AiEditFile } from "./ai-edits/types";
import { DocumentSessionBoundary } from "./document-session/DocumentSessionBoundary";
import type { DocumentPersistedCommit } from "./document-session/types";

export type { EditorDocument, EditorDocumentKind, EditorSaveMode, MarkdownHtmlTrustMode } from "./viewerTypes";

export type PuppyoneEditorHostProps = {
  document: EditorDocument;
  loading?: boolean;
  error?: string | null;
  fileUrlLoading?: boolean;
  fileUrlError?: string | null;
  documentPersistence?: DocumentPersistencePort | null;
  onDocumentPersisted?: (commit: DocumentPersistedCommit) => void;
  aiEditFile?: AiEditFile | null;
  hideSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
  editorInteractionPreferences?: EditorInteractionPreferences;
  saveMode?: EditorSaveMode;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  /**
   * Optional host composition port for external viewer extensions. The entire
   * port is absent in the default preset-only product profile.
   */
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
};

export function PuppyoneEditorHost({
  document,
  loading = false,
  error = null,
  fileUrlLoading = false,
  fileUrlError = null,
  documentPersistence = null,
  onDocumentPersisted,
  aiEditFile = null,
  hideSourceView = false,
  fileIconTheme = "default",
  editorInteractionPreferences = DEFAULT_EDITOR_INTERACTION_PREFERENCES,
  saveMode = "manual",
  htmlTrustMode = "safe",
  workspaceId = "",
  workspaceRoot = null,
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  appPreview = null,
  openExternalFile,
  convertOfficeDocumentToDocx,
  viewerExtensionAdapter = null,
}: PuppyoneEditorHostProps) {
  const { t } = useLocalization();
  const { viewer, format, resolvedExtension } = resolveEditorViewer(document);
  const preloadWhileReading = Boolean(
    !viewerExtensionAdapter
    && loading
    && !document.content
    && !document.preview,
  );
  useEffect(() => {
    if (!preloadWhileReading) return;
    // Begin route-code acquisition while the cancellable file read is in
    // flight, rather than serializing the first viewer download after I/O.
    void preloadPresetViewer(viewer).catch(() => undefined);
  }, [preloadWhileReading, viewer]);

  // Placeholder-grade documents are the plugin-eligible surface. Route them
  // deterministically (§5.1); only a local doc with exactly one (or a chosen)
  // enabled pack activates. The main process is still the sole authority — this
  // only decides which host-provided surface slot to render.
  if (viewerExtensionAdapter) {
    const route = resolveViewerRouteForDocument(document, viewerExtensionAdapter.snapshot);
    if (viewerExtensionAdapter.renderSurface && route.kind === "plugin") {
      return (
        <ExternalViewerAdapter
          document={document}
          contribution={route.contribution}
          renderSurface={viewerExtensionAdapter.renderSurface}
        />
      );
    }
    if (viewerExtensionAdapter.renderSurface && route.kind === "chooser") {
      return (
        <ExternalViewerChooser
          document={document}
          candidates={route.candidates}
          renderSurface={viewerExtensionAdapter.renderSurface}
        />
      );
    }
    if (
      viewerExtensionAdapter.renderInstallFallback &&
      route.kind === "unsupported" &&
      route.reason === "no-match" &&
      document.sourceKind === "local"
    ) {
      return <>{viewerExtensionAdapter.renderInstallFallback({ document })}</>;
    }
  }

  const rawContent = viewer.allowPreviewContent === false
    ? document.content ?? ""
    : document.content ?? document.preview ?? "";
  const content = viewer.normalizeContent?.(rawContent, document) ?? rawContent;
  const canEdit = Boolean(
    documentPersistence
    && viewer.isEditable?.({ document, format, resolvedExtension, content }),
  );

  if (viewer.source !== "resource" && loading && !content) {
    return <div className="editor-state">{t("editor.loadingFile")}</div>;
  }

  if (viewer.source !== "resource" && error && !content) {
    return (
      <EditorUnavailableState
        title={t("editor.unavailable.title")}
        message={error}
        documentPath={document.path}
        openExternalFile={openExternalFile}
        openLabel={t("editor.openDefaultApp")}
      />
    );
  }

  const presetViewer = (
    <PresetViewerRenderer
      viewer={viewer}
      context={{
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
        editorInteractionPreferences,
        htmlTrustMode,
        workspaceId,
        workspaceRoot,
        markdownLinkGraph,
        markdownAssetUrlResolver,
        appPreview,
        openExternalFile,
        convertOfficeDocumentToDocx,
      }}
    />
  );

  if (canEdit && documentPersistence) {
    return (
      <DocumentSessionBoundary
        documentId={document.path}
        initialContent={content}
        initialVersion={document.version}
        saveMode={saveMode}
        persistence={documentPersistence}
        onPersisted={onDocumentPersisted}
        showSaveStatus={editorInteractionPreferences.showSaveStatus}
      >
        {presetViewer}
      </DocumentSessionBoundary>
    );
  }

  return presetViewer;
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
  const { t } = useLocalization();
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
      <strong>{t("editor.viewer.chooseFor", { name: bidiIsolate(document.name) })}</strong>
      <ul>
        {candidates.map((candidate) => (
          <li key={`${candidate.pluginId}@${candidate.version}`}>
            <button type="button" onClick={() => setSelected(candidate)}>
              <span dir="auto">{candidate.label}</span>
              <span dir="auto">{candidate.publisher} · v{candidate.version}</span>
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
  openLabel,
}: {
  title: string;
  message: string;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
  openLabel: string;
}) {
  return (
    <div className="editor-state editor-state--stacked danger">
      <strong>{title}</strong>
      <span dir="auto">{message}</span>
      {openExternalFile && (
        <button type="button" onClick={() => void openExternalFile(documentPath)}>
          {openLabel}
        </button>
      )}
    </div>
  );
}
