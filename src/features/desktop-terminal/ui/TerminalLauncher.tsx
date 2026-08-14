import { RefreshCw, SquareTerminal } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  InstalledTerminalAgentId,
  TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherDefinition,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import "./terminal-launcher.css";

type TerminalLauncherProps = {
  discoveryPhase: TerminalAgentDiscoveryPhase;
  installedAgentIds: readonly InstalledTerminalAgentId[];
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
  onRefresh: () => void;
};

export function TerminalLauncher({
  discoveryPhase,
  installedAgentIds,
  onLaunch,
  onRefresh,
}: TerminalLauncherProps) {
  const { t } = useLocalization();
  const installedAgentIdSet = new Set(installedAgentIds);
  const agents = DESKTOP_TERMINAL_LAUNCHERS.filter(
    ({ id }) => id !== "shell" && installedAgentIdSet.has(id),
  );
  const shell = DESKTOP_TERMINAL_LAUNCHERS.find(({ id }) => id === "shell");
  const showAvailability = agents.length === 0;

  return (
    <section
      className="desktop-terminal-launcher"
      aria-labelledby="desktop-terminal-launcher-title"
    >
      <div className="desktop-terminal-launcher-content">
        <h2 id="desktop-terminal-launcher-title">
          {t("terminal.launcher.title")}
        </h2>

        <div className="desktop-terminal-launcher-tools">
          {agents.map((launcher) => (
            <TerminalLauncherButton
              key={launcher.id}
              launcher={launcher}
              onLaunch={onLaunch}
            />
          ))}
        </div>

        {showAvailability && (
          <div className="desktop-terminal-launcher-availability" aria-live="polite">
            <span>
              {t(discoveryPhase === "error"
                ? "terminal.launcher.detectionFailed"
                : discoveryPhase === "ready"
                  ? "terminal.launcher.noneInstalled"
                  : "terminal.launcher.detecting")}
            </span>
            {(discoveryPhase === "error" || discoveryPhase === "ready") && (
              <button type="button" onClick={onRefresh}>
                <RefreshCw size={12} strokeWidth={1.7} aria-hidden="true" />
                <span>{t("terminal.launcher.scanAgain")}</span>
              </button>
            )}
          </div>
        )}

        {shell && (
          <button
            type="button"
            className="desktop-terminal-launcher-shell"
            onClick={() => onLaunch(shell.id)}
            aria-label={`${t(shell.nameMessage)}. ${t(shell.descriptionMessage)}`}
            title={t(shell.descriptionMessage)}
          >
            <span className="desktop-terminal-launcher-shell-icon" aria-hidden="true">
              <SquareTerminal size={16} strokeWidth={1.6} />
            </span>
            <span>{t(shell.nameMessage)}</span>
          </button>
        )}
      </div>
    </section>
  );
}

type TerminalLauncherButtonProps = {
  launcher: DesktopTerminalLauncherDefinition;
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
};

function TerminalLauncherButton({ launcher, onLaunch }: TerminalLauncherButtonProps) {
  const { t } = useLocalization();

  return (
    <button
      type="button"
      className="desktop-terminal-launcher-tool"
      onClick={() => onLaunch(launcher.id)}
      aria-label={`${t(launcher.nameMessage)}. ${t(launcher.descriptionMessage)}`}
      title={t(launcher.descriptionMessage)}
    >
      <TerminalLauncherMark launcher={launcher} />
      <span>{t(launcher.nameMessage)}</span>
    </button>
  );
}

function TerminalLauncherMark({ launcher }: { launcher: DesktopTerminalLauncherDefinition }) {
  const image = launcher.icon === "codex"
    ? "/icons/ChatGPT_logo.png"
    : launcher.icon === "claude"
      ? "/icons/agent-claude-code.svg"
      : launcher.icon === "cursor"
        ? "/icons/agent-cursor.svg"
        : launcher.icon === "opencode"
          ? "/icons/agent-opencode.svg"
          : null;

  return (
    <span
      className={`desktop-terminal-launcher-mark is-${launcher.icon}`}
      aria-hidden="true"
    >
      {image && <img src={image} alt="" draggable={false} />}
    </span>
  );
}
