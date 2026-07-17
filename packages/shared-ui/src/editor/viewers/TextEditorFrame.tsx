"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocalization } from "@puppyone/localization/react";
import { PlainTextEditor } from "../PlainTextEditor";
import type { EditorMode } from "../viewerTypes";
import type {
  EditorSourceRevision,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";
import { useEditableDocumentSource } from "../document-session/EditableDocumentSourceContext";
import type { EditableDocumentSource } from "../document-session/types";

export type TextEditorControls = {
  canEdit: boolean;
  onChange: (content: string) => void;
  onSourceRevisionChange: (revision: EditorSourceRevision) => void;
  onSnapshotPortChange: (port: EditorSourceSnapshotPort | null) => void;
};

export type TextEditorFrameProps = {
  documentId: string;
  documentVersion?: string | null;
  content: string;
  nodeName: string;
  defaultMode: EditorMode;
  canEdit: boolean;
  hideSourceView: boolean;
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
  hideSourceView,
  sourceSnapshotMode = false,
  renderLive,
  renderSource,
}: TextEditorFrameProps) {
  const { t } = useLocalization();
  const editingSource = useEditableDocumentSource();
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
  const editingSourceRef = useRef<EditableDocumentSource | null>(editingSource);

  useLayoutEffect(() => {
    const sourceChanged = editingSourceRef.current !== editingSource;
    const documentChanged = documentIdRef.current !== documentId;
    if (!sourceChanged && !documentChanged) return;

    detachSourceRef.current?.();
    detachSourceRef.current = null;
    snapshotPortRef.current = null;

    documentIdRef.current = documentId;
    editingSourceRef.current = editingSource;
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
    documentVersion,
    editingSource,
    hideSourceView,
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
    const reconciliation = editingSource?.reconcileExternalBaseline(
      content,
      documentVersion,
    ) ?? "applied";
    if (reconciliation !== "applied") return;

    draftRef.current = content;
    draftRevisionCounterRef.current = 0;
    draftRevisionRef.current = createDraftRevision(documentId, 0);
    if (sourceSnapshotMode) setEditorValue(content);
    else setDraft(content);
  }, [content, documentId, documentVersion, editingSource, sourceSnapshotMode]);

  useLayoutEffect(() => {
    if (!editingSource || sourceSnapshotMode) return undefined;
    const source: EditorSourceSnapshotPort = {
      readSnapshot: () => ({
        content: draftRef.current,
        revision: draftRevisionRef.current,
      }),
      replaceContent: (nextContent) => {
        draftRevisionCounterRef.current += 1;
        draftRevisionRef.current = createDraftRevision(
          documentIdRef.current,
          draftRevisionCounterRef.current,
        );
        draftRef.current = nextContent;
        setDraft(nextContent);
        return {
          content: nextContent,
          revision: draftRevisionRef.current,
        };
      },
    };
    detachSourceRef.current?.();
    detachSourceRef.current = editingSource.attachSource(source);
    editingSource.reportRevision({
      revision: draftRevisionRef.current,
      dirty: false,
    });
    return () => {
      detachSourceRef.current?.();
      detachSourceRef.current = null;
    };
  }, [documentId, editingSource, sourceSnapshotMode]);

  useEffect(() => {
    if (hideSourceView) setMode("live");
  }, [hideSourceView]);

  const handleDraftChange = useCallback((nextContent: string) => {
    draftRef.current = nextContent;
    setDraft(nextContent);
    draftRevisionCounterRef.current += 1;
    draftRevisionRef.current = createDraftRevision(documentIdRef.current, draftRevisionCounterRef.current);
    editingSourceRef.current?.reportRevision({
      revision: draftRevisionRef.current,
      dirty: true,
    });
  }, []);

  const handleSourceRevisionChange = (revision: EditorSourceRevision) => {
    editingSourceRef.current?.reportRevision(revision);
  };

  const handleSnapshotPortChange = (port: EditorSourceSnapshotPort | null) => {
    detachSourceRef.current?.();
    detachSourceRef.current = null;
    snapshotPortRef.current = port;
    if (port && editingSourceRef.current) {
      detachSourceRef.current = editingSourceRef.current.attachSource({
        readSnapshot: port.readSnapshot,
        replaceContent: (nextContent) => {
          const snapshot = port.replaceContent(nextContent);
          setEditorValue(nextContent);
          return snapshot;
        },
      });
    }
  };

  const controls: TextEditorControls = {
    canEdit,
    onChange: handleDraftChange,
    onSourceRevisionChange: handleSourceRevisionChange,
    onSnapshotPortChange: handleSnapshotPortChange,
  };

  const switchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    if (sourceSnapshotMode) {
      const snapshot = snapshotPortRef.current?.readSnapshot();
      if (snapshot) setEditorValue(snapshot.content);
    }
    setMode(nextMode);
  };

  return (
    <section className="editor-host">
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
        <div className="editor-mode-toggle" aria-label={t("editor.mode.label")}>
          <button
            className={mode === "live" ? "active" : ""}
            type="button"
            onClick={() => switchMode("live")}
            title={t("editor.mode.live")}
            aria-label={t("editor.mode.live")}
          >
            <PencilIcon />
          </button>
          <button
            className={mode === "source" ? "active" : ""}
            type="button"
            onClick={() => switchMode("source")}
            title={t("editor.mode.source")}
            aria-label={t("editor.mode.source")}
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
