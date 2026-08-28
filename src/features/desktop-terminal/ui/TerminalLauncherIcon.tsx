import { SquareTerminal } from "lucide-react";
import {
  RENDERER_ASSET_PATHS,
  resolveRendererPublicAssetUrl,
} from "@puppyone/shared-ui";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import "./terminal-launcher-icon.css";

const launcherIconSource: Partial<Record<DesktopTerminalLauncherId, string>> = {
  codex: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.codexLight),
  claude: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.claudeCode),
  cursor: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.cursor),
  opencode: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.opencode),
  pi: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.pi),
  // Official 32px favicon from NousResearch/hermes-agent/website/static/img.
  hermes: resolveRendererPublicAssetUrl(RENDERER_ASSET_PATHS.icons.agents.hermes),
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
