"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EditorSaveButton, type SaveStatus } from "../EditorSaveButton";
import { PlainTextEditor } from "../PlainTextEditor";
import type { EditorMode, EditorSaveMode } from "../viewerTypes";
import type {
  EditorSourceRevision,
  EditorSourceSnapshot,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";

export type TextEditorControls = {
  canEdit: boolean;
  onChange: (content: string) => void;
  onSourceRevisionChange: (revision: EditorSourceRevision) => void;
  onSnapshotPortChange: (port: EditorSourceSnapshotPort | null) => void;
  onBeforeDestroy: (snapshot: EditorSourceSnapshot) => void;
};

export type TextEditorFrameProps = {
  documentId: string;
  content: string;
  nodeName: string;
  defaultMode: EditorMode;
  canEdit: boolean;
  onSaveContent?: (content: string) => Promise<void>;
  hideSourceView: boolean;
  saveMode: EditorSaveMode;
  /** Keep the editor document canonical and read full source only at save boundaries. */
  sourceSnapshotMode?: boolean;
  renderLive: (content: string, controls: TextEditorControls) => ReactNode;
  renderSource?: (content: string, controls: TextEditorControls) => ReactNode;
};

export function TextEditorFrame({
  documentId,
  content,
  nodeName,
  defaultMode,
  canEdit,
  onSaveContent,
  hideSourceView,
  saveMode,
  sourceSnapshotMode = false,
  renderLive,
  renderSource,
}: TextEditorFrameProps) {
  const [mode, setMode] = useState<EditorMode>(hideSourceView ? "live" : defaultMode);
  const [draft, setDraft] = useState(content);
  const [editorValue, setEditorValue] = useState(content);
  const [persistedContent, setPersistedContent] = useState(content);
  const [snapshotDirty, setSnapshotDirty] = useState(false);
  const [snapshotRevision, setSnapshotRevision] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const documentIdRef = useRef(documentId);
  const draftRef = useRef(draft);
  const persistedContentRef = useRef(persistedContent);
  const snapshotDirtyRef = useRef(snapshotDirty);
  const snapshotRevisionRef = useRef<string | null>(snapshotRevision);
  const snapshotPortRef = useRef<EditorSourceSnapshotPort | null>(null);
  const savingRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const inFlightContentRef = useRef<string | null>(null);
  const dirty = sourceSnapshotMode ? snapshotDirty : draft !== persistedContent;

  useLayoutEffect(() => {
    if (documentIdRef.current === documentId) return;

    documentIdRef.current = documentId;
    savingRef.current = false;
    queuedAutoSaveRef.current = false;
    inFlightContentRef.current = null;
    snapshotPortRef.current = null;
    snapshotDirtyRef.current = false;
    snapshotRevisionRef.current = null;
    draftRef.current = content;
    persistedContentRef.current = content;
    setMode(hideSourceView ? "live" : defaultMode);
    setDraft(content);
    setEditorValue(content);
    setPersistedContent(content);
    setSnapshotDirty(false);
    setSnapshotRevision(null);
    setSaveStatus("clean");
    setSaveError(null);
  }, [content, defaultMode, documentId, hideSourceView]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    persistedContentRef.current = persistedContent;
  }, [persistedContent]);

  useEffect(() => {
    snapshotDirtyRef.current = snapshotDirty;
  }, [snapshotDirty]);

  useEffect(() => {
    snapshotRevisionRef.current = snapshotRevision;
  }, [snapshotRevision]);

  useLayoutEffect(() => {
    if (documentIdRef.current !== documentId) return;

    const previousPersistedContent = persistedContentRef.current;
    const hasLocalDraft = sourceSnapshotMode
      ? snapshotDirtyRef.current
      : saveMode === "auto"
        && draftRef.current !== previousPersistedContent
        && draftRef.current !== content;

    setPersistedContent(content);
    persistedContentRef.current = content;
    setSaveError(null);

    if (hasLocalDraft) {
      setSaveStatus("dirty");
      return;
    }

    if (sourceSnapshotMode) {
      // A save acknowledgement already matches the canonical EditorView. Only
      // a genuinely new external value is dispatched back into the editor.
      if (content !== previousPersistedContent) setEditorValue(content);
      setSnapshotDirty(false);
      snapshotDirtyRef.current = false;
    } else {
      setDraft(content);
      draftRef.current = content;
    }
    setSaveStatus("clean");
  }, [content, documentId, saveMode, sourceSnapshotMode]);

  useEffect(() => {
    if (hideSourceView) setMode("live");
  }, [hideSourceView]);

  useEffect(() => {
    if (dirty) setSaveStatus((status) => (status === "saving" ? status : "dirty"));
    else if (saveStatus === "dirty" || saveStatus === "error") setSaveStatus("clean");
  }, [dirty, saveStatus]);

  const saveContent = async (
    contentToSave: string,
    automatic: boolean,
    sourceRevision: string | null,
  ) => {
    if (!onSaveContent || contentToSave === persistedContentRef.current) return;

    if (savingRef.current) {
      if (automatic) queuedAutoSaveRef.current = true;
      return;
    }

    const saveDocumentId = documentIdRef.current;
    savingRef.current = true;
    inFlightContentRef.current = contentToSave;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await onSaveContent(contentToSave);
      if (documentIdRef.current !== saveDocumentId) return;

      persistedContentRef.current = contentToSave;
      setPersistedContent(contentToSave);
      if (sourceSnapshotMode) {
        const currentRevision = snapshotPortRef.current?.readRevision() ?? snapshotRevisionRef.current;
        const remainsDirty = sourceRevision !== null && currentRevision !== sourceRevision;
        snapshotDirtyRef.current = remainsDirty;
        setSnapshotDirty(remainsDirty);
        setSaveStatus(remainsDirty ? "dirty" : "saved");
      } else {
        setSaveStatus(draftRef.current === contentToSave ? "saved" : "dirty");
      }
      window.setTimeout(() => {
        if (documentIdRef.current !== saveDocumentId) return;
        setSaveStatus((status) => (status === "saved" ? "clean" : status));
      }, 1200);
    } catch (error) {
      if (documentIdRef.current !== saveDocumentId) return;
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentIdRef.current !== saveDocumentId) return;

      savingRef.current = false;
      inFlightContentRef.current = null;
      if (automatic && queuedAutoSaveRef.current) {
        queuedAutoSaveRef.current = false;
        window.setTimeout(() => void saveCurrentSource(true), 0);
      }
    }
  };

  const saveCurrentSource = async (automatic: boolean) => {
    if (sourceSnapshotMode) {
      const snapshot = snapshotPortRef.current?.readSnapshot();
      if (!snapshot) return;
      await saveContent(snapshot.content, automatic, snapshot.revision);
      return;
    }
    await saveContent(draftRef.current, automatic, null);
  };

  const handleSourceRevisionChange = (revision: EditorSourceRevision) => {
    snapshotRevisionRef.current = revision.revision;
    setSnapshotRevision(revision.revision);
    if (!revision.dirty) return;
    snapshotDirtyRef.current = true;
    setSnapshotDirty(true);
  };

  const handleSnapshotPortChange = (port: EditorSourceSnapshotPort | null) => {
    snapshotPortRef.current = port;
  };

  const handleBeforeDestroy = (snapshot: EditorSourceSnapshot) => {
    snapshotPortRef.current = null;
    if (!onSaveContent || snapshot.content === persistedContentRef.current) return;
    if (savingRef.current && snapshot.content === inFlightContentRef.current) return;
    // Destruction/file switch is a mandatory persistence boundary. The write
    // is started before EditorView disposal and carries the exact revision
    // snapshot; React state is deliberately not touched after unmount.
    void onSaveContent(snapshot.content).catch((error) => {
      console.error("Unable to flush editor source before disposal:", error);
    });
  };

  const controls: TextEditorControls = {
    canEdit,
    onChange: setDraft,
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
  };

  useEffect(() => {
    if (saveMode !== "auto" || !dirty || !onSaveContent) return undefined;

    const timeoutId = window.setTimeout(() => {
      void saveCurrentSource(true);
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [dirty, onSaveContent, saveMode, snapshotRevision, draft]);

  return (
    <section className="editor-host">
      {saveMode === "manual" && (
        <div className="editor-save-overlay">
          <EditorSaveButton status={saveStatus} onSave={() => void saveCurrentSource(false)} />
        </div>
      )}

      {saveError && <div className="editor-inline-error">{saveError}</div>}

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
          onChange={canEdit ? setDraft : undefined}
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
