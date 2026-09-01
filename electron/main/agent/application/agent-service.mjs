import { createAgentRuntimeCatalog } from "./agent-runtime-catalog.mjs";
import { createRuntimeResolutionCoordinator } from "./runtime-resolution/runtime-resolution-coordinator.mjs";
import { createAgentEventJournal } from "./agent-event-journal.mjs";
import { createNativeConversationIndexer } from "./native-conversation-indexer.mjs";
import { AgentSessionStore } from "./agent-session-store.mjs";
import { createAgentProcessSupervisor } from "./processes/agent-process-supervisor.mjs";
import { createAgentSessionCommands } from "./session/agent-session-commands.mjs";
import { createAgentSessionLifecycle } from "./session/agent-session-lifecycle.mjs";
import { createAgentSessionRuntime } from "./session/agent-session-runtime.mjs";
import { createAgentTurnCoordinator } from "./turn/agent-turn-coordinator.mjs";

/**
 * Provider-neutral Agent application facade.
 *
 * This file is intentionally composition-only: command behavior belongs to
 * focused coordinators, while the returned API remains the stable boundary
 * consumed by Electron IPC.
 */
export function createAgentService({
  runtimeRegistry,
  sessionCache = null,
  persistence: legacyPersistence = null,
  logger = console,
  attachmentStore = null,
  processSupervisor = createAgentProcessSupervisor(),
}) {
  if (!runtimeRegistry || typeof runtimeRegistry.createAdapter !== "function") {
    throw new TypeError("AgentService requires a provider-neutral runtime registry.");
  }
  const cache = sessionCache ?? legacyPersistence;
  if (!cache || typeof cache.save !== "function") {
    throw new TypeError("AgentService requires a session repository.");
  }

  let lifecycle = null;
  const sessionStore = new AgentSessionStore({
    onOwnerDestroyed: (ownerId) => lifecycle?.closeSessionsForWindow(ownerId),
  });
  const runtimeResolutionCoordinator = createRuntimeResolutionCoordinator({
    runtimeRegistry,
    processSupervisor,
  });
  const runtimeCatalog = createAgentRuntimeCatalog({ runtimeResolutionCoordinator });
  const nativeConversationIndexer = createNativeConversationIndexer({
    runtimeRegistry,
    runtimeResolutionCoordinator,
    sessionRepository: cache,
    processSupervisor,
  });
  const journal = createAgentEventJournal({ sessionCache: cache, logger });
  const runtimeSession = createAgentSessionRuntime({
    runtimeRegistry,
    runtimeResolutionCoordinator,
    processSupervisor,
    sessionStore,
    cache,
    attachmentStore,
    logger,
    emit: journal.emit,
    persistNow: journal.persistNow,
    sendSessionExit: journal.sendSessionExit,
  });
  lifecycle = createAgentSessionLifecycle({
    runtimeRegistry,
    runtimeResolutionCoordinator,
    sessionStore,
    cache,
    attachmentStore,
    logger,
    runtimeSession,
    emit: journal.emit,
    persistSoon: journal.persistSoon,
  });
  const turns = createAgentTurnCoordinator({
    runtimeSession,
    emit: journal.emit,
    persistSoon: journal.persistSoon,
  });
  const commands = createAgentSessionCommands({
    runtimeResolutionCoordinator,
    nativeConversationIndexer,
    sessionStore,
    cache,
    runtimeSession,
    emit: journal.emit,
    persistNow: journal.persistNow,
  });

  return {
    discoverProviders: (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.discover(request, workspaceRoot),
    listModels: (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.listModels(request, workspaceRoot),
    readAccount: (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.readAccount(request, workspaceRoot),
    getReferenceInputCapabilities: turns.getReferenceInputCapabilities,
    createSession: lifecycle.createSession,
    resumeSession: lifecycle.resumeSession,
    openSession: lifecycle.openSession,
    startTurn: turns.startTurn,
    steerTurn: turns.steerTurn,
    interruptTurn: turns.interruptTurn,
    resolveApproval: turns.resolveApproval,
    resolveQuestion: turns.resolveQuestion,
    replay: turns.replay,
    listSessions: commands.listSessions,
    forkSession: commands.forkSession,
    archiveSession: commands.archiveSession,
    deleteSession: commands.deleteSession,
    compactSession: commands.compactSession,
    closeSession: lifecycle.closeSession,
    closeSessionsForWindow: lifecycle.closeSessionsForWindow,
    closeSessionsForWorkspaceRoot: lifecycle.closeSessionsForWorkspaceRoot,
    closeAll: lifecycle.closeAll,
    getSessionCount: lifecycle.getSessionCount,
    getRetainedSessionCount: lifecycle.getRetainedSessionCount,
    hasRuntimeResources: lifecycle.hasRuntimeResources,
  };
}
