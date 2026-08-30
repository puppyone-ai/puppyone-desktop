import type {
  AgentAccountReadRequest,
  AgentAccountState,
  AgentApprovalResolution,
  AgentEvent,
  AgentLocalConnectionsRequest,
  AgentLocalConnectionsSnapshot,
  AgentModel,
  AgentModelsListRequest,
  AgentRuntimeInspection,
  AgentQuestionResolution,
  AgentDraftReference,
  AgentReferenceRevokeRequest,
  AgentReferenceStageRequest,
  AgentReplayRequest,
  AgentRuntimeRequest,
  AgentSessionCloseRequest,
  AgentSessionCreateRequest,
  AgentSessionExitEvent,
  AgentSessionMutationRequest,
  AgentSessionResumeRequest,
  AgentSessionSnapshot,
  AgentSessionsListRequest,
  AgentSessionsListResponse,
  AgentTurnInterruptRequest,
  AgentTurnStartRequest,
  AgentTurnSteerRequest,
  AgentWorkspaceReferenceResolveRequest,
} from "../domain/agent-contract";

/** Renderer-side port implemented by the typed Electron preload adapter. */
export interface AgentClientPort {
  discoverAgentRuntimes(request?: AgentRuntimeRequest): Promise<AgentRuntimeInspection>;
  discoverLocalAgentConnections(request?: AgentLocalConnectionsRequest): Promise<AgentLocalConnectionsSnapshot>;
  listAgentModels(request?: AgentModelsListRequest): Promise<AgentModel[]>;
  readAgentAccount(request?: AgentAccountReadRequest): Promise<AgentAccountState | null>;
  createAgentSession(request: AgentSessionCreateRequest): Promise<AgentSessionSnapshot>;
  resumeAgentSession(request: AgentSessionResumeRequest): Promise<AgentSessionSnapshot | null>;
  replayAgentSession(request: AgentReplayRequest): Promise<AgentSessionSnapshot>;
  listAgentSessions(request: AgentSessionsListRequest): Promise<AgentSessionsListResponse>;
  forkAgentSession(request: AgentSessionMutationRequest): Promise<AgentSessionSnapshot>;
  archiveAgentSession(request: AgentSessionMutationRequest): Promise<{ sessionId: string; archived: boolean }>;
  deleteAgentSession(request: AgentSessionMutationRequest): Promise<{ sessionId: string; deleted: boolean; nativeDeleted: boolean }>;
  closeAgentSession(request: AgentSessionCloseRequest): Promise<{ sessionId: string; closed: boolean }>;
  stageAgentAttachments(request: AgentReferenceStageRequest): Promise<AgentDraftReference[]>;
  revokeAgentAttachments(request: AgentReferenceRevokeRequest): Promise<{ revoked: number }>;
  resolveAgentWorkspaceReferences(request: AgentWorkspaceReferenceResolveRequest): Promise<AgentDraftReference[]>;
  pickAgentWorkspaceReferences(request: Pick<AgentWorkspaceReferenceResolveRequest, "rootPath">): Promise<AgentDraftReference[]>;
  startAgentTurn(request: AgentTurnStartRequest): Promise<{ sessionId: string; turnId: string }>;
  steerAgentTurn(request: AgentTurnSteerRequest): Promise<{ sessionId: string; turnId: string; steered: boolean }>;
  interruptAgentTurn(request: AgentTurnInterruptRequest): Promise<{ sessionId: string; turnId: string; interruptRequested: boolean }>;
  compactAgentSession(request: { rootPath: string; sessionId: string }): Promise<{ sessionId: string; compacted: boolean }>;
  resolveAgentApproval(request: AgentApprovalResolution): Promise<{
    sessionId: string;
    requestId: string;
    decision: AgentApprovalResolution["decision"];
  }>;
  resolveAgentQuestion(request: AgentQuestionResolution): Promise<{ sessionId: string; requestId: string }>;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onAgentSessionExit(callback: (event: AgentSessionExitEvent) => void): () => void;
}

export type AgentClientProvider = () => AgentClientPort | undefined;
