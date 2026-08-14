import type { MessageFormatter } from "@puppyone/localization/core";
import { getDesktopTerminalLauncher } from "./terminalLaunchers";
import { terminalPathLabel } from "./terminalPath";
import type { DesktopTerminalSessionSummary } from "./terminalSessions";

const terminalStatusMessageKey = {
  selecting: "terminal.launcher.title",
  starting: "terminal.status.starting",
  running: "terminal.status.running",
  exited: "terminal.status.exited",
  error: "terminal.status.error",
} as const;

export type TerminalSessionHeaderPresentation = {
  accessibleLabel: string;
  launcherLabel: string | null;
  overflowDetail: string;
  overflowLabel: string;
  pathLabel: string;
  sessionTitle: string;
  statusLabel: string;
};

/** One presentation projection shared by the rail and overflow menu. */
export function presentTerminalSessionHeader(
  session: DesktopTerminalSessionSummary,
  workspacePath: string,
  formatMessage: MessageFormatter,
): TerminalSessionHeaderPresentation {
  const sessionTitle = formatMessage("terminal.sessionTitle", { number: session.ordinal });
  const statusLabel = formatMessage(terminalStatusMessageKey[session.status]);
  const pathLabel = terminalPathLabel(workspacePath);
  const launcher = session.launcherId
    ? getDesktopTerminalLauncher(session.launcherId)
    : null;
  const launcherLabel = launcher ? formatMessage(launcher.nameMessage) : null;

  return {
    accessibleLabel: [
      sessionTitle,
      launcherLabel,
      workspacePath.trim() || null,
      statusLabel,
    ].filter(Boolean).join(" — "),
    launcherLabel,
    overflowDetail: `${pathLabel} — ${statusLabel}`,
    overflowLabel: launcherLabel ?? sessionTitle,
    pathLabel,
    sessionTitle,
    statusLabel,
  };
}
