import type { AgentSessionMetadata } from "../domain/agent-contract";

export function readinessLabel(status: string | undefined) {
  if (status === "ready") return "ready";
  if (status === "installed-not-authenticated") return "provider setup required";
  if (status === "not-installed" || status === "unsupported-version" || status === "error") return "needs repair";
  return "checking";
}

export function sessionStatusLabel(status: AgentSessionMetadata["terminalState"]) {
  return status === "provider-exited" ? "provider exited" : status;
}
