import { AlertCircle, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { AuxiliaryWorkbenchCreationRecipe } from "../../app-shell/auxiliary-workbench/types";
import type {
  AvailableTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import {
  getDesktopTerminalLauncher,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import { TerminalActivityGrid } from "./TerminalActivityGrid";
import { WorkbenchLauncherIcon } from "./WorkbenchLauncherIcon";
import "./terminal-launcher.css";

type TerminalLauncherProps = {
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
 * Agent rows create Chat Items; the single Shell row resolves to a Terminal.
 * Terminal CLI launch recipes remain in the model but are intentionally not
 * presented here until the product exposes them again.
 */
export function TerminalLauncher({
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
  const hasChat = Boolean(onCreateChat && chatRecipes.length > 0);
  const availabilityMessage = discoveryPhase === "error"
    ? "terminal.launcher.detectionFailed"
    : scanning
      ? "terminal.launcher.detecting"
      : null;

  return (
    <section className="desktop-terminal-launcher" aria-labelledby={titleId}>
      <div className="desktop-terminal-launcher-content">
        {hasChat && (
          <div
            className="desktop-terminal-launcher-group is-agents"
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
              {chatRecipes.map((recipe) => (
                <div key={recipe.id} role="listitem">
                  <ChatRecipeButton
                    creationAvailable={chatCreationAvailable && !busy}
                    recipe={recipe}
                    onCreate={onCreateChat!}
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

        {terminalEnabled && (
          <div className="desktop-terminal-launcher-group is-shell">
            <header className="desktop-terminal-launcher-heading">
              <h2 id={hasChat ? undefined : titleId}>
                {!hasChat && busy && (
                  <TerminalActivityGrid className="desktop-terminal-launcher-spinner" />
                )}
                <span>
                  {t(!hasChat && launching
                    ? "terminal.launcher.launching"
                    : "terminal.launcher.shell.title")}
                </span>
              </h2>
            </header>
            {!hasChat && launchError && (
              <div className="desktop-terminal-launcher-error" role="alert">
                <AlertCircle size={13} strokeWidth={1.7} aria-hidden="true" />
                <span>{launchError}</span>
              </div>
            )}
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
      className="desktop-terminal-launcher-tool"
      data-status={recipe.status}
      disabled={!available}
      aria-label={`${t("terminal.launcher.title")}: ${title}`}
      title={title}
      onClick={() => onCreate(recipe)}
    >
      <WorkbenchLauncherIcon iconKey={recipe.iconKey} />
      <span>{recipe.label}</span>
    </button>
  );
}
