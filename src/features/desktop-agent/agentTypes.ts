/** Renderer-safe DTOs. Runtime-native payloads are normalized in Electron main. */
export type AgentRuntimeId = string;
/** @deprecated Compatibility alias for the original Codex-only slice. */
export type AgentProviderId = AgentRuntimeId;

export type AgentReadinessStatus =
  | "not-installed"
  | "installed-not-authenticated"
  | "unsupported-version"
  | "ready"
  | "error";

export type AgentRuntimeDescriptor = {
  id: AgentRuntimeId;
  displayName: string;
  description?: string;
  kind?: "harness" | "direct-cli" | string;
  iconKey?: string;
  priority?: number;
  version?: string | null;
  source?: string | null;
  compatibility?: string | null;
};

export type AgentProviderReadiness = {
  runtimeId?: AgentRuntimeId;
  provider: AgentProviderId;
  status: AgentReadinessStatus;
  version: string | null;
  minimumVersion: string | null;
  message: string;
  source?: string;
  compatibility?: string;
  diagnostic?: string;
};

export type AgentRuntimeCatalogEntry = {
  descriptor: AgentRuntimeDescriptor;
  readiness: AgentProviderReadiness;
};

export type AgentCapabilities = {
  streamingText: boolean;
  structuredToolEvents: boolean;
  commandOutputStreaming: boolean;
  fileChangeEvents: boolean;
  manualApprovals: boolean;
  structuredQuestions: boolean;
  resume: boolean;
  fork: boolean;
  steer: boolean;
  queue: boolean;
  attachments: boolean;
  contextReferences: boolean;
  modelSelection: boolean;
  modeSelection: boolean;
  slashCommands: boolean;
  sessionHistory: boolean;
  usage: boolean;
  accountState: boolean;
  mcp: boolean;
  skills: boolean;
  compaction: boolean;
};

export type AgentAccountState = {
  account: {
    type: string;
    email: string | null;
    planType: string | null;
  } | null;
  requiresOpenaiAuth: boolean;
  requiresRuntimeSetup?: boolean;
  error?: string;
};

export type AgentModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  providerId?: string;
  modelId?: string;
  variants?: string[];
  contextWindow?: number | null;
};

export type AgentMode = {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
};

export type AgentCommand = {
  name: string;
  description: string;
  source: string;
};

export type AgentSessionMetadata = {
  id: string;
  runtimeId?: AgentRuntimeId;
  runtime?: AgentRuntimeDescriptor | null;
  provider: AgentProviderId;
  providerSessionId: string | null;
  workspaceRoot: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  terminalState: AgentTurnTerminalState | "idle" | "running" | "provider-exited";
  selectedModel: string | null;
  selectedMode?: string | null;
  activeTurnId: string | null;
  lastSequence: number;
};

export type AgentSessionListItem = Omit<AgentSessionMetadata, "activeTurnId"> & {
  archivedAt?: string | null;
  partial?: boolean;
};

export type AgentTurnTerminalState = "completed" | "failed" | "interrupted";

export type AgentEventType =
  | "session.started"
  | "session.resumed"
  | "session.updated"
  | "session.closed"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "turn.interrupted"
  | "assistant.delta"
  | "assistant.completed"
  | "reasoning.summary.delta"
  | "plan.updated"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "command.output.delta"
  | "file.change.updated"
  | "usage.updated"
  | "approval.requested"
  | "approval.resolved"
  | "question.requested"
  | "question.resolved"
  | "provider.activity"
  | "provider.warning"
  | "provider.error";

export type AgentEvent = {
  schemaVersion: 1;
  sequence: number;
  sessionId: string;
  runtimeId?: AgentRuntimeId;
  provider: AgentProviderId;
  providerSessionId: string | null;
  turnId: string | null;
  itemId: string | null;
  emittedAt: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
};

export type AgentProviderInspection = {
  runtimes?: AgentRuntimeCatalogEntry[];
  selectedRuntimeId?: AgentRuntimeId | null;
  runtime?: AgentRuntimeDescriptor;
  readiness: AgentProviderReadiness;
  account: AgentAccountState | null;
  models: AgentModel[];
  modes?: AgentMode[];
  commands?: AgentCommand[];
  capabilities: AgentCapabilities | null;
  warnings: string[];
};

export type AgentSessionSnapshot = {
  session: AgentSessionMetadata;
  runtime?: AgentRuntimeDescriptor;
  account: AgentAccountState | null;
  models: AgentModel[];
  modes?: AgentMode[];
  commands?: AgentCommand[];
  capabilities: AgentCapabilities | null;
  events: AgentEvent[];
  partial: boolean;
  firstAvailableSequence: number;
  lastSequence: number;
};

export type AgentRuntimeRequest = {
  rootPath?: string | null;
  runtimeId?: AgentRuntimeId | null;
  refresh?: boolean;
};

export type AgentModelsListRequest = AgentRuntimeRequest;
export type AgentAccountReadRequest = AgentRuntimeRequest;

export type AgentSessionCreateRequest = {
  rootPath: string;
  runtimeId?: AgentRuntimeId | null;
  model?: string | null;
  mode?: string | null;
};

export type AgentSessionResumeRequest = {
  rootPath: string;
  sessionId?: string | null;
  runtimeId?: AgentRuntimeId | null;
};

export type AgentSessionsListRequest = {
  rootPath: string;
  runtimeId?: AgentRuntimeId | null;
  includeArchived?: boolean;
};

export type AgentSessionCloseRequest = {
  rootPath: string;
  sessionId: string;
  removePersistence?: boolean;
};

export type AgentSessionMutationRequest = {
  rootPath: string;
  sessionId: string;
  messageId?: string | null;
  archiveNative?: boolean;
  deleteNative?: boolean;
};

export type AgentFileReference = {
  path: string;
  name?: string | null;
};

export type AgentTurnStartRequest = {
  rootPath: string;
  sessionId: string;
  prompt: string;
  model?: string | null;
  mode?: string | null;
  attachments?: AgentFileReference[];
  contextReferences?: AgentFileReference[];
};

export type AgentTurnSteerRequest = {
  rootPath: string;
  sessionId: string;
  turnId: string;
  message: string;
};

export type AgentTurnInterruptRequest = {
  rootPath: string;
  sessionId: string;
  turnId: string;
};

export type AgentApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type AgentApprovalResolution = {
  rootPath: string;
  sessionId: string;
  turnId: string;
  requestId: string;
  decision: AgentApprovalDecision;
};

export type AgentQuestionResolution = {
  rootPath: string;
  sessionId: string;
  turnId: string;
  requestId: string;
  answer?: string | string[] | string[][] | null;
  answers?: string[][] | null;
  rejected?: boolean;
};

export type AgentReplayRequest = {
  rootPath: string;
  sessionId: string;
  afterSequence: number;
};

export type AgentSessionExitEvent = {
  sessionId: string;
  reason: "closed" | "provider-exited";
};
