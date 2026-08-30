import {
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  isWorkbenchSplit,
  workbenchSplitNodeMinimumSize,
  type AuxiliaryWorkbenchGroup,
  type AuxiliaryWorkbenchLayoutNode,
  type AuxiliaryWorkbenchLayoutSplit,
  type WorkbenchSplitDropEdge,
  type WorkbenchSplitMinimumSize,
} from "@puppyone/shared-ui";
import type { TerminalTabMoveDragController } from "../interactions/useTerminalTabMoveDrag";
import {
  partitionTerminalGroupDropIntent,
  type TerminalTabMoveDropIntent,
} from "../model/terminalTabMove";
import { TERMINAL_SPLIT_DIVIDER_SIZE } from "../model/terminalSplitConstraints";
import { TerminalGroupPane } from "../layout/TerminalGroupPane";
import { TerminalSplitResizeHandle } from "../layout/TerminalSplitResizeHandle";
import { terminalPanelId, terminalTabId } from "../ui/session-header/terminalSessionHeaderIds";
import type { TerminalWorkbenchHeaderItem } from "./TerminalWorkbenchHeader.types";
import { TerminalWorkbenchGroupMoveHandle } from "./TerminalWorkbenchGroupMoveHandle";
import { TerminalWorkbenchHeader } from "./TerminalWorkbenchHeader";
import { TerminalWorkbenchItemHostSlot } from "./TerminalWorkbenchItemHostSlot";

export type TerminalWorkbenchViewportProps = Readonly<{
  activeGroupId: string | null;
  dropIntent: TerminalTabMoveDropIntent | null;
  getLeafMinimum: (groupId: string) => WorkbenchSplitMinimumSize;
  groups: readonly AuxiliaryWorkbenchGroup[];
  headerItems: readonly TerminalWorkbenchHeaderItem[];
  hosts: ReadonlyMap<string, HTMLDivElement>;
  root: AuxiliaryWorkbenchLayoutNode;
  itemMove: TerminalTabMoveDragController;
  onActivateItem: (itemId: string) => void;
  onCloseItem: (itemId: string) => void;
  onCreateItem: (groupId: string) => void;
  onMoveByKeyboard: (
    itemId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
}>;

export function TerminalWorkbenchViewport(props: TerminalWorkbenchViewportProps) {
  const groupById = useMemo(
    () => new Map(props.groups.map((group) => [group.id, group])),
    [props.groups],
  );
  const headerItemById = useMemo(
    () => new Map(props.headerItems.map((item) => [item.id, item])),
    [props.headerItems],
  );
  return (
    <div className="desktop-terminal-group-viewport">
      <TerminalWorkbenchLayoutNode
        {...props}
        groupById={groupById}
        headerItemById={headerItemById}
        node={props.root}
      />
    </div>
  );
}

type LayoutNodeProps = TerminalWorkbenchViewportProps & Readonly<{
  groupById: ReadonlyMap<string, AuxiliaryWorkbenchGroup>;
  headerItemById: ReadonlyMap<string, TerminalWorkbenchHeaderItem>;
  node: AuxiliaryWorkbenchLayoutNode;
}>;

function TerminalWorkbenchLayoutNode(props: LayoutNodeProps): ReactNode {
  if (!isWorkbenchSplit(props.node)) {
    const group = props.groupById.get(props.node.groupId);
    return group ? <TerminalWorkbenchGroupLeaf {...props} group={group} /> : null;
  }
  return <TerminalWorkbenchSplit {...props} split={props.node} />;
}

function TerminalWorkbenchGroupLeaf({
  activeGroupId,
  dropIntent,
  group,
  headerItemById,
  hosts,
  itemMove,
  onActivateItem,
  onCloseItem,
  onCreateItem,
  onMoveByKeyboard,
}: LayoutNodeProps & { group: AuxiliaryWorkbenchGroup }) {
  const headerItems = group.itemIds
    .map((itemId) => headerItemById.get(itemId))
    .filter((item): item is TerminalWorkbenchHeaderItem => Boolean(item));
  const dropZones = partitionTerminalGroupDropIntent(dropIntent, group.id);
  const activeItem = headerItemById.get(group.activeItemId);
  const host = hosts.get(group.activeItemId);

  return (
    <TerminalGroupPane
      contentDropIntent={dropZones.content}
      focused={activeGroupId === group.id}
      groupId={group.id}
      header={<TerminalWorkbenchHeader
        activeItemId={group.activeItemId}
        dropInsertion={dropZones.tabBar}
        groupId={group.id}
        items={headerItems}
        onActivate={onActivateItem}
        onClose={onCloseItem}
        onCreate={() => onCreateItem(group.id)}
        onMoveByKeyboard={(itemId, edge) => onMoveByKeyboard(itemId, group.id, edge)}
        presentedItemIds={[group.activeItemId]}
        tabMove={itemMove}
      />}
      moveHandle={activeItem ? (
        <TerminalWorkbenchGroupMoveHandle
          groupId={group.id}
          itemId={activeItem.id}
          itemIds={group.itemIds}
          label={activeItem.snapshot.title}
          itemMove={itemMove}
          onActivate={onActivateItem}
        />
      ) : null}
    >
      {activeItem && host && (
        <TerminalWorkbenchItemHostSlot
          focused={activeGroupId === group.id}
          host={host}
          labelledBy={terminalTabId(activeItem.id)}
          panelId={terminalPanelId(activeItem.id)}
          itemId={activeItem.id}
        />
      )}
    </TerminalGroupPane>
  );
}

function TerminalWorkbenchSplit({
  node: _node,
  split,
  ...props
}: LayoutNodeProps & { split: AuxiliaryWorkbenchLayoutSplit }) {
  const getMinimum = (node: AuxiliaryWorkbenchLayoutNode) => workbenchSplitNodeMinimumSize(
    node,
    (leaf) => props.getLeafMinimum(leaf.groupId),
    TERMINAL_SPLIT_DIVIDER_SIZE,
  );
  const firstMinimum = getMinimum(split.first);
  const secondMinimum = getMinimum(split.second);
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
      <TerminalWorkbenchLayoutNode key={split.first.id} {...props} node={split.first} />
      <TerminalSplitResizeHandle
        key={split.id}
        direction={split.direction}
        firstMinimum={firstMinimum}
        secondMinimum={secondMinimum}
        ratio={split.ratio}
        splitId={split.id}
        onCommit={props.onResizeSplit}
      />
      <TerminalWorkbenchLayoutNode key={split.second.id} {...props} node={split.second} />
    </div>
  );
}
