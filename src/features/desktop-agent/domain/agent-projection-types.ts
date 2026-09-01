import type { AgentPromptReferenceMention, AgentReferenceDisplay, AgentTurnTerminalState } from "./agent-contract";

export type AgentTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  turnId: string | null;
  itemId: string | null;
  text: string;
  references?: AgentReferenceDisplay[];
  promptMentions?: AgentPromptReferenceMention[];
  streaming: boolean;
  terminalState: AgentTurnTerminalState | null;
  sequence: number;
};

export type AgentActivityStatus =
  | "queued"
  | "running"
  | "pending"
  | "in-progress"
  | "waiting-for-user"
  | "completed"
  | "succeeded"
  | "failed"
  | "warning"
  | "blocked"
  | "cancelled"
  | "interrupted"
  | "unknown";

export type AgentActivityLabelCode =
  | "reasoning-summary"
  | "plan-updated"
  | "command"
  | "command-output"
  | "file-changes"
  | "tool-activity"
  | "agent-activity"
  | "provider-error"
  | "provider-warning";

export type AgentActivityKind = "tool" | "command" | "file-change" | "plan" | "reasoning" | "warning" | "error";

/** Discriminated semantic activity type shared by projection and Renderer registries. */
export type AgentActivity<TKind extends AgentActivityKind = AgentActivityKind> = TKind extends AgentActivityKind ? {
  id: string;
  turnId: string | null;
  itemId: string | null;
  kind: TKind;
  label: string;
  labelCode?: AgentActivityLabelCode;
  status: AgentActivityStatus;
  detail: Record<string, unknown>;
  output: string;
  sequence: number;
} : never;

/**
 * Replaceable, live provider transport state. It is deliberately not an
 * activity or timeline part: connection attempts describe the current turn,
 * not durable conversation history.
 */
export type AgentConnectionStatus = {
  state: "reconnecting" | "fallback";
  message: string;
  attempt: number | null;
  maxAttempts: number | null;
  turnId: string | null;
  sequence: number;
};

export type AgentApproval = {
  requestId: string;
  turnId: string;
  itemId: string | null;
  kind: "command" | "file-change";
  title: string;
  titleCode?: "approval-required";
  command: string | null;
  cwd: string | null;
  commandActions: Array<Record<string, unknown>>;
  networkApprovalContext: { host: string; protocol: string } | null;
  grantRoot: string | null;
  policyChangeRequested: boolean;
  reason: string | null;
  availableDecisions: Array<"accept" | "acceptForSession" | "decline" | "cancel">;
  sequence: number;
};

export type AgentQuestionChoice = { label: string; description: string };
export type AgentQuestionPrompt = {
  header: string;
  question: string;
  multiple: boolean;
  custom: boolean;
  options: AgentQuestionChoice[];
};

export type AgentQuestion = {
  requestId: string;
  turnId: string;
  itemId: string | null;
  questions: AgentQuestionPrompt[];
  sequence: number;
};

type AgentPartBase = {
  id: string;
  turnId: string | null;
  itemId: string | null;
  sequence: number;
};

export type AgentPart =
  | (AgentPartBase & { kind: "user"; text: string; references?: AgentReferenceDisplay[]; promptMentions?: AgentPromptReferenceMention[]; streaming: boolean; terminalState: AgentTurnTerminalState | null })
  | (AgentPartBase & { kind: "assistant"; text: string; streaming: boolean; terminalState: AgentTurnTerminalState | null })
  | (AgentPartBase & { kind: "turn-summary"; durationMs: number; status: AgentTurnTerminalState })
  | AgentActivity
  | (AgentPartBase & { kind: "usage"; usage: Record<string, unknown> })
  | (AgentPartBase & { kind: "permission"; requestId: string; state: "pending" | "resolved" })
  | (AgentPartBase & { kind: "question"; requestId: string; state: "pending" | "resolved" })
  | (AgentPartBase & { kind: "unknown"; eventType: string; label: string; labelCode?: "unsupported-event" });

export type AgentTurn = {
  id: string;
  status: "running" | AgentTurnTerminalState;
  startedAtSequence: number;
  startedAtMs: number | null;
  completedAtSequence: number | null;
  durationMs: number | null;
  partIds: string[];
};

export type TimelineRow = {
  id: string;
  partId: string;
  turnId: string | null;
  kind: AgentPart["kind"];
  sequence: number;
  estimatedHeight: number;
};

export type AgentProjection = {
  sessionState: "empty" | "active" | "closed";
  lastSequence: number;
  partialHistory: boolean;
  missingRanges: Array<{ from: number; to: number }>;
  messages: AgentTranscriptMessage[];
  activities: AgentActivity[];
  approvals: AgentApproval[];
  questions: AgentQuestion[];
  turns: AgentTurn[];
  parts: AgentPart[];
  rows: TimelineRow[];
  connectionStatus: AgentConnectionStatus | null;
  runningTurnId: string | null;
  terminalState: AgentTurnTerminalState | null;
  usage: Record<string, unknown> | null;
};
