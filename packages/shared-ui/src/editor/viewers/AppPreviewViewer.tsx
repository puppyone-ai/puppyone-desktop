"use client";

import {
  ArrowLeft,
  ArrowRight,
  Code2,
  ExternalLink,
  Eye,
  RefreshCw,
  RotateCw,
  Settings2,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  getAppPreviewManifestDisplayName,
  parseAppPreviewManifest,
} from "../../../../../shared/appPreviewManifest.js";
import { PlainTextEditor } from "../PlainTextEditor";
import type { PresetViewerRenderContext } from "../viewerTypes";
import { AppPreviewSetupView } from "./app-preview/AppPreviewSetupView";
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
  const [manifestContent, setManifestContent] = useState(content);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setManifestContent(content);
    setMode("preview");
  }, [content, document.path]);

  const manifestState = useMemo(() => {
    try {
      return { manifest: parseAppPreviewManifest(manifestContent, { appPath: document.path }), error: null };
    } catch (reason) {
      return { manifest: null, error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [document.path, manifestContent]);
  const appName = manifestState.manifest?.name ?? getAppPreviewManifestDisplayName(manifestContent, document.path);
  const configured = Boolean(manifestState.manifest?.launch);
  const session = useAppPreviewSession({
    appPreview,
    path: document.path,
    mode,
    hostRef,
    enabled: configured,
  });

  if (loading && !manifestContent) return <div className="editor-state">{t("editor.app.loading")}</div>;
  if (error && !manifestContent) return <div className="editor-state danger" dir="auto">{error}</div>;

  const { state } = session;
  const runningUrl = state.runtime?.status === "running" ? state.runtime.url : null;
  const statusLabel = manifestState.error
    ? t("editor.app.status.needsAttention")
    : !configured
      ? t("editor.app.status.notConfigured")
      : state.status === "error"
        ? t("editor.app.status.needsAttention")
        : t(`editor.app.status.${state.status}`);
  const status = manifestState.error || state.status === "error"
    ? "error"
    : configured ? state.status : "idle";
  const browserControlsEnabled = mode === "preview" && Boolean(state.surface?.surfaceId);

  return (
    <section className="app-preview-shell" data-mode={mode}>
      <header className="app-preview-header">
        <div className="app-preview-title">
          <strong dir="auto">{appName}</strong>
          <span data-status={status}>{statusLabel}</span>
        </div>

        <div className="app-preview-toolbar" aria-label={t("editor.app.controls")}>
          <ToolbarButton active={mode === "preview"} label={t("editor.app.preview")} onClick={() => setMode("preview")}>
            <Eye size={14} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={mode === "source"} label={t("editor.app.manifestSource")} onClick={() => setMode("source")}>
            <Code2 size={14} strokeWidth={2} />
          </ToolbarButton>
          {configured ? (
            <>
              <ToolbarButton active={mode === "logs"} label={t("editor.app.runtimeLogs")} onClick={() => setMode("logs")}>
                <TerminalSquare size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton active={mode === "settings"} label={t("editor.app.setup.settingsTitle")} onClick={() => setMode("settings")}>
                <Settings2 size={14} strokeWidth={2} />
              </ToolbarButton>
            </>
          ) : null}
          {configured && mode === "preview" ? (
            <>
              <span className="app-preview-toolbar-separator" aria-hidden="true" />
              <ToolbarButton label={t("editor.app.back")} disabled={!browserControlsEnabled || !state.surface?.canGoBack} onClick={() => session.runSurfaceCommand("back")}>
                <ArrowLeft size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton label={t("editor.app.forward")} disabled={!browserControlsEnabled || !state.surface?.canGoForward} onClick={() => session.runSurfaceCommand("forward")}>
                <ArrowRight size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton label={t("editor.app.reload")} disabled={!browserControlsEnabled} onClick={() => session.runSurfaceCommand("reload")}>
                <RefreshCw size={14} strokeWidth={2} />
              </ToolbarButton>
              <span className="app-preview-toolbar-separator" aria-hidden="true" />
              <ToolbarButton label={t("editor.app.restart")} disabled={!appPreview?.restart || state.status === "starting"} onClick={() => session.restart()}>
                <RotateCw size={14} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton label={t("editor.app.stop")} disabled={!appPreview?.stop || (state.status !== "running" && state.status !== "starting")} onClick={() => void session.stop()}>
                <Square size={13} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton label={t("editor.app.openBrowser")} disabled={!appPreview?.openExternal || !runningUrl} onClick={() => void appPreview?.openExternal?.(document.path)}>
                <ExternalLink size={14} strokeWidth={2} />
              </ToolbarButton>
            </>
          ) : null}
        </div>
      </header>

      <div className="app-preview-body">
        {mode === "source" ? (
          <div className="app-preview-source">
            <PlainTextEditor content={manifestContent} nodeName={document.name} readOnly />
          </div>
        ) : manifestState.error ? (
          <div className="app-preview-invalid">
            <strong>{t("editor.app.setup.invalidTitle")}</strong>
            <span>{t("editor.app.setup.invalidDetail")}</span>
            <code>{sanitizeDiagnostic(manifestState.error)}</code>
            <button type="button" onClick={() => setMode("source")}>{t("editor.app.setup.viewSource")}</button>
          </div>
        ) : !configured ? (
          <AppPreviewSetupView
            appName={appName}
            appPath={document.path}
            content={manifestContent}
            controller={appPreview}
            onConfigured={(nextContent) => {
              setManifestContent(nextContent);
              setMode("preview");
            }}
          />
        ) : mode === "settings" ? (
          <AppPreviewSetupView
            settings
            appName={appName}
            appPath={document.path}
            content={manifestContent}
            controller={appPreview}
            onCancel={() => setMode("preview")}
            onConfigured={(nextContent) => {
              setManifestContent(nextContent);
              setMode("preview");
            }}
          />
        ) : mode === "logs" ? (
          <div className="app-preview-logs" role="log" aria-label={t("editor.app.logsLabel")}>
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
                onEditSetup={() => setMode("settings")}
                onViewLogs={() => setMode("logs")}
                onCancel={() => void session.stop()}
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

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/Error invoking remote method[^:]*:\s*/gi, "")
    .replace(/\b(?:ipc|rpc)[\w:-]*\b/gi, "preview service")
    .slice(0, 360);
}
