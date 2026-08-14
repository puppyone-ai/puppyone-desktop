import { AlertCircle, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AvailableTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherDefinition,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import { partitionTerminalAgentLaunchers } from "../model/terminalLauncherPresentation";
import { TerminalActivityGrid } from "./TerminalActivityGrid";
import { TerminalLauncherIcon } from "./TerminalLauncherIcon";
import "./terminal-launcher.css";

type TerminalLauncherProps = {
  discoveryPhase: TerminalAgentDiscoveryPhase;
  availableAgentIds: readonly AvailableTerminalAgentId[];
  launchError?: string | null;
  launching?: boolean;
  titleId?: string;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

export function TerminalLauncher({
  discoveryPhase,
  availableAgentIds,
  launchError = null,
  launching = false,
  onLaunch,
  onRefresh,
  titleId = "desktop-terminal-launcher-title",
}: TerminalLauncherProps) {
  const { t } = useLocalization();
  const installedAgentIdSet = new Set(availableAgentIds);
  const agents = DESKTOP_TERMINAL_LAUNCHERS.filter(
    ({ id }) => id !== "shell" && installedAgentIdSet.has(id),
  );
  const visibleAgents = partitionTerminalAgentLaunchers(agents);
  const shell = DESKTOP_TERMINAL_LAUNCHERS.find(({ id }) => id === "shell");
  const availabilityMessage = discoveryPhase === "error"
    ? "terminal.launcher.detectionFailed"
    : discoveryPhase === "idle" || discoveryPhase === "loading"
      ? "terminal.launcher.detecting"
      : agents.length === 0
        ? "terminal.launcher.noneInstalled"
        : null;

  return (
    <section
      className="desktop-terminal-launcher"
      aria-labelledby={titleId}
    >
      <div className="desktop-terminal-launcher-content">
        <div className="desktop-terminal-launcher-group is-agents">
          <header className="desktop-terminal-launcher-heading">
            <h2 id={titleId}>
              {launching && (
                <TerminalActivityGrid
                  className="desktop-terminal-launcher-spinner"
                />
              )}
              <span>{t(launching ? "terminal.launcher.launching" : "terminal.launcher.title")}</span>
            </h2>
            <button
              type="button"
              className="desktop-terminal-launcher-scan"
              onClick={onRefresh}
              disabled={launching || discoveryPhase === "idle" || discoveryPhase === "loading"}
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

          <div className="desktop-terminal-launcher-tools">
            {visibleAgents.primary.map((launcher) => (
              <TerminalLauncherButton
                key={launcher.id}
                launcher={launcher}
                disabled={launching}
                onLaunch={onLaunch}
              />
            ))}
          </div>

          {visibleAgents.overflow.length > 0 && (
            <details className="desktop-terminal-launcher-more">
              <summary>{t("terminal.launcher.moreAgents")}</summary>
              <div className="desktop-terminal-launcher-tools">
                {visibleAgents.overflow.map((launcher) => (
                  <TerminalLauncherButton
                    key={launcher.id}
                    launcher={launcher}
                    disabled={launching}
                    onLaunch={onLaunch}
                  />
                ))}
              </div>
            </details>
          )}

          {availabilityMessage && (
            <div className="desktop-terminal-launcher-availability" aria-live="polite">
              <span>{t(availabilityMessage)}</span>
            </div>
          )}
        </div>

        {shell && (
          <div className="desktop-terminal-launcher-group is-shell">
            <header className="desktop-terminal-launcher-heading">
              <h2 id="desktop-terminal-launcher-shell-title">
                <span>{t("terminal.launcher.shell.title")}</span>
              </h2>
            </header>
            <button
              type="button"
              className="desktop-terminal-launcher-shell"
              onClick={() => onLaunch(shell.id)}
              disabled={launching}
              aria-label={`${t(shell.nameMessage)}. ${t(shell.descriptionMessage)}`}
              title={t(shell.descriptionMessage)}
            >
              <TerminalLauncherIcon
                className="desktop-terminal-launcher-shell-icon"
                launcherId="shell"
              />
              <span>{t(shell.nameMessage)}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

type TerminalLauncherButtonProps = {
  disabled: boolean;
  launcher: DesktopTerminalLauncherDefinition;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
};

function TerminalLauncherButton({ disabled, launcher, onLaunch }: TerminalLauncherButtonProps) {
  const { t } = useLocalization();

  return (
    <button
      type="button"
      className="desktop-terminal-launcher-tool"
      disabled={disabled}
      onClick={() => onLaunch(launcher.id)}
      aria-label={`${t(launcher.nameMessage)}. ${t(launcher.descriptionMessage)}`}
      title={t(launcher.descriptionMessage)}
    >
      <TerminalLauncherIcon launcherId={launcher.id} />
      <span>{t(launcher.nameMessage)}</span>
    </button>
  );
}
