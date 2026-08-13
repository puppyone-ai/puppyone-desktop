import type { DocumentPersistencePort } from "../../core/types";
import { DocumentEditingSession } from "./DocumentEditingSession";
import { registerActiveDocumentSession } from "./activeDocumentSessions";
import type {
  DocumentPersistedCommit,
  DocumentSessionDrainReason,
  DocumentSessionStatus,
} from "./types";
import type { EditorSaveMode } from "../registry/viewerTypes";

type WorkingCopyBinding = {
  session: DocumentEditingSession;
  onPersistedRef: { current: ((commit: DocumentPersistedCommit) => void) | undefined };
  owner: Map<string, WorkingCopyBinding>;
  unsubscribeState: () => void;
  unregister: () => void;
};

const bindingsByPersistence = new WeakMap<DocumentPersistencePort, Map<string, WorkingCopyBinding>>();
const allBindings = new Set<WorkingCopyBinding>();
const registryListeners = new Set<() => void>();
let statusSnapshot: ReadonlyMap<string, DocumentSessionStatus> = new Map();

export function getDocumentWorkingCopyStatuses(): ReadonlyMap<string, DocumentSessionStatus> {
  return statusSnapshot;
}

export function subscribeDocumentWorkingCopyStatuses(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

export function getOrCreateDocumentWorkingCopy(options: Readonly<{
  documentId: string;
  initialContent: string;
  initialVersion?: string | null;
  saveMode: EditorSaveMode;
  persistence: DocumentPersistencePort;
  onPersisted?: (commit: DocumentPersistedCommit) => void;
}>): WorkingCopyBinding {
  let bindings = bindingsByPersistence.get(options.persistence);
  if (!bindings) {
    bindings = new Map();
    bindingsByPersistence.set(options.persistence, bindings);
  }
  const existing = bindings.get(options.documentId);
  if (existing) {
    existing.onPersistedRef.current = options.onPersisted;
    existing.session.setSaveMode(options.saveMode);
    return existing;
  }

  const onPersistedRef = { current: options.onPersisted };
  const session = new DocumentEditingSession({
    documentId: options.documentId,
    initialContent: options.initialContent,
    initialVersion: options.initialVersion,
    saveMode: options.saveMode,
    persistence: options.persistence,
    onPersisted: (commit) => onPersistedRef.current?.(commit),
  });
  const binding: WorkingCopyBinding = {
    session,
    onPersistedRef,
    owner: bindings,
    unsubscribeState: () => undefined,
    unregister: () => undefined,
  };
  binding.unregister = registerActiveDocumentSession(session);
  binding.unsubscribeState = session.subscribe(publishStatuses);
  bindings.set(options.documentId, binding);
  allBindings.add(binding);
  publishStatuses();
  return binding;
}

export async function closeDocumentWorkingCopy(documentId: string): Promise<void> {
  const matches = [...allBindings].filter((binding) => binding.session.documentId === documentId);
  await flushAndRelease(matches, "document-close");
}

export async function closeDocumentWorkingCopiesUnderResource(resource: string): Promise<void> {
  const matches = [...allBindings].filter(({ session }) => (
    session.documentId === resource || session.documentId.startsWith(`${resource}/`)
  ));
  await flushAndRelease(matches, "document-close");
}

export async function closeAllDocumentWorkingCopies(
  reason: Extract<DocumentSessionDrainReason, "workspace-switch" | "app-close">,
): Promise<void> {
  await flushAndRelease([...allBindings], reason);
}

async function flushAndRelease(
  bindings: readonly WorkingCopyBinding[],
  reason: DocumentSessionDrainReason,
): Promise<void> {
  const results = await Promise.allSettled(bindings.map((binding) => binding.session.flushCurrent(reason)));
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  if (failures.length > 0) {
    throw new AggregateError(failures, `Unable to close ${failures.length} document working cop${failures.length === 1 ? "y" : "ies"}.`);
  }
  bindings.forEach(releaseBinding);
  await Promise.resolve();
}

function releaseBinding(binding: WorkingCopyBinding): void {
  if (!allBindings.delete(binding)) return;
  binding.owner.delete(binding.session.documentId);
  binding.unsubscribeState();
  binding.unregister();
  publishStatuses();
}

function publishStatuses(): void {
  statusSnapshot = new Map(
    [...allBindings].map(({ session }) => [session.documentId, session.getState().status]),
  );
  registryListeners.forEach((listener) => listener());
}
