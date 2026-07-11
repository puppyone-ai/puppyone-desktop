import type { AgentTurnTerminalState } from "./agent-contract";

export type AgentTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  turnId: string | null;
  itemId: string | null;
  text: string;
  streaming: boolean;
  terminalState: AgentTurnTerminalState | null;
  sequence: number;
};

export type AgentActivity = {
  id: string;
  turnId: string | null;
  itemId: string | null;
  kind: "tool" | "command" | "file-change" | "plan" | "reasoning" | "warning" | "error";
  label: string;
  status: string;
  detail: Record<string, unknown>;
  output: string;
  sequence: number;
};

export type AgentApproval = {
  requestId: string;
  turnId: string;
  itemId: string | null;
  kind: "command" | "file-change";
  title: string;
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
  | (AgentPartBase & { kind: "user" | "assistant"; text: string; streaming: boolean; terminalState: AgentTurnTerminalState | null })
  | (AgentPartBase & { kind: "reasoning" | "plan" | "tool" | "command" | "file-change" | "warning" | "error"; label: string; status: string; output: string; detail: Record<string, unknown> })
  | (AgentPartBase & { kind: "usage"; usage: Record<string, unknown> })
  | (AgentPartBase & { kind: "permission"; requestId: string; state: "pending" | "resolved" })
  | (AgentPartBase & { kind: "question"; requestId: string; state: "pending" | "resolved" })
  | (AgentPartBase & { kind: "unknown"; eventType: string; label: string });

export type AgentTurn = {
  id: string;
  status: "running" | AgentTurnTerminalState;
  startedAtSequence: number;
  completedAtSequence: number | null;
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
  runningTurnId: string | null;
  terminalState: AgentTurnTerminalState | null;
  usage: Record<string, unknown> | null;
};
