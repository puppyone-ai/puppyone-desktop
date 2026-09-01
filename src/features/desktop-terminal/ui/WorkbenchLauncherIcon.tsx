import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { TerminalLauncherIcon } from "./TerminalLauncherIcon";

export function WorkbenchLauncherIcon({
  compact = false,
  iconKey,
  launcherId,
}: Readonly<{
  compact?: boolean;
  iconKey?: string | null;
  launcherId?: DesktopTerminalLauncherId;
}>) {
  return (
    <TerminalLauncherIcon
      compact={compact}
      fallback="chat"
      iconKey={iconKey}
      launcherId={launcherId}
    />
  );
}
