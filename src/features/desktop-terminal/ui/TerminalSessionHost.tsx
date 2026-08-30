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
  discoveryPhase: TerminalAgentDiscoveryPhase;
  availableAgentIds: readonly AvailableTerminalAgentId[];
  focused: boolean;
  onFocus: () => void;
  presented: boolean;
  runtime: TerminalRuntimeHandle | null;
  session: DesktopTerminalSession;
  workspacePath: string;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

/** Keeps one Session component mounted while Group slots reparent its host. */
export function TerminalSessionHost({
  discoveryPhase,
  availableAgentIds,
  focused,
  onFocus,
  onLaunch,
  onRefresh,
  presented,
  runtime,
  session,
  workspacePath,
}: TerminalSessionHostProps) {
  if (session.status === "selecting") {
    return (
      <div
        className="desktop-terminal-session-host-content is-launcher"
        aria-hidden={!presented}
      >
        <div className="desktop-terminal-launcher-tab" hidden={!presented}>
          <TerminalLauncher
            discoveryPhase={discoveryPhase}
            availableAgentIds={availableAgentIds}
            launchError={session.launchError}
            onLaunch={onLaunch}
            onRefresh={onRefresh}
            titleId={`desktop-terminal-launcher-title-${session.id}`}
          />
        </div>
      </div>
    );
  }

  if (!runtime) return null;
  const starting = session.status === "starting";
  return (
    <div
      className="desktop-terminal-session-host-content"
      aria-hidden={!presented}
    >
      <TerminalSessionView
        focused={focused && !starting}
        onFocus={onFocus}
        presented={presented}
        runtime={runtime}
        workspacePath={workspacePath}
      />
      {starting && (
        <div className="desktop-terminal-launcher-tab" hidden={!presented}>
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
