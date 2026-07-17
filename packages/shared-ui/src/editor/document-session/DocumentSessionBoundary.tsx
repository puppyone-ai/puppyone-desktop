"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { DocumentPersistencePort } from "../../core/types";
import { EditorSaveButton } from "../EditorSaveButton";
import type { EditorSaveMode } from "../viewerTypes";
import { registerActiveDocumentSession } from "./activeDocumentSessions";
import { DocumentEditingSession } from "./DocumentEditingSession";
import { EditableDocumentSourceProvider } from "./EditableDocumentSourceContext";
import { formatDocumentSessionError } from "./formatDocumentSessionError";
import type { DocumentPersistedCommit } from "./types";
import { useDocumentSessionState } from "./useDocumentSessionState";

export type DocumentSessionBoundaryProps = {
  documentId: string;
  initialContent: string;
  initialVersion?: string | null;
  saveMode: EditorSaveMode;
  persistence: DocumentPersistencePort;
  onPersisted?: (commit: DocumentPersistedCommit) => void;
  showSaveStatus?: boolean;
  children: ReactNode;
};

/** Trusted composition boundary between routing and a concrete editor. */
export function DocumentSessionBoundary({
  documentId,
  initialContent,
  initialVersion = null,
  saveMode,
  persistence,
  onPersisted,
  showSaveStatus = false,
  children,
}: DocumentSessionBoundaryProps) {
  const { t } = useLocalization();
  // Baseline, callback, and policy changes reconcile into this document's
  // existing session. Only document/storage identity creates a new queue.
  const binding = useMemo(() => {
    // Each session gets its own callback cell. An old session may finish after
    // React has committed the next document; sharing one ref across sessions
    // would misroute (or drop) that old document's acknowledgement.
    const onPersistedRef: { current: typeof onPersisted } = { current: onPersisted };
    return {
      onPersistedRef,
      session: new DocumentEditingSession({
        documentId,
        initialContent,
        initialVersion,
        saveMode,
        persistence,
        onPersisted: (commit) => onPersistedRef.current?.(commit),
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, persistence]);
  binding.onPersistedRef.current = onPersisted;
  const { session } = binding;
  const sessionState = useDocumentSessionState(session);
  const sessionError = formatDocumentSessionError(sessionState.error, t);

  useEffect(() => {
    session.setSaveMode(saveMode);
  }, [saveMode, session]);

  useEffect(() => {
    // The registry defers permanent disposal until it can distinguish a real
    // unmount from React StrictMode's cleanup/setup development probe. Child
    // detachment still captures the final editor snapshot synchronously.
    return registerActiveDocumentSession(session);
  }, [session]);

  const saveBlocked = sessionState.error?.code === "external-conflict";
  const showSaveChrome = showSaveStatus
    || (sessionState.status === "error" && !saveBlocked);
  const save = useCallback(() => {
    if (saveBlocked) return;
    observeSessionOperation(session.requestSave(), "manual save");
  }, [saveBlocked, session]);
  const resolveExternalConflict = useCallback((keepLocal: boolean) => {
    observeSessionOperation(
      session.resolveExternalConflict(keepLocal ? "keep-local" : "reload-external"),
      "external conflict resolution",
    );
  }, [session]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key.toLowerCase() !== "s"
      || (!event.metaKey && !event.ctrlKey)
      || event.altKey
      || event.shiftKey
    ) return;
    event.preventDefault();
    save();
  }, [save]);

  return (
    <EditableDocumentSourceProvider source={session}>
      <div className="editor-document-session-boundary" onKeyDownCapture={handleKeyDown}>
        {showSaveChrome && (
          <div className="editor-save-overlay">
            <EditorSaveButton
              status={sessionState.status}
              manual={saveMode === "manual"}
              retryable={!saveBlocked}
              onSave={save}
            />
          </div>
        )}
        {sessionError && (
          <div className="editor-inline-error" role="alert" dir="auto">
            <span>{sessionError}</span>
            {saveBlocked && (
              <div className="editor-conflict-actions">
                <button type="button" onClick={() => resolveExternalConflict(false)}>
                  {t("editor.session.reloadExternal")}
                </button>
                <button type="button" onClick={() => resolveExternalConflict(true)}>
                  {t("editor.session.keepLocal")}
                </button>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </EditableDocumentSourceProvider>
  );
}

function observeSessionOperation(operation: Promise<void>, label: string): void {
  void operation.catch((error) => {
    // The Session has already published the failure to the boundary and close
    // registry. Keep diagnostics without creating an unhandled rejection.
    console.warn(`Document Session ${label} failed:`, error);
  });
}
