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

const SAVED_STATUS_DURATION_MS = 1200;

const REASON_PRIORITY: Record<DocumentPersistenceReason, number> = {
  idle: 0,
  "max-delay": 1,
  manual: 2,
  "mode-switch": 3,
  "document-switch": 4,
  destroy: 5,
  "app-close": 6,
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
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private savedStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: CommitCandidate | null = null;
  private inFlight: CommitCandidate | null = null;
  private nextSequence = 0;
  private readonly waiters: CommitWaiter[] = [];
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
        this.clearAutomaticTimers();
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
    if (this.saveMode === "auto") this.scheduleAutomaticCommit();
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
    reason: Extract<DocumentPersistenceReason, "document-switch" | "destroy">,
  ): Promise<void> => {
    await this.enqueue(snapshot, reason);
  };

  flushCurrent = async (
    reason: Extract<DocumentPersistenceReason, "app-close" | "destroy"> = "app-close",
  ): Promise<void> => {
    // A revision may arrive while the first close write is in flight. Keep
    // snapshotting the attached source until the acknowledged revision is the
    // newest one, rather than treating the first completed write as the drain.
    while (true) {
      const source = this.source;
      if (source) {
        await this.enqueue(source.readSnapshot(), reason);
      } else if (this.pending) {
        // A source can detach after submitting its final snapshot. Drain the
        // exact candidate already owned by the session.
        this.pending.reason = higherPriorityReason(this.pending.reason, reason);
        await this.waitFor(this.pending.sequence);
      } else if (this.inFlight) {
        await this.waitFor(this.inFlight.sequence);
      } else if (this.hasUnpersistedChanges()) {
        throw new Error(
          this.state.error
          ?? `Unable to flush ${this.documentId}: its editor source is unavailable.`,
        );
      }

      if (!this.hasUnpersistedChanges()) return;
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
        "This file changed outside the current editor while local changes were pending.",
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
    if (saveMode === "auto" && this.dirty) this.scheduleAutomaticCommit();
    if (saveMode === "manual") this.clearAutomaticTimers();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAutomaticTimers();
    this.clearSavedStatusTimer();

    const source = this.source;
    this.source = null;
    if (source && this.hasUnpersistedChanges()) {
      void this.enqueue(source.readSnapshot(), "destroy").catch(() => undefined);
    }
    this.listeners.clear();
  }

  private scheduleAutomaticCommit(): void {
    if (this.disposed) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.requestAutomaticSave("idle").catch(() => undefined);
    }, normalizeDelay(this.persistence.policy.idleDelayMs));

    if (this.maxDelayTimer === null) {
      this.maxDelayTimer = setTimeout(() => {
        this.maxDelayTimer = null;
        void this.requestAutomaticSave("max-delay").catch(() => undefined);
      }, normalizeDelay(this.persistence.policy.maxDelayMs));
    }
  }

  private async requestAutomaticSave(reason: Extract<DocumentPersistenceReason, "idle" | "max-delay">) {
    const source = this.source;
    if (!source) return;
    await this.enqueue(source.readSnapshot(), reason);
  }

  private enqueue(snapshot: EditorSourceSnapshot, reason: DocumentPersistenceReason): Promise<void> {
    this.clearAutomaticTimers();

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
        this.scheduleAutomaticCommit();
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
      if (this.pending) {
        this.dirty = true;
        this.publish("dirty", toErrorMessage(failure));
      } else {
        this.dirty = true;
        this.publish("error", toErrorMessage(failure));
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
      if (this.saveMode === "auto" && !this.disposed) this.scheduleAutomaticCommit();
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

  private publish(status: DocumentSessionState["status"], error: string | null): void {
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

  private clearAutomaticTimers(): void {
    this.clearIdleTimer();
    if (this.maxDelayTimer !== null) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
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

function normalizeDelay(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameState(left: DocumentSessionState, right: DocumentSessionState): boolean {
  return (
    left.status === right.status
    && left.error === right.error
    && left.currentRevision === right.currentRevision
    && left.persistedRevision === right.persistedRevision
    && left.storageVersion === right.storageVersion
  );
}
