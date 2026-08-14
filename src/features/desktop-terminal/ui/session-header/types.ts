import type { TerminalSessionHeaderPresentation } from "../../model/terminalSessionHeader";
import type { DesktopTerminalSessionSummary } from "../../model/terminalSessions";
import type { TerminalRuntimeHandle } from "../../runtime/terminalRuntime";

export type TerminalSessionHeaderItem = {
  presentation: TerminalSessionHeaderPresentation;
  runtime: TerminalRuntimeHandle | null;
  session: DesktopTerminalSessionSummary;
};
