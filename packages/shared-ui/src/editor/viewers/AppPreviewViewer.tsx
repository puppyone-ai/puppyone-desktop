"use client";

import {
  ArrowLeft,
  ArrowRight,
  Code2,
  ExternalLink,
  Eye,
  RefreshCw,
  RotateCw,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import { getAppPreviewManifestDisplayName } from "../../../../../shared/appPreviewManifest.js";
import { PlainTextEditor } from "../PlainTextEditor";
import type { PresetViewerRenderContext } from "../viewerTypes";
import { AppPreviewStateView } from "./app-preview/AppPreviewStateView";
import type { AppPreviewMode } from "./app-preview/types";
import { useAppPreviewSession } from "./app-preview/useAppPreviewSession";

export function AppPreviewViewer({
  document,
  content,
  loading,
  error,
  appPreview,
}: Pick<
  PresetViewerRenderContext,
  "document" | "content" | "loading" | "error" | "appPreview"
>) {
  const { t } = useLocalization();
  const [mode, setMode] = useState<AppPreviewMode>("preview");
  const hostRef = useRef<HTMLDivElement>(null);
  const appName = useMemo(
    () => getAppPreviewManifestDisplayName(content, document.path),
    [content, document.path],
  );
  const session = useAppPreviewSession({
    appPreview,
    path: document.path,
    mode,
    hostRef,
  });

  if (loading && !content) return <div className="editor-state">{t("editor.app.loading")}</div>;
  if (error && !content) return <div className="editor-state danger" dir="auto">{error}</div>;

  const { state } = session;
  const runningUrl = state.runtime?.status === "running" ? state.runtime.url : null;
  const statusLabel = t(`editor.app.status.${state.status}`);
  const browserControlsEnabled = mode === "preview" && Boolean(state.surface?.surfaceId);

  return (
    <section className="app-preview-shell" data-mode={mode}>
      <header className="app-preview-header">
        <div className="app-preview-title">
          <strong dir="auto">{appName}</strong>
          <span data-status={state.status}>{statusLabel}</span>
        </div>

        <div className="app-preview-toolbar" aria-label={t("editor.app.controls")}>
          <ToolbarButton active={mode === "preview"} label={t("editor.app.preview")} onClick={() => setMode("preview")}>
            <Eye size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={mode === "source"} label={t("editor.app.manifestSource")} onClick={() => setMode("source")}>
            <Code2 size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={mode === "logs"} label={t("editor.app.runtimeLogs")} onClick={() => setMode("logs")}>
            <TerminalSquare size={14} strokeWidth={2} />
          </ToolbarButton>
          <span className="app-preview-toolbar-separator" aria-hidden="true" />
          {session.nativeSurface ? (
            <>
              <ToolbarButton
                label={t("editor.app.back")}
                disabled={!browserControlsEnabled || !state.surface?.canGoBack}
                onClick={() => session.runSurfaceCommand("back")}
              >
                <ArrowLeft size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton
                label={t("editor.app.forward")}
                disabled={!browserControlsEnabled || !state.surface?.canGoForward}
                onClick={() => session.runSurfaceCommand("forward")}
              >
                <ArrowRight size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton
                label={t("editor.app.reload")}
                disabled={!browserControlsEnabled}
                onClick={() => session.runSurfaceCommand("reload")}
              >
                <RefreshCw size={14} strokeWidth={2} />
              </ToolbarButton>
              <span className="app-preview-toolbar-separator" aria-hidden="true" />
            </>
          ) : null}
          <ToolbarButton
            label={t("editor.app.restart")}
            disabled={!appPreview?.restart || state.status === "starting"}
            onClick={() => {
              setMode("preview");
              session.restart();
            }}
          >
            <RotateCw size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t("editor.app.stop")}
            disabled={!appPreview?.stop || (state.status !== "running" && state.status !== "starting")}
            onClick={() => void session.stop()}
          >
            <Square size={13} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label={t("editor.app.openBrowser")}
            disabled={!appPreview?.openExternal || !runningUrl}
            onClick={() => void appPreview?.openExternal?.(document.path)}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </ToolbarButton>
        </div>
      </header>

      <div className="app-preview-body">
        {mode === "source" ? (
          <div className="app-preview-source">
            <PlainTextEditor content={content} nodeName={document.name} readOnly />
          </div>
        ) : mode === "logs" ? (
          <div
            className="app-preview-logs"
            data-po-scrollbar="content"
            role="log"
            aria-label={t("editor.app.logsLabel")}
          >
            <pre dir="ltr">{session.logs || t("editor.app.noLogs")}</pre>
          </div>
        ) : (
          <div ref={hostRef} className="app-preview-surface-host">
            {!session.nativeSurface && runningUrl ? (
              <iframe
                key={runningUrl}
                className="app-preview-frame"
                src={runningUrl}
                title={appName}
                sandbox="allow-forms allow-modals allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
              />
            ) : state.surface?.status === "ready" && state.surface.attached ? null : (
              <AppPreviewStateView
                appName={appName}
                state={state}
                canRun={Boolean(appPreview?.start)}
                onRun={session.run}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ToolbarButton({
  active = false,
  label,
  disabled = false,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={active ? "active" : ""}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
