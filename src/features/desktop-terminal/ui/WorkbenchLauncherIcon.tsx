import { MessageSquare } from "lucide-react";
import { PuppyBrandMark } from "../../../components/brand/PuppyBrandMark";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { TerminalLauncherIcon } from "./TerminalLauncherIcon";

const chatIconLauncherIds: Readonly<Record<string, DesktopTerminalLauncherId>> = Object.freeze({
  codex: "codex",
  claude: "claude",
  cursor: "cursor",
  opencode: "opencode",
  "opencode-native": "opencode",
});

export function WorkbenchLauncherIcon({
  compact = false,
  iconKey,
  launcherId,
}: Readonly<{
  compact?: boolean;
  iconKey?: string | null;
  launcherId?: DesktopTerminalLauncherId;
}>) {
  if (launcherId) return <TerminalLauncherIcon compact={compact} launcherId={launcherId} />;
  const normalizedIconKey = iconKey?.toLowerCase() ?? "";
  const terminalIconId = chatIconLauncherIds[normalizedIconKey];
  if (terminalIconId) return <TerminalLauncherIcon compact={compact} launcherId={terminalIconId} />;
  if (normalizedIconKey.includes("puppyone")) {
    return (
      <span
        className={`desktop-terminal-launcher-icon is-puppyone ${compact ? "is-compact" : ""}`}
        aria-hidden="true"
      >
        <PuppyBrandMark tone="dark" />
      </span>
    );
  }
  return (
    <span
      className={`desktop-terminal-launcher-icon is-chat-fallback ${compact ? "is-compact" : ""}`}
      aria-hidden="true"
    >
      <MessageSquare size={compact ? 14 : 16} strokeWidth={1.7} />
    </span>
  );
}
