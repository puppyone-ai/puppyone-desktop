import {
  useMemo,
  useRef,
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
import type { TerminalTabMoveDropIntent } from "../model/terminalTabMove";
import { TERMINAL_SPLIT_DIVIDER_SIZE } from "../model/terminalSplitConstraints";
import { TerminalSplitResizeHandle } from "../layout/TerminalSplitResizeHandle";
import { useTerminalGroupHandleReveal } from "../layout/useTerminalGroupHandleReveal";
import { terminalPanelId, terminalTabId } from "../ui/session-header/terminalSessionHeaderIds";
import type {
  TerminalWorkbenchCreateOption,
  TerminalWorkbenchHeaderItem,
} from "./TerminalWorkbenchHeader.types";
import { TerminalWorkbenchGroupMoveHandle } from "./TerminalWorkbenchGroupMoveHandle";
import { TerminalWorkbenchHeader } from "./TerminalWorkbenchHeader";
import { TerminalWorkbenchItemHostSlot } from "./TerminalWorkbenchItemHostSlot";

export type TerminalWorkbenchViewportProps = Readonly<{
  activeGroupId: string | null;
  createOptions: (groupId: string) => readonly TerminalWorkbenchCreateOption[];
  dropIntent: TerminalTabMoveDropIntent | null;
  getLeafMinimum: (groupId: string) => WorkbenchSplitMinimumSize;
  groups: readonly AuxiliaryWorkbenchGroup[];
  headerItems: readonly TerminalWorkbenchHeaderItem[];
  hosts: ReadonlyMap<string, HTMLDivElement>;
  root: AuxiliaryWorkbenchLayoutNode;
  itemMove: TerminalTabMoveDragController;
  onActivateItem: (itemId: string) => void;
  onCloseItem: (itemId: string) => void;
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
  createOptions,
  dropIntent,
  group,
  headerItemById,
  hosts,
  itemMove,
  onActivateItem,
  onCloseItem,
  onMoveByKeyboard,
}: LayoutNodeProps & { group: AuxiliaryWorkbenchGroup }) {
  const groupRef = useRef<HTMLElement>(null);
  const headerItems = group.itemIds
    .map((itemId) => headerItemById.get(itemId))
    .filter((item): item is TerminalWorkbenchHeaderItem => Boolean(item));
  const intent = dropIntent?.targetGroupId === group.id ? dropIntent : null;
  const edgeIntent = intent?.kind === "split" || intent?.kind === "move-group"
    ? intent
    : null;
  const insertIntent = intent?.kind === "insert" || intent?.kind === "merge-group"
    ? intent
    : null;
  const activeItem = headerItemById.get(group.activeItemId);
  const host = hosts.get(group.activeItemId);
  const handleReveal = useTerminalGroupHandleReveal(groupRef, Boolean(intent));

  return (
    <section
      ref={groupRef}
      className="desktop-terminal-tab-group"
      data-terminal-group-pane-id={group.id}
      data-focused={activeGroupId === group.id ? "true" : undefined}
      data-handle-hot={handleReveal.revealed ? "true" : undefined}
      data-drop-target={edgeIntent?.edge}
      onPointerMove={handleReveal.onPointerMove}
      onPointerLeave={handleReveal.onPointerLeave}
    >
      <TerminalWorkbenchHeader
        activeItemId={group.activeItemId}
        createOptions={createOptions(group.id)}
        dropInsertion={insertIntent}
        groupId={group.id}
        items={headerItems}
        onActivate={onActivateItem}
        onClose={onCloseItem}
        onMoveByKeyboard={(itemId, edge) => onMoveByKeyboard(itemId, group.id, edge)}
        presentedItemIds={[group.activeItemId]}
        tabMove={itemMove}
      />
      {activeItem && (
        <TerminalWorkbenchGroupMoveHandle
          groupId={group.id}
          itemId={activeItem.id}
          itemIds={group.itemIds}
          label={activeItem.snapshot.title}
          itemMove={itemMove}
          onActivate={onActivateItem}
        />
      )}
      <div
        className="desktop-terminal-tab-group-content"
        data-terminal-content-drop-group-id={group.id}
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
      </div>
      {edgeIntent && (
        <div
          className="desktop-terminal-drop-preview"
          data-edge={edgeIntent.edge}
          data-allowed={edgeIntent.allowed ? "true" : "false"}
          data-operation={edgeIntent.kind}
          aria-hidden="true"
        />
      )}
      <div className="desktop-terminal-pane-interaction-frame" aria-hidden="true" />
    </section>
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
