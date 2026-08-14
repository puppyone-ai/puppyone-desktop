import { SquareTerminal } from "lucide-react";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import "./terminal-launcher-icon.css";

const launcherIconSource: Partial<Record<DesktopTerminalLauncherId, string>> = {
  codex: "/icons/ChatGPT_logo.png",
  claude: "/icons/agent-claude-code.svg",
  cursor: "/icons/agent-cursor.svg",
  opencode: "/icons/agent-opencode.svg",
  pi: "/icons/agent-pi.svg",
  // Official 32px favicon from NousResearch/hermes-agent/website/static/img.
  hermes: "/icons/agent-hermes.png",
};

export function TerminalLauncherIcon({
  className = "",
  compact = false,
  launcherId,
}: {
  className?: string;
  compact?: boolean;
  launcherId: DesktopTerminalLauncherId | null;
}) {
  const iconKind = launcherId ?? "shell";
  const image = launcherIconSource[iconKind];

  return (
    <span
      className={`desktop-terminal-launcher-icon is-${iconKind} ${compact ? "is-compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" draggable={false} />
      ) : (
        <SquareTerminal size={compact ? 14 : 16} strokeWidth={1.6} />
      )}
    </span>
  );
}
