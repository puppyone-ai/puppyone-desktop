import type { MessageFormatter } from "@puppyone/localization/core";
import type { AgentReadinessStatus, AgentSessionMetadata } from "../domain/agent-contract";

export function readinessStatusCode(status: AgentReadinessStatus | undefined) {
  if (status === "ready") return "ready";
  if (status === "installed-not-authenticated") return "setup-required";
  if (status === "not-installed" || status === "unsupported-version" || status === "error") return "needs-repair";
  return "checking";
}

export function readinessLabel(status: AgentReadinessStatus | undefined, t: MessageFormatter) {
  return t(`agent.header.status.${readinessStatusCode(status)}`);
}

export function sessionStatusCode(status: AgentSessionMetadata["terminalState"] | undefined) {
  return status || "ready";
}

export function sessionStatusLabel(status: AgentSessionMetadata["terminalState"] | undefined, t: MessageFormatter) {
  return t(`agent.turn.status.${sessionStatusCode(status)}`);
}
