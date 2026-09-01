import type { DesktopTerminalSessionStatus } from "./terminalSessions";

export type TerminalClosePolicy = "close" | "confirm";

/** Confirmation is reserved for sessions that may still own a live PTY. */
export function getTerminalClosePolicy(
  status: DesktopTerminalSessionStatus,
): TerminalClosePolicy {
  return status === "starting" || status === "running" ? "confirm" : "close";
}
