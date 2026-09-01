import type { AgentSessionOpenErrorCode } from "./agent-contract";

/** Structured renderer error preserved through Workbench preparation. */
export class AgentSessionOpenError extends Error {
  readonly code: AgentSessionOpenErrorCode;
  readonly retryable: boolean;

  constructor({
    code,
    message,
    retryable,
  }: Readonly<{ code: AgentSessionOpenErrorCode; message: string; retryable: boolean }>) {
    super(message);
    this.name = "AgentSessionOpenError";
    this.code = code;
    this.retryable = retryable;
  }
}
