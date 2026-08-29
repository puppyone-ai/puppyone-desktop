import { registerGitAutoCommitIpcHandlers } from "../ipc/git-auto-commit-ipc.mjs";
import { createGitAutoCommitOperationLease } from "./operation-lease.mjs";
import { createGitAutoCommitPreferenceStore } from "./preference-store.mjs";
import { createGitAutoCommitService } from "./service.mjs";
import { createGitAutoCommitTransactionJournal } from "./transaction-journal.mjs";

/**
 * Optional-feature boundary for Git Auto Commit.
 *
 * An unavailable release gets a null host before any persistence, scheduler,
 * watcher, IPC, or Git component is constructed. The Electron composition root
 * therefore depends on one stable lifecycle interface instead of feature
 * internals or release-gate branches spread across the application.
 */
export function createGitAutoCommitHost({
  available = false,
  preferenceFilePath,
  gitOperationCoordinator,
  documentDurabilityCoordinator,
  workspaceMutationTracker,
  workspaceWatchService,
  gitMetadataWatchService = null,
  logger = console,
} = {}) {
  if (!available) return createUnavailableGitAutoCommitHost();

  const service = createGitAutoCommitService({
    releaseAvailable: true,
    preferenceStore: createGitAutoCommitPreferenceStore({ filePath: preferenceFilePath }),
    transactionJournal: createGitAutoCommitTransactionJournal(),
    operationLease: createGitAutoCommitOperationLease(),
    gitOperationCoordinator,
    documentDurabilityCoordinator,
    workspaceMutationTracker,
    workspaceWatchService,
    gitMetadataWatchService,
    logger,
  });

  return Object.freeze({
    available: true,
    registerIpcHandlers({ ipcMain, authorizeWorkspaceRoot }) {
      registerGitAutoCommitIpcHandlers({
        ipcMain,
        authorizeWorkspaceRoot,
        gitAutoCommitService: service,
      });
      return true;
    },
    assignWorkspace: service.assignWorkspace,
    releaseWindow: service.releaseWindow,
    reconcileWindow: service.reconcileWindow,
    reconcileAfterResume: service.reconcileAfterResume,
    closeAll: service.closeAll,
  });
}

function createUnavailableGitAutoCommitHost() {
  return Object.freeze({
    available: false,
    registerIpcHandlers: () => false,
    assignWorkspace: async () => undefined,
    releaseWindow: () => undefined,
    reconcileWindow: () => undefined,
    reconcileAfterResume: () => undefined,
    closeAll: () => undefined,
  });
}
