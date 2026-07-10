export type AgentProviderId = "codex";

export type AgentReadinessStatus =
  | "not-installed"
  | "installed-not-authenticated"
  | "unsupported-version"
  | "ready"
  | "error";

export type AgentProviderReadiness = {
  provider: AgentProviderId;
  status: AgentReadinessStatus;
  version: string | null;
  minimumVersion: string | null;
  message: string;
  diagnostic?: string;
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
  attachments: boolean;
  modelSelection: boolean;
  usage: boolean;
  accountState: boolean;
};

export type AgentAccountState = {
  account: {
    type: string;
    email: string | null;
    planType: string | null;
  } | null;
  requiresOpenaiAuth: boolean;
  error?: string;
};

export type AgentModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
};

export type AgentSessionMetadata = {
  id: string;
  provider: AgentProviderId;
  providerSessionId: string | null;
  workspaceRoot: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  terminalState: AgentTurnTerminalState | "idle" | "running" | "provider-exited";
  selectedModel: string | null;
  activeTurnId: string | null;
  lastSequence: number;
};

export type AgentTurnTerminalState = "completed" | "failed" | "interrupted";

export type AgentEventType =
  | "session.started"
  | "session.resumed"
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
  | "provider.warning"
  | "provider.error";

export type AgentEvent = {
  schemaVersion: 1;
  sequence: number;
  sessionId: string;
  provider: AgentProviderId;
  providerSessionId: string | null;
  turnId: string | null;
  itemId: string | null;
  emittedAt: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
};

export type AgentProviderInspection = {
  readiness: AgentProviderReadiness;
  account: AgentAccountState | null;
  models: AgentModel[];
  capabilities: AgentCapabilities | null;
  warnings: string[];
};

export type AgentSessionSnapshot = {
  session: AgentSessionMetadata;
  account: AgentAccountState | null;
  models: AgentModel[];
  capabilities: AgentCapabilities | null;
  events: AgentEvent[];
  partial: boolean;
  firstAvailableSequence: number;
  lastSequence: number;
};

export type AgentModelsListRequest = {
  rootPath?: string | null;
  refresh?: boolean;
};

export type AgentAccountReadRequest = {
  rootPath?: string | null;
  refresh?: boolean;
};

export type AgentSessionCreateRequest = {
  rootPath: string;
  model?: string | null;
};

export type AgentSessionResumeRequest = {
  rootPath: string;
};

export type AgentSessionCloseRequest = {
  sessionId: string;
  removePersistence?: boolean;
};

export type AgentTurnStartRequest = {
  sessionId: string;
  prompt: string;
  model?: string | null;
};

export type AgentTurnSteerRequest = {
  sessionId: string;
  turnId: string;
  message: string;
};

export type AgentTurnInterruptRequest = {
  sessionId: string;
  turnId: string;
};

export type AgentApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type AgentApprovalResolution = {
  sessionId: string;
  turnId: string;
  requestId: string;
  decision: AgentApprovalDecision;
};

export type AgentQuestionResolution = {
  sessionId: string;
  turnId: string;
  requestId: string;
  answer?: string | string[] | null;
};

export type AgentReplayRequest = {
  sessionId: string;
  afterSequence: number;
};

export type AgentSessionExitEvent = {
  sessionId: string;
  reason: "closed" | "provider-exited";
};
