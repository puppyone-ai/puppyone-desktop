import { TerminalSessionHeaderStatus } from "../ui/session-header/TerminalSessionHeaderStatus";
import { WorkbenchLauncherIcon } from "../ui/WorkbenchLauncherIcon";
import type { TerminalWorkbenchHeaderItem } from "./TerminalWorkbenchHeader.types";

export function TerminalWorkbenchStatus({
  className,
  item,
}: {
  className: string;
  item: TerminalWorkbenchHeaderItem;
}) {
  if (item.terminalSession) {
    return <TerminalSessionHeaderStatus
      className={className}
      runtime={item.terminalRuntime}
      session={item.terminalSession}
    />;
  }
  return (
    <span
      className={`${className} desktop-terminal-chat-tab-status ${item.snapshot.running ? "is-running" : ""}`}
      data-status={item.snapshot.status}
      aria-hidden="true"
    >
      <WorkbenchLauncherIcon compact iconKey={item.snapshot.iconKey} />
      {item.snapshot.running && <i />}
    </span>
  );
}
