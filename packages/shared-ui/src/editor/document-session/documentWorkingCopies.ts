import type { DocumentPersistencePort } from "../../core/types";
import { DocumentEditingSession } from "./DocumentEditingSession";
import { registerActiveDocumentSession } from "./activeDocumentSessions";
import type {
  DocumentPersistedCommit,
  DocumentSessionDrainReason,
  DocumentSessionStatus,
} from "./types";
import type { EditorSaveMode } from "../registry/viewerTypes";
import {
  createDocumentIdentity,
  getDocumentIdentityKey,
  type DocumentIdentity,
} from "./documentIdentity";

type WorkingCopyBinding = {
  session: DocumentEditingSession;
  identity: DocumentIdentity;
  onPersistedRef: { current: ((commit: DocumentPersistedCommit) => void) | undefined };
  owner: Map<string, WorkingCopyBinding>;
  unsubscribeState: () => void;
  unregister: () => void;
};

const bindingsByStorageIdentity = new Map<string, Map<string, WorkingCopyBinding>>();
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
  const identity = createDocumentIdentity(options.persistence, options.documentId);
  let bindings = bindingsByStorageIdentity.get(identity.storageIdentity);
  if (!bindings) {
    bindings = new Map();
    bindingsByStorageIdentity.set(identity.storageIdentity, bindings);
  }
  const existing = bindings.get(identity.resourcePath);
  if (existing) {
    existing.onPersistedRef.current = options.onPersisted;
    existing.session.setSaveMode(options.saveMode);
    return existing;
  }

  const onPersistedRef = { current: options.onPersisted };
  const session = new DocumentEditingSession({
    documentId: identity.resourcePath,
    initialContent: options.initialContent,
    initialVersion: options.initialVersion,
    saveMode: options.saveMode,
    persistence: options.persistence,
    onPersisted: (commit) => onPersistedRef.current?.(commit),
  });
  const binding: WorkingCopyBinding = {
    session,
    identity,
    onPersistedRef,
    owner: bindings,
    unsubscribeState: () => undefined,
    unregister: () => undefined,
  };
  binding.unregister = registerActiveDocumentSession(session);
  binding.unsubscribeState = session.subscribe(publishStatuses);
  bindings.set(identity.resourcePath, binding);
  allBindings.add(binding);
  publishStatuses();
  return binding;
}

export async function closeDocumentWorkingCopy(identity: DocumentIdentity): Promise<void> {
  const key = getDocumentIdentityKey(identity);
  const matches = [...allBindings].filter((binding) => getDocumentIdentityKey(binding.identity) === key);
  await flushAndRelease(matches, "document-close");
}

export async function closeDocumentWorkingCopiesUnderResource(
  storageIdentity: string,
  resource: string,
): Promise<void> {
  const canonicalResource = createDocumentIdentity({ storageIdentity }, resource).resourcePath;
  const matches = [...allBindings].filter(({ session }) => (
    session.documentId === canonicalResource || session.documentId.startsWith(`${canonicalResource}/`)
  )).filter(({ identity }) => (
    identity.storageIdentity === storageIdentity
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
  if (binding.owner.size === 0) {
    bindingsByStorageIdentity.delete(binding.identity.storageIdentity);
  }
  binding.unsubscribeState();
  binding.unregister();
  publishStatuses();
}

function publishStatuses(): void {
  statusSnapshot = new Map(
    [...allBindings].map(({ identity, session }) => [
      getDocumentIdentityKey(identity),
      session.getState().status,
    ]),
  );
  registryListeners.forEach((listener) => listener());
}
