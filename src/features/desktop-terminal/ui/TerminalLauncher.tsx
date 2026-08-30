import { AlertCircle, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { AuxiliaryWorkbenchCreationRecipe } from "../../app-shell/auxiliary-workbench/types";
import type {
  AvailableTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherDefinition,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import { TerminalActivityGrid } from "./TerminalActivityGrid";
import { WorkbenchLauncherIcon } from "./WorkbenchLauncherIcon";
import "./terminal-launcher.css";

type TerminalLauncherProps = {
  discoveryPhase: TerminalAgentDiscoveryPhase;
  availableAgentIds: readonly AvailableTerminalAgentId[];
  terminalAgentIds?: readonly AvailableTerminalAgentId[];
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

const ALL_TERMINAL_AGENT_IDS = DESKTOP_TERMINAL_LAUNCHERS
  .map(({ id }) => id)
  .filter((id): id is AvailableTerminalAgentId => id !== "shell");

export function TerminalLauncher({
  discoveryPhase,
  availableAgentIds,
  terminalAgentIds = ALL_TERMINAL_AGENT_IDS,
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
  const installedAgentIdSet = new Set(availableAgentIds);
  const visibleAgentIdSet = new Set(terminalAgentIds);
  const agents = DESKTOP_TERMINAL_LAUNCHERS.filter(
    ({ id }) => id !== "shell" && visibleAgentIdSet.has(id),
  );
  const shell = DESKTOP_TERMINAL_LAUNCHERS.find(({ id }) => id === "shell");
  const scanning = discoveryPhase === "idle" || discoveryPhase === "loading";
  const hasChat = Boolean(onCreateChat && chatRecipes.length > 0);
  const availabilityMessage = discoveryPhase === "error"
    ? "terminal.launcher.detectionFailed"
    : scanning
      ? "terminal.launcher.detecting"
      : availableAgentIds.length === 0
        ? "terminal.launcher.noneInstalled"
        : null;

  return (
    <section className="desktop-terminal-launcher" aria-labelledby={titleId}>
      <div className="desktop-terminal-launcher-content">
        {hasChat && (
          <div className="desktop-terminal-launcher-group is-chat">
            <header className="desktop-terminal-launcher-heading">
              <h2 id={titleId}>
                {chatPreparing && (
                  <TerminalActivityGrid className="desktop-terminal-launcher-spinner" />
                )}
                <span>{t("terminal.launcher.chat")}</span>
              </h2>
            </header>
            <div className="desktop-terminal-launcher-rail" role="list">
              {chatRecipes.map((recipe) => (
                <div key={recipe.id} role="listitem">
                  <ChatRecipeButton
                    creationAvailable={chatCreationAvailable && !chatPreparing}
                    recipe={recipe}
                    onCreate={onCreateChat!}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {terminalEnabled && shell && (
          <div className="desktop-terminal-launcher-group is-terminal" data-discovery-phase={discoveryPhase}>
            <header className="desktop-terminal-launcher-heading">
              <h2 id={hasChat ? undefined : titleId}>
                {launching && (
                  <TerminalActivityGrid className="desktop-terminal-launcher-spinner" />
                )}
                <span>{t(launching ? "terminal.launcher.launching" : "terminal.title")}</span>
              </h2>
              <button
                type="button"
                className={`desktop-terminal-launcher-scan ${scanning ? "is-scanning" : ""}`}
                onClick={onRefresh}
                disabled={launching || scanning}
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

            <div className="desktop-terminal-launcher-rail" role="list">
              <div role="listitem">
                <TerminalRecipeButton launcher={shell} available={!launching} onLaunch={onLaunch} />
              </div>
              {agents.map((launcher) => (
                <div key={launcher.id} role="listitem">
                  <TerminalRecipeButton
                    launcher={launcher}
                    available={!launching && installedAgentIdSet.has(launcher.id as AvailableTerminalAgentId)}
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
        )}
      </div>
    </section>
  );
}

function ChatRecipeButton({
  creationAvailable,
  recipe,
  onCreate,
}: Readonly<{
  creationAvailable: boolean;
  recipe: AuxiliaryWorkbenchCreationRecipe;
  onCreate: (recipe: AuxiliaryWorkbenchCreationRecipe) => void;
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
      className="desktop-terminal-launcher-recipe"
      data-status={recipe.status}
      aria-disabled={!available}
      aria-label={`${t("terminal.launcher.chat")}: ${title}`}
      title={title}
      onClick={() => { if (available) onCreate(recipe); }}
    >
      <WorkbenchLauncherIcon iconKey={recipe.iconKey} />
      <span className="desktop-terminal-launcher-recipe-label">{recipe.label}</span>
    </button>
  );
}

function TerminalRecipeButton({
  available,
  launcher,
  onLaunch,
}: Readonly<{
  available: boolean;
  launcher: DesktopTerminalLauncherDefinition;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
}>) {
  const { t } = useLocalization();
  const name = t(launcher.nameMessage);
  const title = available
    ? t(launcher.descriptionMessage)
    : `${name} — ${t("terminal.launcher.notInstalled")}`;

  return (
    <button
      type="button"
      className="desktop-terminal-launcher-recipe"
      data-status={available ? "available" : "unavailable"}
      aria-disabled={!available}
      aria-label={`${t("terminal.title")}: ${name}`}
      title={title}
      onClick={() => { if (available) onLaunch(launcher.id); }}
    >
      <WorkbenchLauncherIcon launcherId={launcher.id} />
      <span className="desktop-terminal-launcher-recipe-label">{name}</span>
    </button>
  );
}
