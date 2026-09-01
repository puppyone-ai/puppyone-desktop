/** Serializable DTOs shared by Renderer, preload declarations, and Electron main contract tests. */
export type AgentRuntimeId = string;
/** @deprecated Compatibility alias for the original Codex-only persistence format. */
export type AgentProviderId = AgentRuntimeId;

export type AgentReadinessStatus =
  | "not-installed"
  | "installed-not-authenticated"
  | "unsupported-version"
  | "protocol-unavailable"
  | "ready"
  | "error";

/** Exact readiness reason. Presentation and recovery routing use this code, not backend prose. */
export type AgentReadinessCode =
  | "READY"
  | "RUNTIME_NOT_INSTALLED"
  | "RUNTIME_DISCOVERY_FAILED"
  | "RUNTIME_INSPECTION_FAILED"
  | "RUNTIME_VERSION_UNVERIFIED"
  | "RUNTIME_VERSION_UNSUPPORTED"
  | "RUNTIME_SETUP_REQUIRED"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_EXPIRED"
  | "AUTHENTICATION_PROBE_FAILED"
  | "AUTHENTICATION_PROBE_CRASHED"
  | "AUTHENTICATION_PROBE_TIMED_OUT"
  | "AUTHENTICATION_STATUS_UNKNOWN"
  | "PROVIDER_CREDENTIALS_REJECTED"
  | "PROTOCOL_UNAVAILABLE"
  | "PROTOCOL_PROBE_FAILED";

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
  distribution?: "bundled" | "sdk-bundled" | "user-installed" | string;
  execution?: {
    kind: string;
    distribution: string;
    controller: string;
  };
  protocol?: {
    kind: string;
    transport: string;
  };
  integration?: {
    kind: string;
    adapter: string;
  };
  trust?: {
    level: string;
    publisher: string;
  };
  ownership?: {
    harness: string;
    credentials: string[];
    models: string;
    billing: string[];
    session: string;
  };
};

export type AgentRuntimeReadiness = {
  runtimeId?: AgentRuntimeId;
  provider: AgentProviderId;
  status: AgentReadinessStatus;
  code: AgentReadinessCode;
  version: string | null;
  minimumVersion: string | null;
  message: string;
  source?: string;
  compatibility?: string;
  diagnostic?: string;
  selectable?: boolean;
};

/** @deprecated Use AgentRuntimeReadiness. */
export type AgentProviderReadiness = AgentRuntimeReadiness;
/** @deprecated Use AgentRuntimeReadiness. */
export type AgentBackendReadiness = AgentRuntimeReadiness;

export type AgentRuntimeCatalogEntry = {
  descriptor: AgentRuntimeDescriptor;
  readiness: AgentRuntimeReadiness;
};

export type AgentAttachmentKind = "image" | "text" | "audio" | "video" | "binary";

/** Renderer-safe admission policy. Native wire transports stay private to each runtime adapter. */
export type AgentAttachmentInputCapability = {
  accepted: boolean;
  mimeTypes?: string[];
  extensions?: string[];
  maxBytes?: number;
};

export type AgentReferenceInputCapabilities = {
  schemaVersion: 1;
  workspace: {
    files: boolean;
    directories: boolean;
  };
  attachments: Record<AgentAttachmentKind, AgentAttachmentInputCapability>;
  limits: {
    maxCount: number;
    maxBytesPerReference: number;
    maxTotalBytes: number;
  };
  /** Whether the native steer operation accepts reference inputs. */
  steer: boolean;
  /** Whether an otherwise-empty prompt is accepted with references. */
  attachmentOnly: boolean;
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
  /** Changes whenever the runtime's effective negotiated capability surface changes. */
  revision?: string;
  /** Versioned native protocol and explicitly negotiated extension metadata. */
  protocol?: {
    name: string;
    version: string | number;
    agentVersion?: string | null;
    extensions?: Record<string, number>;
  };
  /** Operation timing rules that cannot be represented by compatibility booleans. */
  constraints?: {
    modelSwitch?: "turn-boundary" | "session-boundary" | "unsupported";
    modeSwitch?: "turn-boundary" | "session-boundary" | "unsupported";
    forkRequiresIdle?: boolean;
    compactionRequiresIdle?: boolean;
  };
  /** Fine-grained native input support. Legacy booleans remain a migration projection. */
  referenceInputs?: AgentReferenceInputCapabilities;
};

export type AgentAccountState = {
  account: {
    type: string;
    email: string | null;
    planType: string | null;
  } | null;
  requiresOpenaiAuth: boolean;
  requiresRuntimeSetup?: boolean;
  setupReason?: "authentication-required" | "authentication-expired" | "runtime-setup-required";
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
  defaultVariant?: string | null;
  contextWindow?: number | null;
};

export type AgentInferenceProvider = {
  id: string;
  displayName: string;
  source?: "env" | "config" | "custom" | "api" | string | null;
  defaultModel?: string | null;
  modelCount: number;
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
  selectedEffort?: string | null;
  selectedMode?: string | null;
  activeTurnId: string | null;
  lastSequence: number;
};

export type AgentSessionListItem = Omit<AgentSessionMetadata, "activeTurnId"> & {
  archivedAt?: string | null;
  partial?: boolean;
  /** Who first recorded the locator; never implies transcript ownership. */
  origin?: "puppyone" | "native-discovery";
};

export type AgentSessionDiscoveryStatus = "not-requested" | "unsupported" | "partial" | "complete" | "failed";

export type AgentSessionsListResponse = {
  sessions: AgentSessionListItem[];
  discovery: {
    runtimeId: AgentRuntimeId | null;
    status: AgentSessionDiscoveryStatus;
    nextCursor: string | null;
    indexed: number;
    warnings: string[];
  };
  warnings: string[];
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
  | "provider.connection.updated"
  | "provider.warning"
  | "provider.error";

type AgentEventPayloadBase = Record<string, unknown>;

export type AgentEventPayloadMap = {
  "session.started": AgentEventPayloadBase & { title?: string; status?: string };
  "session.resumed": AgentEventPayloadBase & { title?: string; status?: string };
  "session.updated": AgentEventPayloadBase & { title?: string; status?: string };
  "session.closed": AgentEventPayloadBase & { status?: string };
  "turn.started": AgentEventPayloadBase & {
    prompt?: string;
    status?: string;
    referenceDisplays?: AgentReferenceDisplay[];
    promptMentions?: AgentPromptReferenceMention[];
  };
  "turn.completed": AgentEventPayloadBase & { status?: string; durationMs?: number };
  "turn.failed": AgentEventPayloadBase & { status?: string; message?: string; durationMs?: number };
  "turn.interrupted": AgentEventPayloadBase & { status?: string; message?: string; durationMs?: number };
  "assistant.delta": AgentEventPayloadBase & { delta?: string; text?: string };
  "assistant.completed": AgentEventPayloadBase & { text?: string };
  "reasoning.summary.delta": AgentEventPayloadBase & { delta?: string; text?: string };
  "plan.updated": AgentEventPayloadBase & { steps?: unknown[]; explanation?: string };
  "tool.started": AgentEventPayloadBase & AgentActivityPayload;
  "tool.progress": AgentEventPayloadBase & AgentActivityPayload;
  "tool.completed": AgentEventPayloadBase & AgentActivityPayload;
  "command.output.delta": AgentEventPayloadBase & AgentActivityPayload & { delta?: string };
  "file.change.updated": AgentEventPayloadBase & AgentActivityPayload;
  "usage.updated": AgentEventPayloadBase & { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  "approval.requested": AgentEventPayloadBase & AgentBlockingPayload;
  "approval.resolved": AgentEventPayloadBase & AgentBlockingPayload & { decision?: AgentApprovalDecision };
  "question.requested": AgentEventPayloadBase & AgentBlockingPayload & { questions: unknown[] };
  "question.resolved": AgentEventPayloadBase & AgentBlockingPayload & { rejected?: boolean };
  "provider.activity": AgentEventPayloadBase & AgentActivityPayload;
  "provider.connection.updated": AgentEventPayloadBase & {
    state: "reconnecting" | "fallback" | "connected";
    message?: string;
    attempt?: number;
    maxAttempts?: number;
  };
  "provider.warning": AgentEventPayloadBase & { message?: string };
  "provider.error": AgentEventPayloadBase & { message?: string };
};

type AgentActivityPayload = {
  kind?: string;
  tool?: string;
  label?: string;
  status?: string;
  input?: Record<string, unknown> | null;
  command?: string | null;
  path?: string | null;
  query?: string | null;
  changes?: unknown[];
  outputPreview?: string;
};

type AgentBlockingPayload = {
  requestId: string;
  kind?: string;
};

export type AgentEventEnvelope<TType extends AgentEventType> = {
  schemaVersion: 1;
  sequence: number;
  sessionId: string;
  runtimeId?: AgentRuntimeId;
  provider: AgentProviderId;
  providerSessionId: string | null;
  turnId: string | null;
  itemId: string | null;
  emittedAt: string;
  type: TType;
  payload: AgentEventPayloadMap[TType];
};

/** A true discriminated union: narrowing `type` also narrows `payload`. */
export type AgentEvent<TType extends AgentEventType = AgentEventType> = TType extends AgentEventType
  ? AgentEventEnvelope<TType>
  : never;

export type AgentRuntimeInspection = {
  runtimes?: AgentRuntimeCatalogEntry[];
  selectedRuntimeId?: AgentRuntimeId | null;
  runtime?: AgentRuntimeDescriptor;
  /** Readiness for selectedRuntimeId; null while the UI is showing inventory before selection. */
  readiness: AgentRuntimeReadiness | null;
  account: AgentAccountState | null;
  providers?: AgentInferenceProvider[];
  models: AgentModel[];
  modes?: AgentMode[];
  commands?: AgentCommand[];
  capabilities: AgentCapabilities | null;
  warnings: string[];
};

/** @deprecated Use AgentRuntimeInspection. */
export type AgentProviderInspection = AgentRuntimeInspection;

export type AgentLocalInstallationState = "not-found" | "detected" | "unsupported" | "broken";
export type AgentLocalAuthenticationState = "unknown" | "signed-out" | "signed-in" | "expired" | "error";
export type AgentLocalIntegrationState =
  | "inventory-only"
  | "setup-required"
  | "protocol-unavailable"
  | "ready"
  | "incompatible"
  | "blocked"
  /** @deprecated Read-only compatibility for older snapshots. */
  | "bridge-required";
export type AgentLocalConnectionSource =
  | "configured"
  | "user-installation"
  | "system-installation"
  | "path-installation"
  | "application-bundle";

export type AgentLocalConnection = {
  id: string;
  displayName: string;
  installation: AgentLocalInstallationState;
  version: string | null;
  authentication: AgentLocalAuthenticationState;
  integration: AgentLocalIntegrationState;
  capabilities: {
    versionProbe: boolean;
    authenticationProbe: boolean;
    protocolProbe: boolean;
  };
  selectable: boolean;
  statusMessage: string;
  actions: Array<{ id: "refresh" | "learn-more"; label: string }>;
  source?: AgentLocalConnectionSource;
};

export type AgentLocalConnectionsSnapshot = {
  connections: AgentLocalConnection[];
  scannedAt: string;
  warnings: string[];
};

export type AgentSessionSnapshot = {
  session: AgentSessionMetadata;
  runtime?: AgentRuntimeDescriptor;
  account: AgentAccountState | null;
  providers?: AgentInferenceProvider[];
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

export type AgentLocalConnectionsRequest = Pick<AgentRuntimeRequest, "rootPath" | "refresh">;

export type AgentModelsListRequest = AgentRuntimeRequest;
export type AgentAccountReadRequest = AgentRuntimeRequest;

export type AgentSessionCreateRequest = {
  rootPath: string;
  runtimeId?: AgentRuntimeId | null;
  model?: string | null;
  effort?: string | null;
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
  /** Explicit user-requested native metadata discovery; false never starts a harness. */
  discoverNative?: boolean;
  cursor?: string | null;
  limit?: number;
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

export type AgentReferenceStatus = "resolving" | "ready" | "error";

export type AgentReferenceError = {
  code: string;
  message: string;
};

export type AgentWorkspaceEntryReference = {
  id: string;
  kind: "workspace-entry";
  entryType: "file" | "directory";
  /** Portable identity resolved against the owning Agent session at send time. */
  relativePath: string;
  displayName: string;
  mime?: string;
  size?: number;
  status: AgentReferenceStatus;
  error?: AgentReferenceError;
};

export type AgentStagedAttachmentReference = {
  id: string;
  kind: "staged-attachment";
  token?: string;
  displayName: string;
  mime: string;
  size: number;
  status: AgentReferenceStatus;
  error?: AgentReferenceError;
};

/** Renderer draft/request representation. It never contains external paths or bytes. */
export type AgentDraftReference = AgentWorkspaceEntryReference | AgentStagedAttachmentReference;

/** A renderer-safe atomic file mention embedded in the user's prompt text. */
export type AgentPromptReferenceMention = {
  referenceId: string;
  /** UTF-16 offsets into the associated prompt string. */
  start: number;
  end: number;
};

/** Renderer-safe transcript representation. */
export type AgentReferenceDisplay = {
  id: string;
  kind: "workspace-file" | "workspace-directory" | "attachment";
  displayName: string;
  relativePath?: string;
  mime?: string;
  size?: number;
};

export type AgentSubmissionIntent = {
  id: string;
  referenceEpoch: string;
  prompt: string;
  model: string | null;
  effort: string | null;
  mode: string | null;
  references: AgentDraftReference[];
  promptMentions: AgentPromptReferenceMention[];
};

export type AgentTurnStartRequest = {
  rootPath: string;
  sessionId: string;
  prompt: string;
  model?: string | null;
  effort?: string | null;
  mode?: string | null;
  referenceEpoch?: string;
  promptMentions?: AgentPromptReferenceMention[];
  attachments?: AgentFileReference[];
  contextReferences?: AgentFileReference[];
  references?: AgentDraftReference[];
};

export type AgentTurnSteerRequest = {
  rootPath: string;
  sessionId: string;
  turnId: string;
  message: string;
  referenceEpoch?: string;
  promptMentions?: AgentPromptReferenceMention[];
  references?: AgentDraftReference[];
};

export type AgentReferenceStageRequest = {
  rootPath: string;
  epoch: string;
  files: File[];
};

export type AgentReferenceRevokeRequest = {
  rootPath: string;
  tokens: string[];
};

export type AgentWorkspaceReferenceResolveRequest = {
  rootPath: string;
  paths: string[];
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

export type AgentIpcChannel =
  | "agent:providers-discover"
  | "agent:local-connections-discover"
  | "agent:models-list"
  | "agent:account-read"
  | "agent:session-create"
  | "agent:session-resume"
  | "agent:session-replay"
  | "agent:sessions-list"
  | "agent:session-fork"
  | "agent:session-archive"
  | "agent:session-delete"
  | "agent:session-close"
  | "agent:reference-stage"
  | "agent:reference-revoke"
  | "agent:reference-resolve-workspace"
  | "agent:reference-pick-workspace"
  | "agent:turn-start"
  | "agent:turn-steer"
  | "agent:turn-interrupt"
  | "agent:session-compact"
  | "agent:approval-resolve"
  | "agent:question-resolve";
