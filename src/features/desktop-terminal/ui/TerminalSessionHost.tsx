import type { AuxiliaryWorkbenchCreationRecipe } from "../../app-shell/auxiliary-workbench/types";
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
  chatCreationAvailable?: boolean;
  chatPreparing?: boolean;
  chatRecipes?: readonly AuxiliaryWorkbenchCreationRecipe[];
  focused: boolean;
  onFocus: () => void;
  presented: boolean;
  runtime: TerminalRuntimeHandle | null;
  session: DesktopTerminalSession;
  terminalEnabled?: boolean;
  workspacePath: string;
  onCreateChat?: (recipe: AuxiliaryWorkbenchCreationRecipe) => void;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

/** Keeps one Session component mounted while Group slots reparent its host. */
export function TerminalSessionHost({
  discoveryPhase,
  availableAgentIds,
  chatCreationAvailable = true,
  chatPreparing = false,
  chatRecipes = [],
  focused,
  onFocus,
  onCreateChat,
  onLaunch,
  onRefresh,
  presented,
  runtime,
  session,
  terminalEnabled = true,
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
            chatCreationAvailable={chatCreationAvailable}
            chatPreparing={chatPreparing}
            chatRecipes={chatRecipes}
            launchError={session.launchError}
            onCreateChat={onCreateChat}
            onLaunch={onLaunch}
            onRefresh={onRefresh}
            terminalEnabled={terminalEnabled}
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
            chatCreationAvailable={false}
            chatRecipes={chatRecipes}
            launchError={session.launchError}
            launching
            onCreateChat={onCreateChat}
            onLaunch={onLaunch}
            onRefresh={onRefresh}
            terminalEnabled={terminalEnabled}
            titleId={`desktop-terminal-launcher-title-${session.id}`}
          />
        </div>
      )}
    </div>
  );
}
