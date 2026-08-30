import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  AuxiliaryWorkbenchItem,
  WorkbenchSplitDropEdge,
  WorkbenchSplitMinimumSize,
  Workspace,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AuxiliaryWorkbenchContribution,
  AuxiliaryWorkbenchCreationRecipe,
} from "../../app-shell/auxiliary-workbench/types";
import { useAuxiliaryWorkbenchContributions } from "../../app-shell/auxiliary-workbench/useAuxiliaryWorkbenchContributions";
import { useTerminalAgentLocator } from "../controller/useTerminalAgentLocator";
import { useTerminalTabMoveDrag } from "../interactions/useTerminalTabMoveDrag";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import {
  canPlaceTerminalSplit,
  terminalLeafMinimumSize,
} from "../model/terminalSplitConstraints";
import { usePersistentTerminalSessionHosts } from "../layout/session-host/usePersistentTerminalSessionHosts";
import { useTerminalAppearanceSync } from "../runtime/useTerminalAppearanceSync";
import {
  AGENT_CHAT_WORKBENCH_ITEM_KIND,
  TERMINAL_WORKBENCH_ITEM_KIND,
  useTerminalWorkbench,
} from "../workbench/useTerminalWorkbench";
import { TerminalContributionItemHost } from "../workbench/TerminalContributionItemHost";
import { TerminalWorkbenchCreationFailure } from "../workbench/TerminalWorkbenchCreationFailure";
import { useTerminalWorkbenchSnapshots } from "../workbench/useTerminalWorkbenchSnapshots";
import { TerminalWorkbenchViewport } from "../workbench/TerminalWorkbenchViewport";
import { TerminalCloseConfirmationDialog } from "./TerminalCloseConfirmationDialog";
import { TerminalLauncher } from "./TerminalLauncher";
import { TerminalSessionHost } from "./TerminalSessionHost";
import "@xterm/xterm/css/xterm.css";
import "./desktop-terminal.css";

type RightTerminalPanelProps = Readonly<{
  workspace: Workspace;
  active: boolean;
  terminalEnabled?: boolean;
  hiddenAgentIds: readonly string[];
  contributions?: readonly AuxiliaryWorkbenchContribution[];
}>;

export function RightTerminalPanel({
  workspace,
  active,
  terminalEnabled = true,
  hiddenAgentIds,
  contributions = [],
}: RightTerminalPanelProps) {
  const { t } = useLocalization();
  const panelRef = useRef<HTMLElement>(null);
  const closingItemIdsRef = useRef(new Set<string>());
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const workbench = useTerminalWorkbench({ messageFormatter: t });
  const currentRoot = useMemo(
    () => ({ id: workspace.id, path: workspace.path }),
    [workspace.id, workspace.path],
  );
  const presentedItemIdSet = useMemo(
    () => new Set(workbench.presentedItemIds),
    [workbench.presentedItemIds],
  );
  const itemById = useMemo(
    () => new Map(workbench.items.map((item) => [item.id, item])),
    [workbench.items],
  );
  const reserveContributionItem = useCallback((
    contribution: AuxiliaryWorkbenchContribution,
  ) => workbench.reserveContributionItem(contribution.kind, currentRoot), [currentRoot, workbench]);
  const commitContributionItem = useCallback((
    _contribution: AuxiliaryWorkbenchContribution,
    item: AuxiliaryWorkbenchItem,
    targetGroupId: string | null,
  ) => workbench.commitContributionItem(item, targetGroupId), [workbench]);
  const {
    canCreate: canCreateContribution,
    contributionByKind,
    create: createContributionItem,
    creationFailure,
    dismissCreationFailure,
    preparingKinds,
  } = useAuxiliaryWorkbenchContributions({
    contributions,
    items: workbench.items,
    onReserve: reserveContributionItem,
    onCommit: commitContributionItem,
  });
  const {
    headerItems,
    itemIds,
    snapshotById,
    updateSnapshot,
  } = useTerminalWorkbenchSnapshots({
    contributions: contributionByKind,
    items: workbench.items,
    runtimeRegistry: workbench.runtimeRegistry,
    terminalById: workbench.terminalById,
    t,
  });
  const hosts = usePersistentTerminalSessionHosts(itemIds);
  const agentChatContribution = contributionByKind.get(AGENT_CHAT_WORKBENCH_ITEM_KIND) ?? null;
  const chatRecipes = agentChatContribution?.creationRecipes ?? [];
  const canCreateChat = Boolean(agentChatContribution && chatRecipes.some((recipe) => (
    canCreateContribution(agentChatContribution, recipe)
  )));
  const chatPreparing = preparingKinds.has(AGENT_CHAT_WORKBENCH_ITEM_KIND);

  const presentedTerminalSessions = useMemo(() => workbench.presentedItemIds.flatMap(
    (itemId) => {
      const session = workbench.terminalById.get(itemId);
      return session ? [session] : [];
    },
  ), [workbench.presentedItemIds, workbench.terminalById]);
  const launcherVisible = active && (
    workbench.items.length === 0
    || presentedTerminalSessions.some((session) => (
      session.status === "selecting" || session.status === "starting"
    ))
  );
  const {
    ids: availableAgentIds,
    phase: agentDiscoveryPhase,
    refresh: refreshAvailableAgents,
  } = useTerminalAgentLocator({ enabled: launcherVisible });
  const visibleAgentIds = useMemo(() => {
    const hidden = new Set(hiddenAgentIds);
    return availableAgentIds.filter((agentId) => !hidden.has(agentId));
  }, [availableAgentIds, hiddenAgentIds]);
  const canLaunch = useCallback((launcherId: DesktopTerminalLauncherId) => (
    terminalEnabled && launcherId === "shell"
  ), [terminalEnabled]);
  const createDetectedTerminal = useCallback((launcherId: DesktopTerminalLauncherId) => {
    if (terminalEnabled && canLaunch(launcherId)) {
      workbench.createTerminal(currentRoot, launcherId);
    }
  }, [canLaunch, currentRoot, terminalEnabled, workbench]);
  const launchDetectedTerminal = useCallback((
    itemId: string,
    launcherId: DesktopTerminalLauncherId,
  ) => {
    if (terminalEnabled && canLaunch(launcherId)) workbench.launchTerminal(itemId, launcherId);
  }, [canLaunch, terminalEnabled, workbench]);
  const createChat = useCallback((
    recipe: AuxiliaryWorkbenchCreationRecipe,
    targetGroupId: string | null = workbench.activeGroup?.id ?? null,
  ) => (
    agentChatContribution
      ? createContributionItem(agentChatContribution, targetGroupId, recipe)
      : null
  ), [agentChatContribution, createContributionItem, workbench.activeGroup?.id]);
  const createChatFromLauncher = useCallback(async (
    launcherItemId: string,
    recipe: AuxiliaryWorkbenchCreationRecipe,
  ) => {
    if (!agentChatContribution) return;
    const targetGroupId = workbench.groups.find(
      (group) => group.itemIds.includes(launcherItemId),
    )?.id ?? null;
    const createdItemId = await createContributionItem(
      agentChatContribution,
      targetGroupId,
      recipe,
    );
    if (createdItemId) workbench.requestCloseTerminal(launcherItemId);
  }, [agentChatContribution, createContributionItem, workbench]);

  useEffect(() => {
    if (!presentedTerminalSessions.some((session) => session.launchError)) return;
    void refreshAvailableAgents();
  }, [presentedTerminalSessions, refreshAvailableAgents]);

  const getItemMinimum = useCallback((itemId: string): WorkbenchSplitMinimumSize => {
    const item = itemById.get(itemId);
    const contribution = item ? contributionByKind.get(item.kind) : null;
    if (contribution) return contribution.minimumSize;
    return terminalLeafMinimumSize(
      workbench.runtimeRegistry.get(itemId)?.getMinimumViewportSize(),
    );
  }, [contributionByKind, itemById, workbench.runtimeRegistry]);
  const getGroupMinimum = useCallback((groupId: string): WorkbenchSplitMinimumSize => {
    const group = workbench.groups.find((candidate) => candidate.id === groupId);
    return maximumMinimum(group?.itemIds.map(getItemMinimum) ?? []);
  }, [getItemMinimum, workbench.groups]);

  const canDropItem = useCallback((
    sourceItemId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
    targetGroupPane: HTMLElement,
  ) => {
    const sourceGroup = workbench.groups.find((group) => group.itemIds.includes(sourceItemId));
    const targetGroup = workbench.groups.find((group) => group.id === targetGroupId);
    if (!sourceGroup || !targetGroup || !workbench.itemCanSplit(sourceItemId, targetGroupId)) {
      return false;
    }
    if (sourceGroup.id !== targetGroup.id && sourceGroup.itemIds.length === 1) return true;
    const targetItemIds = targetGroup.itemIds.filter((itemId) => itemId !== sourceItemId);
    return canPlaceTerminalSplit(
      targetGroupPane.getBoundingClientRect(),
      edge,
      getItemMinimum(sourceItemId),
      maximumMinimum(targetItemIds.map(getItemMinimum)),
    );
  }, [getItemMinimum, workbench]);

  const itemMove = useTerminalTabMoveDrag({
    canDrop: canDropItem,
    canInsert: workbench.itemCanInsert,
    canMergeGroup: workbench.groupCanMerge,
    canMoveGroup: workbench.groupCanMove,
    onInsertSession: workbench.mergeItem,
    onMergeGroup: workbench.mergeGroup,
    onMoveGroup: workbench.moveGroup,
    onMoveSession: workbench.splitItem,
  });
  const moveItemByKeyboard = useCallback((
    sourceItemId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    const targetPane = panelRef.current?.querySelector<HTMLElement>(
      `[data-terminal-content-drop-group-id="${targetGroupId}"]`,
    );
    if (targetPane && canDropItem(sourceItemId, targetGroupId, edge, targetPane)) {
      workbench.splitItem(sourceItemId, targetGroupId, edge);
    }
  }, [canDropItem, workbench]);

  const requestCloseItem = useCallback(async (itemId: string) => {
    const item = itemById.get(itemId);
    if (!item || closingItemIdsRef.current.has(itemId)) return;
    if (item.kind === TERMINAL_WORKBENCH_ITEM_KIND) {
      workbench.requestCloseTerminal(itemId);
      return;
    }
    const contribution = contributionByKind.get(item.kind);
    if (!contribution) return;
    closingItemIdsRef.current.add(itemId);
    try {
      if (await contribution.requestClose(item)) workbench.removeItem(itemId);
    } finally {
      closingItemIdsRef.current.delete(itemId);
    }
  }, [contributionByKind, itemById, workbench]);

  useTerminalAppearanceSync(panelRef, workbench.runtimeRegistry);
  return (
    <section ref={panelRef} className="desktop-terminal-panel" aria-label={t("terminal.title")}>
      <div className={`desktop-terminal-body ${workbench.items.length === 0 ? "is-empty" : ""}`}>
        {creationFailure && (
          <TerminalWorkbenchCreationFailure
            failure={creationFailure}
            onDismiss={dismissCreationFailure}
          />
        )}
        {workbench.items.length === 0 ? (
          <TerminalLauncher
            discoveryPhase={agentDiscoveryPhase}
            availableAgentIds={visibleAgentIds}
            chatCreationAvailable={canCreateChat}
            chatPreparing={chatPreparing}
            chatRecipes={chatRecipes}
            onCreateChat={agentChatContribution
              ? (recipe) => { if (!chatPreparing) void createChat(recipe, null); }
              : undefined}
            onLaunch={createDetectedTerminal}
            onRefresh={() => void refreshAvailableAgents()}
            terminalEnabled={terminalEnabled}
          />
        ) : workbench.root ? (
          <TerminalWorkbenchViewport
            activeGroupId={workbench.activeGroup?.id ?? null}
            dropIntent={itemMove.dropIntent}
            getLeafMinimum={getGroupMinimum}
            groups={workbench.groups}
            headerItems={headerItems}
            hosts={hosts}
            root={workbench.root}
            itemMove={itemMove}
            onActivateItem={workbench.activateItem}
            onCloseItem={(itemId) => { void requestCloseItem(itemId); }}
            onCreateItem={(groupId) => workbench.createTerminalLauncher(currentRoot, groupId)}
            onMoveByKeyboard={moveItemByKeyboard}
            onResizeSplit={workbench.resizeSplit}
          />
        ) : null}
        {workbench.items.map((item) => createPortal(
          item.kind === TERMINAL_WORKBENCH_ITEM_KIND ? (
            workbench.terminalById.get(item.id) ? (
              <TerminalSessionHost
                discoveryPhase={agentDiscoveryPhase}
                availableAgentIds={visibleAgentIds}
                chatCreationAvailable={canCreateChat}
                chatPreparing={chatPreparing}
                chatRecipes={chatRecipes}
                focused={active && workbench.activeItemId === item.id}
                onFocus={() => {
                  setFocusedItemId(item.id);
                  workbench.activateItem(item.id);
                }}
                onLaunch={(launcherId) => launchDetectedTerminal(item.id, launcherId)}
                onCreateChat={agentChatContribution
                  ? (recipe) => { void createChatFromLauncher(item.id, recipe); }
                  : undefined}
                onRefresh={() => void refreshAvailableAgents()}
                presented={active && presentedItemIdSet.has(item.id)}
                runtime={workbench.runtimeRegistry.get(item.id)}
                session={workbench.terminalById.get(item.id)!}
                terminalEnabled={terminalEnabled}
                workspacePath={item.rootId}
              />
            ) : null
          ) : contributionByKind.get(item.kind) ? (
            <TerminalContributionItemHost
              contribution={contributionByKind.get(item.kind)!}
              item={item}
              sidebarVisible={active}
              presented={active && presentedItemIdSet.has(item.id)}
              commandTarget={active && workbench.activeItemId === item.id}
              domFocused={focusedItemId === item.id}
              peerSnapshots={snapshotById}
              onActivate={workbench.activateItem}
              onFocus={setFocusedItemId}
              onPresentationChange={updateSnapshot}
            />
          ) : null,
          hosts.get(item.id)!,
          item.id,
        ))}
      </div>
      {workbench.pendingCloseTerminal && (
        <TerminalCloseConfirmationDialog
          title={t("terminal.sessionTitle", { number: workbench.pendingCloseTerminal.ordinal })}
          onCancel={workbench.cancelCloseTerminal}
          onConfirm={workbench.confirmCloseTerminal}
        />
      )}
    </section>
  );
}

function maximumMinimum(
  values: readonly WorkbenchSplitMinimumSize[],
): WorkbenchSplitMinimumSize {
  if (values.length === 0) return terminalLeafMinimumSize(null);
  return Object.freeze(values.reduce((maximum, value) => ({
    width: Math.max(maximum.width, value.width),
    height: Math.max(maximum.height, value.height),
  }), { width: 1, height: 1 }));
}
