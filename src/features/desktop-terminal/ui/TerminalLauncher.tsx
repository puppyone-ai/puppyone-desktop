import { AlertCircle, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { AuxiliaryWorkbenchCreationRecipe } from "../../app-shell/auxiliary-workbench/types";
import type {
  AvailableTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  getDesktopTerminalLauncher,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import { TerminalActivityGrid } from "./TerminalActivityGrid";
import { WorkbenchLauncherIcon } from "./WorkbenchLauncherIcon";
import "./terminal-launcher.css";

export type TerminalLauncherAgentMode = "chat" | "terminal";
type TerminalAgentLauncherDefinition = Exclude<
  (typeof DESKTOP_TERMINAL_LAUNCHERS)[number],
  { id: "shell" }
>;

type TerminalLauncherProps = {
  agentMode: TerminalLauncherAgentMode;
  discoveryPhase: TerminalAgentDiscoveryPhase;
  availableAgentIds: readonly AvailableTerminalAgentId[];
  chatCreationAvailable?: boolean;
  chatPreparing?: boolean;
  chatRecipes?: readonly AuxiliaryWorkbenchCreationRecipe[];
  launchError?: string | null;
  launching?: boolean;
  terminalEnabled?: boolean;
  titleId?: string;
  onCreateChat?: (recipe: AuxiliaryWorkbenchCreationRecipe) => void;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

/**
 * The neutral Workbench launcher shown before an Item chooses its runtime.
 * The composition layer explicitly chooses whether Agent rows create Chat
 * Items or launch detected Terminal CLIs. Shell always resolves to a Terminal.
 */
export function TerminalLauncher({
  agentMode,
  discoveryPhase,
  availableAgentIds,
  chatCreationAvailable = true,
  chatPreparing = false,
  chatRecipes = [],
  launchError = null,
  launching = false,
  onLaunch,
  onCreateChat,
  onRefresh,
  terminalEnabled = true,
  titleId = "desktop-terminal-launcher-title",
}: TerminalLauncherProps) {
  const { t } = useLocalization();
  const shell = getDesktopTerminalLauncher("shell");
  const scanning = discoveryPhase === "idle" || discoveryPhase === "loading";
  const busy = launching || chatPreparing;
  const availableAgentIdSet = new Set<DesktopTerminalLauncherId>(availableAgentIds);
  const terminalAgentLaunchers = DESKTOP_TERMINAL_LAUNCHERS.filter(
    (launcher): launcher is TerminalAgentLauncherDefinition => (
      launcher.id !== "shell" && availableAgentIdSet.has(launcher.id)
    ),
  );
  const availabilityMessage = discoveryPhase === "error"
    ? "terminal.launcher.detectionFailed"
    : scanning
      ? "terminal.launcher.detecting"
      : agentMode === "terminal" && terminalAgentLaunchers.length === 0
        ? "terminal.launcher.noneInstalled"
        : null;

  return (
    <section className="desktop-terminal-launcher" aria-labelledby={titleId}>
      <div className="desktop-terminal-launcher-content">
        <div
          className="desktop-terminal-launcher-group is-agents"
          data-agent-mode={agentMode}
          data-discovery-phase={discoveryPhase}
          data-detected-terminal-agent-count={availableAgentIds.length}
        >
          <header className="desktop-terminal-launcher-heading">
            <h2 id={titleId}>
              {busy && (
                <TerminalActivityGrid className="desktop-terminal-launcher-spinner" />
              )}
              <span>
                {t(launching ? "terminal.launcher.launching" : "terminal.launcher.title")}
              </span>
            </h2>
            <button
              type="button"
              className={`desktop-terminal-launcher-scan ${scanning ? "is-scanning" : ""}`}
              onClick={onRefresh}
              disabled={busy || scanning}
              aria-label={t("terminal.launcher.scanAgain")}
              title={t("terminal.launcher.scanAgain")}
            >
              <RefreshCw size={12} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </header>

          {launchError && (
            <div className="desktop-terminal-launcher-error" role="alert">
              <AlertCircle size={13} strokeWidth={1.7} aria-hidden="true" />
              <span>{launchError}</span>
            </div>
          )}

          <div className="desktop-terminal-launcher-tools" role="list">
            {agentMode === "chat"
              ? chatRecipes.map((recipe) => (
                  <div key={recipe.id} role="listitem">
                    <ChatRecipeButton
                      creationAvailable={Boolean(
                        onCreateChat && chatCreationAvailable && !busy,
                      )}
                      recipe={recipe}
                      onCreate={onCreateChat}
                    />
                  </div>
                ))
              : terminalAgentLaunchers.map((launcher) => (
                  <div key={launcher.id} role="listitem">
                    <TerminalAgentButton
                      launcher={launcher}
                      launchAvailable={terminalEnabled && !busy}
                      onLaunch={onLaunch}
                    />
                  </div>
                ))}
          </div>

          {availabilityMessage && (
            <div className="desktop-terminal-launcher-availability" aria-live="polite">
              <span>{t(availabilityMessage)}</span>
            </div>
          )}
        </div>

        {terminalEnabled && (
          <div className="desktop-terminal-launcher-group is-shell">
            <header className="desktop-terminal-launcher-heading">
              <h2>
                <span>
                  {t("terminal.launcher.shell.title")}
                </span>
              </h2>
            </header>
            <button
              type="button"
              className="desktop-terminal-launcher-shell"
              onClick={() => onLaunch(shell.id)}
              disabled={busy}
              aria-label={`${t("terminal.launcher.shell.action")}. ${t(shell.descriptionMessage)}`}
              title={t(shell.descriptionMessage)}
            >
              <WorkbenchLauncherIcon launcherId="shell" />
              <span>{t("terminal.launcher.shell.action")}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function TerminalAgentButton({
  launcher,
  launchAvailable,
  onLaunch,
}: Readonly<{
  launcher: TerminalAgentLauncherDefinition;
  launchAvailable: boolean;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
}>) {
  const { t } = useLocalization();
  const label = t(launcher.nameMessage);
  const description = t(launcher.descriptionMessage);

  return (
    <button
      type="button"
      className="desktop-terminal-launcher-tool"
      disabled={!launchAvailable}
      aria-label={`${t("terminal.launcher.title")}: ${label}. ${description}`}
      title={description}
      onClick={() => onLaunch(launcher.id)}
    >
      <WorkbenchLauncherIcon launcherId={launcher.id} />
      <span>{label}</span>
    </button>
  );
}

function ChatRecipeButton({
  creationAvailable,
  recipe,
  onCreate,
}: Readonly<{
  creationAvailable: boolean;
  recipe: AuxiliaryWorkbenchCreationRecipe;
  onCreate?: (recipe: AuxiliaryWorkbenchCreationRecipe) => void;
}>) {
  const { t } = useLocalization();
  const available = creationAvailable && recipe.status === "available";
  const statusLabel = recipe.status === "coming-soon"
    ? t("terminal.launcher.comingSoon")
    : recipe.status === "unavailable"
      ? t("terminal.launcher.notInstalled")
      : null;
  const title = statusLabel ? `${recipe.label} — ${statusLabel}` : recipe.label;

  return (
    <button
      type="button"
      className="desktop-terminal-launcher-tool"
      data-status={recipe.status}
      disabled={!available}
      aria-label={`${t("terminal.launcher.title")}: ${title}`}
      title={title}
      onClick={() => onCreate?.(recipe)}
    >
      <WorkbenchLauncherIcon iconKey={recipe.iconKey} />
      <span>{recipe.label}</span>
    </button>
  );
}
