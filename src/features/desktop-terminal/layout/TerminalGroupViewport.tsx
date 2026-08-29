import { useCallback, type CSSProperties, type ReactNode } from "react";
import { isWorkbenchSplit } from "@puppyone/shared-ui";
import type { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";
import {
  terminalLeafMinimumSize,
  terminalSplitChildMinimumSizes,
  type TerminalSplitMinimumSize,
} from "../model/terminalSplitConstraints";
import type {
  DesktopTerminalGroup,
  DesktopTerminalLayoutNode,
  DesktopTerminalLayoutSplit,
} from "../model/terminalSessions";
import type { TerminalTabMoveDropIntent } from "../model/terminalTabMove";
import {
  terminalPanelId,
  terminalTabId,
} from "../ui/session-header/terminalSessionHeaderIds";
import { TerminalSplitResizeHandle } from "./TerminalSplitResizeHandle";
import {
  TerminalSessionHostSlot,
} from "./session-host/TerminalSessionHostSlot";
import type {
  PersistentTerminalSessionHosts,
} from "./session-host/usePersistentTerminalSessionHosts";

export type TerminalGroupViewportProps = Readonly<{
  dropIntent: TerminalTabMoveDropIntent | null;
  group: DesktopTerminalGroup;
  hosts: PersistentTerminalSessionHosts;
  runtimeRegistry: Pick<TerminalRuntimeRegistry, "get">;
  onResizeSplit: (splitId: string, ratio: number) => void;
}>;

export function TerminalGroupViewport({
  dropIntent,
  group,
  hosts,
  runtimeRegistry,
  onResizeSplit,
}: TerminalGroupViewportProps) {
  const getLeafMinimum = useCallback((sessionId: string) => terminalLeafMinimumSize(
    runtimeRegistry.get(sessionId)?.getMinimumViewportSize(),
  ), [runtimeRegistry]);

  return (
    <div className="desktop-terminal-group-viewport" data-terminal-group-id={group.id}>
      <TerminalLayoutNode
        node={group.root}
        dropIntent={dropIntent}
        focusedSessionId={group.focusedSessionId}
        getLeafMinimum={getLeafMinimum}
        hosts={hosts}
        onResizeSplit={onResizeSplit}
      />
    </div>
  );
}

type TerminalLayoutNodeProps = Readonly<{
  node: DesktopTerminalLayoutNode;
  dropIntent: TerminalTabMoveDropIntent | null;
  focusedSessionId: string;
  getLeafMinimum: (sessionId: string) => TerminalSplitMinimumSize;
  hosts: PersistentTerminalSessionHosts;
  onResizeSplit: TerminalGroupViewportProps["onResizeSplit"];
}>;

function TerminalLayoutNode(props: TerminalLayoutNodeProps): ReactNode {
  if (!isWorkbenchSplit(props.node)) {
    const intent = props.dropIntent?.targetSessionId === props.node.sessionId
      ? props.dropIntent
      : null;
    return (
      <TerminalSessionHostSlot
        dropAllowed={intent?.allowed ?? false}
        dropEdge={intent?.edge ?? null}
        focused={props.focusedSessionId === props.node.sessionId}
        host={props.hosts.get(props.node.sessionId)!}
        labelledBy={terminalTabId(props.node.sessionId)}
        panelId={terminalPanelId(props.node.sessionId)}
        sessionId={props.node.sessionId}
      />
    );
  }
  return <TerminalSplit {...props} split={props.node} />;
}

function TerminalSplit({
  node: _node,
  split,
  ...props
}: TerminalLayoutNodeProps & { split: DesktopTerminalLayoutSplit }) {
  const minimums = terminalSplitChildMinimumSizes(split, props.getLeafMinimum);
  const style = {
    "--desktop-terminal-first-track": `${split.ratio}fr`,
    "--desktop-terminal-second-track": `${1 - split.ratio}fr`,
  } as CSSProperties;

  return (
    <div
      className="desktop-terminal-split"
      data-direction={split.direction}
      data-terminal-split-id={split.id}
      style={style}
    >
      <TerminalLayoutNode key={split.first.id} {...props} node={split.first} />
      <TerminalSplitResizeHandle
        key={split.id}
        direction={split.direction}
        firstMinimum={minimums.first}
        secondMinimum={minimums.second}
        ratio={split.ratio}
        splitId={split.id}
        onCommit={props.onResizeSplit}
      />
      <TerminalLayoutNode key={split.second.id} {...props} node={split.second} />
    </div>
  );
}
