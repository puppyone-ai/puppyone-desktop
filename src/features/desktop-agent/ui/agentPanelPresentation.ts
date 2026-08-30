import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import type {
  AgentReadinessCode,
  AgentRuntimeReadiness,
  AgentSessionMetadata,
} from "../domain/agent-contract";

export function readinessStatusCode(readiness: AgentRuntimeReadiness | null | undefined) {
  if (!readiness) return "checking";
  if (readiness.code === "READY") return "ready";
  if ([
    "RUNTIME_SETUP_REQUIRED",
    "AUTHENTICATION_REQUIRED",
    "AUTHENTICATION_EXPIRED",
    "PROVIDER_CREDENTIALS_REJECTED",
  ].includes(readiness.code)) return "setup-required";
  return "needs-repair";
}

export function readinessLabel(readiness: AgentRuntimeReadiness | null | undefined, t: MessageFormatter) {
  return t(`agent.header.status.${readinessStatusCode(readiness)}`);
}

export function presentRuntimeReadiness(
  readiness: AgentRuntimeReadiness | null | undefined,
  runtimeLabel: string,
  t: MessageFormatter,
) {
  const code: AgentReadinessCode = readiness?.code ?? "RUNTIME_INSPECTION_FAILED";
  return {
    code,
    heading: t(`agent.readiness.reason.${code}`, { agent: bidiIsolate(runtimeLabel) }),
    detail: readiness?.message || t("agent.readiness.inspectFailed", { agent: bidiIsolate(runtimeLabel) }),
    diagnostic: readiness?.diagnostic || null,
  };
}

export function sessionStatusCode(status: AgentSessionMetadata["terminalState"] | undefined) {
  return status || "ready";
}

export function sessionStatusLabel(status: AgentSessionMetadata["terminalState"] | undefined, t: MessageFormatter) {
  return t(`agent.turn.status.${sessionStatusCode(status)}`);
}
