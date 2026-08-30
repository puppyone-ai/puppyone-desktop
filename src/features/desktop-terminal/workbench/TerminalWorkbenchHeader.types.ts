import type { AuxiliaryWorkbenchItemSnapshot } from "../../app-shell/auxiliary-workbench/types";
import type { DesktopTerminalSessionSummary } from "../model/terminalSessions";
import type { TerminalRuntimeHandle } from "../runtime/terminalRuntime";

export type TerminalWorkbenchHeaderItem = Readonly<{
  id: string;
  kind: string;
  snapshot: AuxiliaryWorkbenchItemSnapshot;
  terminalSession: DesktopTerminalSessionSummary | null;
  terminalRuntime: TerminalRuntimeHandle | null;
}>;

export type TerminalWorkbenchCreateOption = Readonly<{
  id: string;
  group: "chat" | "terminal";
  groupLabel: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  iconKey?: string | null;
  launcherId?: import("../model/terminalLaunchers").DesktopTerminalLauncherId;
  onCreate: () => void;
}>;
