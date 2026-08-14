import { ArrowRight, SquareTerminal } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherDefinition,
  type DesktopTerminalLauncherId,
} from "../model/terminalLaunchers";
import "./terminal-launcher.css";

type TerminalLauncherProps = {
  onLaunch: (launcherId: DesktopTerminalLauncherId) => void;
};

export function TerminalLauncher({ onLaunch }: TerminalLauncherProps) {
  const { t } = useLocalization();
  const codingTools = DESKTOP_TERMINAL_LAUNCHERS.filter(({ id }) => id !== "shell");
  const shell = DESKTOP_TERMINAL_LAUNCHERS.find(({ id }) => id === "shell");

  return (
    <section
      className="desktop-terminal-launcher"
      aria-labelledby="desktop-terminal-launcher-title"
    >
      <div className="desktop-terminal-launcher-content">
        <div className="desktop-terminal-launcher-intro">
          <span className="desktop-terminal-launcher-kicker">
            {t("terminal.launcher.kicker")}
          </span>
          <h2 id="desktop-terminal-launcher-title">
            {t("terminal.launcher.title")}
          </h2>
          <p>{t("terminal.launcher.description")}</p>
        </div>

        <div className="desktop-terminal-launcher-tools">
          {codingTools.map((launcher) => (
            <TerminalLauncherButton
              key={launcher.id}
              launcher={launcher}
              onLaunch={onLaunch}
            />
          ))}
        </div>

        {shell && (
          <button
            type="button"
            className="desktop-terminal-launcher-shell"
            onClick={() => onLaunch(shell.id)}
          >
            <span className="desktop-terminal-launcher-shell-icon" aria-hidden="true">
              <SquareTerminal size={16} strokeWidth={1.7} />
            </span>
            <span className="desktop-terminal-launcher-shell-copy">
              <strong>{t(shell.nameMessage)}</strong>
              <span>{t(shell.descriptionMessage)}</span>
            </span>
            <ArrowRight
              className="desktop-terminal-launcher-arrow"
              size={14}
              strokeWidth={1.7}
              aria-hidden="true"
            />
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
    >
      <TerminalLauncherMark launcher={launcher} />
      <span className="desktop-terminal-launcher-tool-copy">
        <strong>{t(launcher.nameMessage)}</strong>
        <span>{t(launcher.descriptionMessage)}</span>
      </span>
      <ArrowRight
        className="desktop-terminal-launcher-arrow"
        size={14}
        strokeWidth={1.7}
        aria-hidden="true"
      />
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
