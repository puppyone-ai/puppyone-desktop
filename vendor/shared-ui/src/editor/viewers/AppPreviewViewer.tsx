"use client";

import { Code2, ExternalLink, Eye, RotateCw, Square, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlainTextEditor } from "../PlainTextEditor";
import type { EditorViewerContext } from "../viewerTypes";
import type { AppPreviewResult } from "../../core/types";

type AppPreviewMode = "preview" | "source" | "logs";

type AppPreviewState =
  | { status: "idle"; result: null; error: null }
  | { status: "starting"; result: AppPreviewResult | null; error: null }
  | { status: "running"; result: AppPreviewResult; error: null }
  | { status: "error"; result: AppPreviewResult | null; error: string };

export function AppPreviewViewer({
  document,
  content,
  loading,
  error,
  appPreview,
}: EditorViewerContext) {
  const [mode, setMode] = useState<AppPreviewMode>("preview");
  const [state, setState] = useState<AppPreviewState>({ status: "idle", result: null, error: null });
  const [logs, setLogs] = useState("");
  const requestVersionRef = useRef(0);
  const appName = useMemo(() => getManifestName(content) ?? document.name.replace(/\.puppyoneapp$/i, ""), [content, document.name]);

  const refreshLogs = useCallback(async () => {
    if (!appPreview?.getLogs) return;
    try {
      setLogs(await appPreview.getLogs(document.path));
    } catch (logsError) {
      setLogs(logsError instanceof Error ? logsError.message : String(logsError));
    }
  }, [appPreview, document.path]);

  const startPreview = useCallback(async (restart = false) => {
    if (!appPreview?.start) {
      setState({
        status: "error",
        result: null,
        error: "App Preview is not available for this workspace.",
      });
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setState((current) => ({
      status: "starting",
      result: current.result,
      error: null,
    }));

    try {
      const result = restart && appPreview.restart
        ? await appPreview.restart(document.path)
        : await appPreview.start(document.path);
      if (requestVersion !== requestVersionRef.current) return;
      setState(
        result.status === "running"
          ? { status: "running", result, error: null }
          : { status: "error", result, error: result.message || "Unable to start this app." },
      );
      setLogs(result.logs ?? "");
    } catch (startError) {
      if (requestVersion !== requestVersionRef.current) return;
      setState({
        status: "error",
        result: null,
        error: startError instanceof Error ? startError.message : String(startError),
      });
      await refreshLogs();
    }
  }, [appPreview, document.path, refreshLogs]);

  useEffect(() => {
    if (mode !== "preview") return;
    void startPreview(false);
  }, [mode, startPreview]);

  useEffect(() => {
    if (mode !== "logs") return;
    void refreshLogs();
  }, [mode, refreshLogs]);

  if (loading && !content) return <div className="editor-state">Loading app...</div>;
  if (error && !content) return <div className="editor-state danger">{error}</div>;

  const runningUrl = state.status === "running" ? state.result.url : null;
  const statusLabel = getAppPreviewStatusLabel(state);

  return (
    <section className="app-preview-shell" data-mode={mode}>
      <header className="app-preview-header">
        <div className="app-preview-title">
          <strong>{appName}</strong>
          <span data-status={state.status}>{statusLabel}</span>
        </div>

        <div className="app-preview-toolbar" aria-label="App Preview controls">
          <button
            className={mode === "preview" ? "active" : ""}
            type="button"
            title="App preview"
            aria-label="App preview"
            onClick={() => setMode("preview")}
          >
            <Eye size={14} strokeWidth={2} />
          </button>
          <button
            className={mode === "source" ? "active" : ""}
            type="button"
            title="Manifest source"
            aria-label="Manifest source"
            onClick={() => setMode("source")}
          >
            <Code2 size={14} strokeWidth={2} />
          </button>
          <button
            className={mode === "logs" ? "active" : ""}
            type="button"
            title="Runtime logs"
            aria-label="Runtime logs"
            onClick={() => setMode("logs")}
          >
            <TerminalSquare size={14} strokeWidth={2} />
          </button>
          <span className="app-preview-toolbar-separator" aria-hidden="true" />
          <button
            type="button"
            title="Restart app"
            aria-label="Restart app"
            disabled={!appPreview?.restart || state.status === "starting"}
            onClick={() => {
              setMode("preview");
              void startPreview(true);
            }}
          >
            <RotateCw size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Open in browser"
            aria-label="Open in browser"
            disabled={!appPreview?.openExternal || !runningUrl}
            onClick={() => {
              void appPreview?.openExternal?.(document.path);
            }}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="app-preview-body">
        {mode === "source" ? (
          <div className="app-preview-source">
            <PlainTextEditor content={content} nodeName={document.name} readOnly />
          </div>
        ) : mode === "logs" ? (
          <div className="app-preview-logs" role="log" aria-label="App Preview logs">
            <pre>{logs || "No logs yet."}</pre>
          </div>
        ) : runningUrl ? (
          <iframe
            key={runningUrl}
            className="app-preview-frame"
            src={runningUrl}
            title={appName}
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        ) : (
          <AppPreviewStateView
            appName={appName}
            state={state}
            canRestart={Boolean(appPreview?.restart)}
            onRestart={() => {
              void startPreview(true);
            }}
          />
        )}
      </div>
    </section>
  );
}

function AppPreviewStateView({
  appName,
  state,
  canRestart,
  onRestart,
}: {
  appName: string;
  state: AppPreviewState;
  canRestart: boolean;
  onRestart: () => void;
}) {
  if (state.status === "starting") {
    return (
      <div className="app-preview-state">
        <div className="app-preview-spinner" aria-hidden="true" />
        <strong>Starting {appName}</strong>
        <span>Preparing local app preview...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="app-preview-state danger">
        <Square size={22} strokeWidth={1.9} aria-hidden="true" />
        <strong>App preview failed</strong>
        <span>{state.error || state.result?.message || "Unable to start this app."}</span>
        <button type="button" disabled={!canRestart} onClick={onRestart}>
          Restart
        </button>
      </div>
    );
  }

  return (
    <div className="app-preview-state">
      <div className="app-preview-spinner" aria-hidden="true" />
      <strong>Preparing {appName}</strong>
      <span>Waiting for the local runtime...</span>
    </div>
  );
}

function getManifestName(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null;
  } catch {
    return null;
  }
}

function getAppPreviewStatusLabel(state: AppPreviewState): string {
  switch (state.status) {
    case "running":
      return "Running";
    case "starting":
      return "Starting";
    case "error":
      return "Failed";
    case "idle":
    default:
      return "Ready";
  }
}
