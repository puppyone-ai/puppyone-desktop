"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import type { DocumentPersistencePort } from "../../core/types";
import type { EditorSaveMode } from "../viewerTypes";
import { registerActiveDocumentSession } from "./activeDocumentSessions";
import { DocumentEditingSession } from "./DocumentEditingSession";
import type { DocumentPersistedCommit, EditorDocumentSession } from "./types";

export type DocumentSessionBoundaryProps = {
  documentId: string;
  initialContent: string;
  initialVersion?: string | null;
  saveMode: EditorSaveMode;
  persistence: DocumentPersistencePort;
  onPersisted?: (commit: DocumentPersistedCommit) => void;
  children: (session: EditorDocumentSession) => ReactNode;
};

/** Trusted composition boundary between routing and a concrete editor. */
export function DocumentSessionBoundary({
  documentId,
  initialContent,
  initialVersion = null,
  saveMode,
  persistence,
  onPersisted,
  children,
}: DocumentSessionBoundaryProps) {
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

  useEffect(() => {
    session.setSaveMode(saveMode);
  }, [saveMode, session]);

  useEffect(() => {
    const unregister = registerActiveDocumentSession(session);
    return () => {
      // Dispose submits the editor's last attached snapshot. Registration
      // retires only after that queued commit is durably acknowledged.
      session.dispose();
      unregister();
    };
  }, [session]);

  return <>{children(session)}</>;
}
