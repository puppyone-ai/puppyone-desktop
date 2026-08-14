import type {
  AvailableTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import type { DesktopTerminalSession } from "../model/terminalSessions";
import type { TerminalRuntimeHandle } from "../runtime/terminalRuntime";
import { TerminalLauncher } from "./TerminalLauncher";
import { TerminalSessionView } from "./TerminalSessionView";

type TerminalSessionHostProps = {
  active: boolean;
  discoveryPhase: TerminalAgentDiscoveryPhase;
  availableAgentIds: readonly AvailableTerminalAgentId[];
  labelledBy?: string;
  panelId?: string;
  runtime: TerminalRuntimeHandle;
  session: DesktopTerminalSession;
  workspacePath: string;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

/**
 * Owns one stable xterm view for the full lifetime of a runtime. Transient
 * startup UI overlays that view instead of replacing it, so status changes
 * cannot remount a live terminal into a second DOM container.
 */
export function TerminalSessionHost({
  active,
  discoveryPhase,
  availableAgentIds,
  labelledBy,
  onLaunch,
  onRefresh,
  panelId,
  runtime,
  session,
  workspacePath,
}: TerminalSessionHostProps) {
  const starting = session.status === "starting";

  return (
    <div
      id={panelId}
      className="desktop-terminal-session-host"
      role={panelId ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
      aria-hidden={!active}
    >
      <TerminalSessionView
        active={active && !starting}
        runtime={runtime}
        workspacePath={workspacePath}
      />
      {starting && (
        <div className="desktop-terminal-launcher-tab" hidden={!active}>
          <TerminalLauncher
            discoveryPhase={discoveryPhase}
            availableAgentIds={availableAgentIds}
            launchError={session.launchError}
            launching
            onLaunch={onLaunch}
            onRefresh={onRefresh}
            titleId={`desktop-terminal-launcher-title-${session.id}`}
          />
        </div>
      )}
    </div>
  );
}
