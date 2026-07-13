"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorSaveButton } from "../EditorSaveButton";
import { PlainTextEditor } from "../PlainTextEditor";
import type { EditorMode, EditorSaveMode } from "../viewerTypes";
import type {
  EditorSourceRevision,
  EditorSourceSnapshot,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";
import type { EditorDocumentSession } from "../document-session/types";
import { useDocumentSessionState } from "../document-session/useDocumentSessionState";

export type TextEditorControls = {
  canEdit: boolean;
  onChange: (content: string) => void;
  onSourceRevisionChange: (revision: EditorSourceRevision) => void;
  onSnapshotPortChange: (port: EditorSourceSnapshotPort | null) => void;
  onBeforeDestroy: (snapshot: EditorSourceSnapshot) => void;
};

export type TextEditorFrameProps = {
  documentId: string;
  documentVersion?: string | null;
  content: string;
  nodeName: string;
  defaultMode: EditorMode;
  canEdit: boolean;
  documentSession?: EditorDocumentSession | null;
  hideSourceView: boolean;
  saveMode: EditorSaveMode;
  /** Keep the editor document canonical and read full source only at save boundaries. */
  sourceSnapshotMode?: boolean;
  renderLive: (content: string, controls: TextEditorControls) => ReactNode;
  renderSource?: (content: string, controls: TextEditorControls) => ReactNode;
};

export function TextEditorFrame({
  documentId,
  documentVersion = null,
  content,
  nodeName,
  defaultMode,
  canEdit,
  documentSession = null,
  hideSourceView,
  saveMode,
  sourceSnapshotMode = false,
  renderLive,
  renderSource,
}: TextEditorFrameProps) {
  const [mode, setMode] = useState<EditorMode>(hideSourceView ? "live" : defaultMode);
  const [draft, setDraft] = useState(content);
  const [editorValue, setEditorValue] = useState(content);
  const documentIdRef = useRef(documentId);
  const draftRef = useRef(draft);
  const draftRevisionCounterRef = useRef(0);
  const draftRevisionRef = useRef(createDraftRevision(documentId, 0));
  const contentPropRef = useRef(content);
  const documentVersionPropRef = useRef(documentVersion);
  const snapshotPortRef = useRef<EditorSourceSnapshotPort | null>(null);
  const detachSourceRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<EditorDocumentSession | null>(documentSession);
  const sessionState = useDocumentSessionState(documentSession);

  useLayoutEffect(() => {
    const previousSession = sessionRef.current;
    const sessionChanged = previousSession !== documentSession;
    const documentChanged = documentIdRef.current !== documentId;
    if (!sessionChanged && !documentChanged) return;

    const previousSnapshot = readCurrentSnapshot(sourceSnapshotMode, {
      draft: draftRef.current,
      draftRevision: draftRevisionRef.current,
      snapshotPort: snapshotPortRef.current,
    });
    detachSourceRef.current?.();
    detachSourceRef.current = null;
    snapshotPortRef.current = null;
    if (previousSession && previousSnapshot) {
      void previousSession
        .flushSnapshot(previousSnapshot, "document-switch")
        .catch(() => undefined);
    }

    documentIdRef.current = documentId;
    sessionRef.current = documentSession;
    draftRef.current = content;
    contentPropRef.current = content;
    documentVersionPropRef.current = documentVersion;
    draftRevisionCounterRef.current = 0;
    draftRevisionRef.current = createDraftRevision(documentId, 0);
    setMode(hideSourceView ? "live" : defaultMode);
    setDraft(content);
    setEditorValue(content);
  }, [
    content,
    defaultMode,
    documentId,
    documentSession,
    documentVersion,
    hideSourceView,
    sourceSnapshotMode,
  ]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    if (
      documentIdRef.current !== documentId
      || (
        contentPropRef.current === content
        && documentVersionPropRef.current === documentVersion
      )
    ) return;
    contentPropRef.current = content;
    documentVersionPropRef.current = documentVersion;
    const reconciliation = documentSession?.reconcileExternalBaseline(
      content,
      documentVersion,
    ) ?? "applied";
    if (reconciliation !== "applied") return;

    draftRef.current = content;
    draftRevisionCounterRef.current = 0;
    draftRevisionRef.current = createDraftRevision(documentId, 0);
    if (sourceSnapshotMode) setEditorValue(content);
    else setDraft(content);
  }, [content, documentId, documentSession, documentVersion, sourceSnapshotMode]);

  useLayoutEffect(() => {
    if (!documentSession || sourceSnapshotMode) return undefined;
    const source: EditorSourceSnapshotPort = {
      readSnapshot: () => ({
        content: draftRef.current,
        revision: draftRevisionRef.current,
      }),
      readRevision: () => draftRevisionRef.current,
    };
    detachSourceRef.current?.();
    detachSourceRef.current = documentSession.attachSource(source);
    documentSession.reportRevision({
      revision: draftRevisionRef.current,
      dirty: draftRef.current !== documentSession.getPersistedContent(),
    });
    return () => {
      detachSourceRef.current?.();
      detachSourceRef.current = null;
    };
  }, [documentId, documentSession, sourceSnapshotMode]);

  useLayoutEffect(() => () => {
    const session = sessionRef.current;
    const snapshot = readCurrentSnapshot(sourceSnapshotMode, {
      draft: draftRef.current,
      draftRevision: draftRevisionRef.current,
      snapshotPort: snapshotPortRef.current,
    });
    detachSourceRef.current?.();
    detachSourceRef.current = null;
    if (session && snapshot) {
      void session.flushSnapshot(snapshot, "destroy").catch(() => undefined);
    }
  }, [sourceSnapshotMode]);

  useEffect(() => {
    if (hideSourceView) setMode("live");
  }, [hideSourceView]);

  const handleDraftChange = useCallback((nextContent: string) => {
    draftRef.current = nextContent;
    setDraft(nextContent);
    draftRevisionCounterRef.current += 1;
    draftRevisionRef.current = createDraftRevision(documentIdRef.current, draftRevisionCounterRef.current);
    const session = sessionRef.current;
    session?.reportRevision({
      revision: draftRevisionRef.current,
      dirty: nextContent !== session.getPersistedContent(),
    });
  }, []);

  const handleSourceRevisionChange = (revision: EditorSourceRevision) => {
    sessionRef.current?.reportRevision(revision);
  };

  const handleSnapshotPortChange = (port: EditorSourceSnapshotPort | null) => {
    detachSourceRef.current?.();
    detachSourceRef.current = null;
    snapshotPortRef.current = port;
    if (port && sessionRef.current) {
      detachSourceRef.current = sessionRef.current.attachSource(port);
    }
  };

  const handleBeforeDestroy = (snapshot: EditorSourceSnapshot) => {
    const session = sessionRef.current;
    detachSourceRef.current?.();
    detachSourceRef.current = null;
    snapshotPortRef.current = null;
    if (session) void session.flushSnapshot(snapshot, "destroy").catch(() => undefined);
  };

  const controls: TextEditorControls = {
    canEdit,
    onChange: handleDraftChange,
    onSourceRevisionChange: handleSourceRevisionChange,
    onSnapshotPortChange: handleSnapshotPortChange,
    onBeforeDestroy: handleBeforeDestroy,
  };

  const switchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    if (sourceSnapshotMode) {
      const snapshot = snapshotPortRef.current?.readSnapshot();
      if (snapshot) setEditorValue(snapshot.content);
    }
    setMode(nextMode);
    void documentSession?.requestSave("mode-switch").catch(() => undefined);
  };

  return (
    <section className="editor-host">
      {saveMode === "manual" && documentSession && (
        <div className="editor-save-overlay">
          <EditorSaveButton
            status={sessionState.status}
            onSave={() => void documentSession.requestSave("manual").catch(() => undefined)}
          />
        </div>
      )}

      {sessionState.error && <div className="editor-inline-error">{sessionState.error}</div>}

      {mode === "live" ? (
        <div className="editor-live-surface">
          {renderLive(sourceSnapshotMode ? editorValue : draft, controls)}
        </div>
      ) : renderSource ? (
        <div className="editor-live-surface">
          {renderSource(sourceSnapshotMode ? editorValue : draft, controls)}
        </div>
      ) : (
        <PlainTextEditor
          content={draft}
          nodeName={nodeName}
          readOnly={!canEdit}
          onChange={canEdit ? handleDraftChange : undefined}
        />
      )}

      {!hideSourceView && (
        <div className="editor-mode-toggle" aria-label="Editor mode">
          <button
            className={mode === "live" ? "active" : ""}
            type="button"
            onClick={() => switchMode("live")}
            title="Live view"
            aria-label="Live view"
          >
            <PencilIcon />
          </button>
          <button
            className={mode === "source" ? "active" : ""}
            type="button"
            onClick={() => switchMode("source")}
            title="Source code"
            aria-label="Source code"
          >
            <CodeIcon />
          </button>
        </div>
      )}
    </section>
  );
}

function createDraftRevision(documentId: string, sequence: number): string {
  return `draft:${documentId}:${sequence}`;
}

function readCurrentSnapshot(
  sourceSnapshotMode: boolean,
  source: {
    draft: string;
    draftRevision: string;
    snapshotPort: EditorSourceSnapshotPort | null;
  },
): EditorSourceSnapshot | null {
  if (sourceSnapshotMode) return source.snapshotPort?.readSnapshot() ?? null;
  return {
    content: source.draft,
    revision: source.draftRevision,
  };
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
