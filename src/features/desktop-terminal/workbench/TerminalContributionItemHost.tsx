import { useCallback } from "react";
import type { AuxiliaryWorkbenchItem } from "@puppyone/shared-ui";
import type {
  AuxiliaryWorkbenchContribution,
  AuxiliaryWorkbenchItemSnapshot,
} from "../../app-shell/auxiliary-workbench/types";

export function TerminalContributionItemHost({
  contribution,
  item,
  sidebarVisible,
  presented,
  commandTarget,
  domFocused,
  peerSnapshots,
  onActivate,
  onFocus,
  onPresentationChange,
}: Readonly<{
  contribution: AuxiliaryWorkbenchContribution;
  item: AuxiliaryWorkbenchItem;
  sidebarVisible: boolean;
  presented: boolean;
  commandTarget: boolean;
  domFocused: boolean;
  peerSnapshots: ReadonlyMap<string, AuxiliaryWorkbenchItemSnapshot>;
  onActivate: (itemId: string) => void;
  onFocus: (itemId: string) => void;
  onPresentationChange: (itemId: string, snapshot: AuxiliaryWorkbenchItemSnapshot) => void;
}>) {
  const present = useCallback(
    (snapshot: AuxiliaryWorkbenchItemSnapshot) => onPresentationChange(item.id, snapshot),
    [item.id, onPresentationChange],
  );
  return (
    <div
      className="desktop-terminal-session-host-content desktop-terminal-contribution-host"
      data-item-kind={item.kind}
      aria-hidden={!presented}
      onPointerDownCapture={() => onActivate(item.id)}
      onFocusCapture={() => {
        onFocus(item.id);
        onActivate(item.id);
      }}
    >
      {contribution.renderItem({
        item,
        presentation: { sidebarVisible, presented, commandTarget, domFocused },
        peerSnapshots,
        onPresentationChange: present,
      })}
    </div>
  );
}
