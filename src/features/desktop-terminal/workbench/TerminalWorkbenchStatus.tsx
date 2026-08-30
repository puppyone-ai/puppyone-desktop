import { MessageSquare } from "lucide-react";
import { TerminalSessionHeaderStatus } from "../ui/session-header/TerminalSessionHeaderStatus";
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
      <MessageSquare size={13} strokeWidth={1.8} />
      {item.snapshot.running && <i />}
    </span>
  );
}
