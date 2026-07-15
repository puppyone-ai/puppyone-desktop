import type {
  DocumentPersistenceReason,
  DocumentPersistenceResult,
} from "../../core/types";
import type {
  EditorSourceRevision,
  EditorSourceSnapshot,
  EditorSourceSnapshotPort,
} from "../sourceSnapshot";
import type { EditorSaveMode } from "../viewerTypes";
import type {
  DocumentEditingSessionOptions,
  DocumentPersistedCommit,
  DocumentSessionDrainReason,
  DocumentSessionError,
  DocumentSessionState,
  EditorDocumentSession,
  ExternalBaselineResult,
} from "./types";

type CommitCandidate = {
  sequence: number;
  snapshot: EditorSourceSnapshot;
  reason: DocumentPersistenceReason;
};

type CommitWaiter = {
  sequence: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type DrainReason = DocumentSessionDrainReason;

const SAVED_STATUS_DURATION_MS = 1200;

const REASON_PRIORITY: Record<DocumentPersistenceReason, number> = {
  edit: 0,
  manual: 2,
  "mode-switch": 3,
  "document-close": 4,
  "document-switch": 5,
  "workspace-switch": 6,
  destroy: 7,
  "app-close": 8,
};

/**
 * Framework-independent per-document write coordinator. It is deliberately
 * final rather than extensible: storage varies behind the persistence port,
 * while ordering/version invariants stay host-owned.
 */
export class DocumentEditingSession implements EditorDocumentSession {
  readonly documentId: string;

  private readonly persistence: DocumentEditingSessionOptions["persistence"];
  private readonly onPersisted?: (commit: DocumentPersistedCommit) => void;
  private saveMode: EditorSaveMode;
  private source: EditorSourceSnapshotPort | null = null;
  private persistedContent: string;
  private storageVersion: string | null;
  private currentRevision: string | null = null;
  private persistedRevision: string | null = null;
  private dirty = false;
  private state: DocumentSessionState;
  private readonly listeners = new Set<() => void>();
  private immediateCommitScheduled = false;
  private immediateCommitGeneration = 0;
  private savedStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: CommitCandidate | null = null;
  private inFlight: CommitCandidate | null = null;
  private nextSequence = 0;
  private readonly waiters: CommitWaiter[] = [];
  private readonly activeDrainReasons = new Map<DrainReason, number>();
  private disposed = false;

  constructor(options: DocumentEditingSessionOptions) {
    this.documentId = options.documentId;
    this.persistence = options.persistence;
    this.onPersisted = options.onPersisted;
    this.saveMode = options.saveMode;
    this.persistedContent = options.initialContent;
    this.storageVersion = options.initialVersion ?? null;
    this.state = Object.freeze({
      documentId: this.documentId,
      status: "clean",
      error: null,
      currentRevision: null,
      persistedRevision: null,
      storageVersion: this.storageVersion,
    });
  }

  attachSource = (source: EditorSourceSnapshotPort): (() => void) => {
    if (this.disposed) return () => undefined;
    this.source = source;
    return () => {
      if (this.source === source) this.source = null;
    };
  };

  reportRevision = (revision: EditorSourceRevision): void => {
    if (this.disposed) return;
    this.currentRevision = revision.revision;

    if (!revision.dirty) {
      if (!this.hasActiveCommit()) {
        this.cancelImmediateCommit();
        this.dirty = false;
        this.persistedRevision = revision.revision;
        this.publish("clean", null);
      } else {
        // An older revision may already be crossing the storage boundary. Keep
        // the current baseline revision dirty until that write completes, then
        // persist this revision again if necessary (for example, an undo back
        // to the last saved content while a newer edit is in flight).
        this.dirty = true;
        this.publish(this.inFlight ? "saving" : "dirty", this.state.error);
      }
      return;
    }

    this.dirty = true;
    this.publish(this.inFlight ? "saving" : "dirty", null);
    if (this.saveMode === "auto") this.scheduleImmediateCommit();
  };

  requestSave = async (
    reason: Extract<DocumentPersistenceReason, "manual" | "mode-switch"> = "manual",
  ): Promise<void> => {
    const source = this.source;
    if (!source) return;
    await this.enqueue(source.readSnapshot(), reason);
  };

  flushSnapshot = async (
    snapshot: EditorSourceSnapshot,
    reason: Extract<
      DocumentPersistenceReason,
      "document-close" | "document-switch" | "workspace-switch" | "destroy"
    >,
  ): Promise<void> => {
    await this.enqueue(snapshot, reason);
  };

  flushCurrent = async (
    reason: DrainReason = "app-close",
  ): Promise<void> => {
    this.enterDrain(reason);
    try {
      // A revision may arrive while the first close write is in flight. Keep
      // snapshotting the attached source until the acknowledged revision is
      // the newest one, rather than treating the first completed write as the
      // drain. Immediate edit commits inherit the strongest active drain
      // reason so they cannot race around a close/navigation barrier.
      while (true) {
        const source = this.source;
        if (source) {
          await this.enqueue(source.readSnapshot(), this.strongestDrainReason() ?? reason);
        } else if (this.pending) {
          // A source can detach after submitting its final snapshot. Drain the
          // exact candidate already owned by the session.
          this.pending.reason = higherPriorityReason(
            this.pending.reason,
            this.strongestDrainReason() ?? reason,
          );
          await this.waitFor(this.pending.sequence);
        } else if (this.inFlight) {
          await this.waitFor(this.inFlight.sequence);
        } else if (this.hasUnpersistedChanges()) {
          throw new Error(
            this.state.error?.detail
            ?? `Unable to flush ${this.documentId}: its editor source is unavailable.`,
          );
        }

        if (!this.hasUnpersistedChanges()) return;
      }
    } finally {
      this.leaveDrain(reason);
    }
  };

  reconcileExternalBaseline = (
    content: string,
    version: string | null = null,
  ): ExternalBaselineResult => {
    if (content === this.persistedContent) {
      if (version !== null) {
        this.storageVersion = version;
        this.publish(this.state.status, this.state.error);
      }
      return "acknowledged";
    }

    if (this.hasUnpersistedChanges()) {
      this.publish(
        "error",
        createSessionError("external-conflict"),
      );
      return "conflict";
    }

    this.persistedContent = content;
    this.storageVersion = version;
    this.currentRevision = null;
    this.persistedRevision = null;
    this.dirty = false;
    this.publish("clean", null);
    return "applied";
  };

  getPersistedContent = (): string => this.persistedContent;

  hasUnpersistedChanges = (): boolean => (
    this.dirty || this.pending !== null || this.inFlight !== null
  );

  getState = (): DocumentSessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSaveMode(saveMode: EditorSaveMode): void {
    if (this.saveMode === saveMode) return;
    this.saveMode = saveMode;
    if (saveMode === "auto" && this.dirty) this.scheduleImmediateCommit();
    if (saveMode === "manual") this.cancelImmediateCommit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelImmediateCommit();
    this.clearSavedStatusTimer();

    const source = this.source;
    this.source = null;
    if (source && this.hasUnpersistedChanges()) {
      void this.enqueue(source.readSnapshot(), "destroy").catch(() => undefined);
    }
    this.listeners.clear();
  }

  /**
   * Coalesce only transactions produced in the same JavaScript turn. This is
   * deliberately a microtask rather than a timer: the first dirty revision is
   * eligible for persistence immediately and never waits for typing to stop.
   */
  private scheduleImmediateCommit(): void {
    if (this.disposed || this.immediateCommitScheduled) return;
    this.immediateCommitScheduled = true;
    const generation = ++this.immediateCommitGeneration;
    queueMicrotask(() => {
      if (
        generation !== this.immediateCommitGeneration
        || !this.immediateCommitScheduled
      ) return;
      this.immediateCommitScheduled = false;
      if (this.disposed || this.saveMode !== "auto" || !this.dirty) return;
      void this.requestImmediateSave().catch(() => {
        // enqueue records the error in observable Session state. Consuming the
        // scheduling Promise prevents an unhandled rejection; it does not hide
        // the failure from the subscribed UI or later close drain.
      });
    });
  }

  private cancelImmediateCommit(): void {
    this.immediateCommitScheduled = false;
    this.immediateCommitGeneration += 1;
  }

  private async requestImmediateSave(): Promise<void> {
    const source = this.source;
    if (!source) return;
    await this.enqueue(source.readSnapshot(), this.strongestDrainReason() ?? "edit");
  }

  private enterDrain(reason: DrainReason): void {
    this.activeDrainReasons.set(reason, (this.activeDrainReasons.get(reason) ?? 0) + 1);
  }

  private leaveDrain(reason: DrainReason): void {
    const count = this.activeDrainReasons.get(reason) ?? 0;
    if (count <= 1) this.activeDrainReasons.delete(reason);
    else this.activeDrainReasons.set(reason, count - 1);
  }

  private strongestDrainReason(): DrainReason | null {
    let strongest: DrainReason | null = null;
    for (const reason of this.activeDrainReasons.keys()) {
      if (!strongest || REASON_PRIORITY[reason] > REASON_PRIORITY[strongest]) {
        strongest = reason;
      }
    }
    return strongest;
  }

  private enqueue(snapshot: EditorSourceSnapshot, reason: DocumentPersistenceReason): Promise<void> {
    this.cancelImmediateCommit();

    if (snapshot.content === this.persistedContent && !this.hasActiveCommit()) {
      this.currentRevision = snapshot.revision;
      this.persistedRevision = snapshot.revision;
      this.dirty = false;
      this.publish("clean", null);
      return Promise.resolve();
    }

    if (sameSnapshot(this.inFlight?.snapshot, snapshot)) {
      return this.waitFor(this.inFlight!.sequence);
    }

    if (sameSnapshot(this.pending?.snapshot, snapshot)) {
      this.pending!.reason = higherPriorityReason(this.pending!.reason, reason);
      return this.waitFor(this.pending!.sequence);
    }

    const candidate: CommitCandidate = {
      sequence: ++this.nextSequence,
      snapshot,
      reason,
    };
    this.pending = candidate;
    this.dirty = true;
    this.publish(this.inFlight ? "saving" : "dirty", null);
    // Register before starting the async pump. A host adapter is required to
    // return a Promise, but it may still throw while constructing that Promise
    // (for example when the desktop bridge is unavailable).
    const completion = this.waitFor(candidate.sequence);
    void this.pump();
    return completion;
  }

  private waitFor(sequence: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ sequence, resolve, reject });
    });
  }

  private async pump(): Promise<void> {
    if (this.inFlight || !this.pending) return;

    const candidate = this.pending;
    this.pending = null;

    // The editor may return to the content currently crossing the storage
    // boundary (type, then undo) under a newer editor revision. Once that
    // earlier write is acknowledged, advance the semantic revision without a
    // redundant filesystem replacement or empty Cloud commit.
    if (candidate.snapshot.content === this.persistedContent) {
      this.persistedRevision = candidate.snapshot.revision;
      this.dirty = this.currentRevision !== null
        && this.currentRevision !== candidate.snapshot.revision;
      this.resolveWaitersThrough(candidate.sequence);
      this.publish(this.dirty ? "dirty" : "clean", null);
      if (this.dirty && this.saveMode === "auto" && !this.disposed) {
        this.scheduleImmediateCommit();
      }
      return;
    }

    this.inFlight = candidate;
    this.publish("saving", null);

    let failure: unknown = null;
    try {
      const result = await this.persistence.persist({
        path: this.documentId,
        content: candidate.snapshot.content,
        revision: candidate.snapshot.revision,
        baseVersion: this.storageVersion,
        reason: candidate.reason,
      });
      this.acknowledge(candidate, result);
    } catch (error) {
      failure = error;
    } finally {
      this.inFlight = null;
    }

    if (failure) {
      const sessionError = createSessionError("persistence-failed", toErrorMessage(failure));
      if (this.pending) {
        this.dirty = true;
        this.publish("dirty", sessionError);
      } else {
        this.dirty = true;
        this.publish("error", sessionError);
        this.rejectWaitersThrough(candidate.sequence, failure);
      }
    }

    if (this.pending) {
      void this.pump();
      return;
    }

    if (!failure && this.currentRevision !== this.persistedRevision) {
      this.dirty = true;
      this.publish("dirty", null);
      if (this.saveMode === "auto" && !this.disposed) this.scheduleImmediateCommit();
    }
  }

  private acknowledge(
    candidate: CommitCandidate,
    result: DocumentPersistenceResult | void,
  ): void {
    this.persistedContent = candidate.snapshot.content;
    this.persistedRevision = candidate.snapshot.revision;
    if (result && Object.prototype.hasOwnProperty.call(result, "version")) {
      this.storageVersion = result.version ?? null;
    }
    this.dirty = this.currentRevision !== null && this.currentRevision !== candidate.snapshot.revision;
    this.resolveWaitersThrough(candidate.sequence);

    try {
      this.onPersisted?.(Object.freeze({
        documentId: this.documentId,
        content: candidate.snapshot.content,
        revision: candidate.snapshot.revision,
        reason: candidate.reason,
        version: this.storageVersion,
      }));
    } catch (error) {
      console.error("Unable to apply persisted document acknowledgement:", error);
    }

    if (this.dirty || this.pending) {
      this.publish(this.pending ? "saving" : "dirty", null);
      return;
    }

    if (this.disposed) {
      this.publish("clean", null);
      return;
    }

    this.publish("saved", null);
    this.clearSavedStatusTimer();
    this.savedStatusTimer = setTimeout(() => {
      this.savedStatusTimer = null;
      if (!this.hasUnpersistedChanges()) this.publish("clean", null);
    }, SAVED_STATUS_DURATION_MS);
  }

  private resolveWaitersThrough(sequence: number): void {
    for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.waiters[index];
      if (waiter.sequence > sequence) continue;
      this.waiters.splice(index, 1);
      waiter.resolve();
    }
  }

  private rejectWaitersThrough(sequence: number, error: unknown): void {
    for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.waiters[index];
      if (waiter.sequence > sequence) continue;
      this.waiters.splice(index, 1);
      waiter.reject(error);
    }
  }

  private publish(status: DocumentSessionState["status"], error: DocumentSessionError | null): void {
    const next = Object.freeze({
      documentId: this.documentId,
      status,
      error,
      currentRevision: this.currentRevision,
      persistedRevision: this.persistedRevision,
      storageVersion: this.storageVersion,
    });
    if (sameState(this.state, next)) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private hasActiveCommit(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  private clearSavedStatusTimer(): void {
    if (this.savedStatusTimer === null) return;
    clearTimeout(this.savedStatusTimer);
    this.savedStatusTimer = null;
  }
}

function sameSnapshot(
  left: EditorSourceSnapshot | null | undefined,
  right: EditorSourceSnapshot,
): boolean {
  return Boolean(left && left.revision === right.revision && left.content === right.content);
}

function higherPriorityReason(
  left: DocumentPersistenceReason,
  right: DocumentPersistenceReason,
): DocumentPersistenceReason {
  return REASON_PRIORITY[right] > REASON_PRIORITY[left] ? right : left;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createSessionError(
  code: DocumentSessionError["code"],
  detail: string | null = null,
): DocumentSessionError {
  return Object.freeze({ code, detail });
}

function sameState(left: DocumentSessionState, right: DocumentSessionState): boolean {
  return (
    left.status === right.status
    && left.error?.code === right.error?.code
    && left.error?.detail === right.error?.detail
    && left.currentRevision === right.currentRevision
    && left.persistedRevision === right.persistedRevision
    && left.storageVersion === right.storageVersion
  );
}
