import type {
  DocumentPersistencePort,
  DocumentPersistenceReason,
} from "../../core/types";
import type {
  EditorSourceRevision,
  EditorSourceSnapshot,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";
import type { EditorSaveMode } from "../viewerTypes";

export type DocumentSessionStatus = "clean" | "dirty" | "saving" | "saved" | "error";

export type DocumentSessionState = Readonly<{
  documentId: string;
  status: DocumentSessionStatus;
  error: string | null;
  currentRevision: string | null;
  persistedRevision: string | null;
  storageVersion: string | null;
}>;

export type DocumentPersistedCommit = Readonly<{
  documentId: string;
  content: string;
  revision: string;
  reason: DocumentPersistenceReason;
  version: string | null;
}>;

export type DocumentEditingSessionOptions = {
  documentId: string;
  initialContent: string;
  initialVersion?: string | null;
  saveMode: EditorSaveMode;
  persistence: DocumentPersistencePort;
  onPersisted?: (commit: DocumentPersistedCommit) => void;
};

export type ExternalBaselineResult = "acknowledged" | "applied" | "conflict";

/** Trusted host contract consumed by editable built-in contributions. */
export type EditorDocumentSession = {
  readonly documentId: string;
  attachSource: (source: EditorSourceSnapshotPort) => () => void;
  reportRevision: (revision: EditorSourceRevision) => void;
  requestSave: (reason?: Extract<DocumentPersistenceReason, "manual" | "mode-switch">) => Promise<void>;
  flushSnapshot: (
    snapshot: EditorSourceSnapshot,
    reason: Extract<DocumentPersistenceReason, "document-switch" | "destroy">,
  ) => Promise<void>;
  /** Read and durably drain the current source before the host closes. */
  flushCurrent: (
    reason?: Extract<DocumentPersistenceReason, "app-close" | "destroy">,
  ) => Promise<void>;
  reconcileExternalBaseline: (content: string, version?: string | null) => ExternalBaselineResult;
  getPersistedContent: () => string;
  hasUnpersistedChanges: () => boolean;
  getState: () => DocumentSessionState;
  subscribe: (listener: () => void) => () => void;
};
