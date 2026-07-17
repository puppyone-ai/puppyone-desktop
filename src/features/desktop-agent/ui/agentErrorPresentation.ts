import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import type { AgentErrorDescriptor } from "../application/agent-error";

export type AgentErrorPresentation = Readonly<{
  summary: string;
  detail: string | null;
}>;

export function presentAgentError(
  error: AgentErrorDescriptor | null,
  t: MessageFormatter,
): AgentErrorPresentation | null {
  if (!error) return null;
  const sourceParams = error.code === "runtime-exited" && !error.params?.runtime
    ? { ...error.params, runtime: t("agent.name") }
    : error.params ?? {};
  const params = Object.fromEntries(Object.entries(sourceParams).map(([key, value]) => [
    key,
    typeof value === "string" ? bidiIsolate(value) : value,
  ]));
  return {
    summary: t(`agent.error.${error.code}`, params),
    detail: error.detail || null,
  };
}
