export type AgentActivityPhase = "started" | "completed" | "failed" | "cancelled";

export type AgentActivityOperation =
  | "file.read"
  | "file.search"
  | "file.write"
  | "file.delete"
  | "file.move"
  | "command"
  | "subagent"
  | "tool";

export type AgentActivityTargetAccess =
  | "read"
  | "search"
  | "write"
  | "delete"
  | "move-from"
  | "move-to";

export type AgentActivityPublicTarget = Readonly<{
  workspaceRelativePath: string;
  access: AgentActivityTargetAccess;
  confidence: "exact" | "inferred";
}>;

export type AgentActivityEvent = Readonly<{
  schemaVersion: 1;
  eventId: string;
  activityId: string;
  providerId: string;
  terminalSessionId: string;
  phase: AgentActivityPhase;
  operation: AgentActivityOperation;
  targets: readonly AgentActivityPublicTarget[];
  occurredAt: number;
}>;

export type AgentActivitySnapshot = Readonly<{
  schemaVersion: 1;
  activities: readonly AgentActivityEvent[];
}>;

export type AgentActivityEnrollmentState =
  | "not-configured"
  | "enabled"
  | "needs-repair"
  | "basic-only";

export type AgentActivityProviderStatus = Readonly<{
  providerId: string;
  displayName: string;
  enrollment: AgentActivityEnrollmentState;
  configurable: boolean;
}>;

export type AgentActivityEnrollmentSnapshot = Readonly<{
  schemaVersion: 1;
  providers: readonly AgentActivityProviderStatus[];
}>;
