import { useCallback, useMemo } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AuxiliaryWorkbenchItemRenderContext,
  AuxiliaryWorkbenchItemSnapshot,
} from "../../app-shell/auxiliary-workbench/types";
import {
  closeAgentSessionController,
  discardAgentSessionController,
  getAgentSessionController,
} from "../application/controllerRegistry";
import type { AgentChatTabPresentation } from "../domain/agent-chat-tabs";
import type { AgentRoutePreference } from "../domain/agent-route-preference";
import { getElectronAgentClient } from "../infrastructure/electron/electronAgentClient";
import { AgentChatTabPanel } from "../ui/AgentChatTabPanel";
import "../ui/desktop-agent.css";

export type AgentChatWorkbenchItemProps = AuxiliaryWorkbenchItemRenderContext & Readonly<{
  enabledRuntimeIds: readonly string[] | null;
  onOpenFile?: (path: string) => void;
  onPreferredModelChange?: (model: string) => void;
  onPreferredRouteChange?: (route: AgentRoutePreference) => void;
  onPreferredRuntimeChange?: (runtimeId: string | null) => void;
  onViewChanges?: () => void;
  preferredModel: string | null;
  preferredRoute: Readonly<AgentRoutePreference>;
  preferredRuntimeId: string | null;
}>;

export function AgentChatWorkbenchItem({
  enabledRuntimeIds,
  item,
  onOpenFile,
  onPreferredModelChange,
  onPreferredRouteChange,
  onPreferredRuntimeChange,
  onPresentationChange,
  onViewChanges,
  peerSnapshots,
  preferredModel,
  preferredRoute,
  preferredRuntimeId,
  presentation,
}: AgentChatWorkbenchItemProps) {
  const { t } = useLocalization();
  const controller = useMemo(
    () => getAgentSessionController(item.rootId, getElectronAgentClient, item.id),
    [item.id, item.rootId],
  );
  const present = useCallback((agent: AgentChatTabPresentation) => {
    onPresentationChange(presentAgentChatWorkbenchItem(agent, t("agent.name")));
  }, [onPresentationChange, t]);
  const openSessionIds = useMemo(() => Array.from(peerSnapshots.entries()).flatMap(
    ([itemId, snapshot]) => itemId !== item.id && snapshot.resourceId
      ? [snapshot.resourceId]
      : [],
  ), [item.id, peerSnapshots]);

  return <AgentChatTabPanel
    commandTarget={presentation.commandTarget}
    presented={presentation.presented}
    controller={controller}
    workspaceId={item.contextId}
    onPresentationChange={present}
    onViewChanges={onViewChanges}
    onOpenFile={onOpenFile}
    preferredRuntimeId={preferredRuntimeId}
    onPreferredRuntimeChange={onPreferredRuntimeChange}
    preferredRoute={preferredRoute}
    onPreferredRouteChange={onPreferredRouteChange}
    preferredModel={preferredModel}
    onPreferredModelChange={onPreferredModelChange}
    enabledRuntimeIds={enabledRuntimeIds}
    openSessionIds={openSessionIds}
  />;
}

export async function requestCloseAgentChatWorkbenchItem(rootId: string, itemId: string) {
  return closeAgentSessionController(rootId, itemId);
}

export async function prepareAgentChatWorkbenchItem(
  rootId: string,
  itemId: string,
  runtimeId: string | null,
) {
  if (!runtimeId) return;
  const controller = getAgentSessionController(rootId, getElectronAgentClient, itemId);
  await controller.initializeForRuntime(runtimeId);
}

export function discardPreparedAgentChatWorkbenchItem(rootId: string, itemId: string) {
  discardAgentSessionController(rootId, itemId);
}

export function presentAgentChatWorkbenchItem(
  presentation: AgentChatTabPresentation,
  agentLabel: string,
): AuxiliaryWorkbenchItemSnapshot {
  const status = presentation.running
    ? "running"
    : presentation.statusCode === "checking"
      ? "starting"
      : presentation.statusCode === "needs-repair"
        ? "error"
        : "idle";
  const detail = presentation.runtimeLabel
    ? `${presentation.runtimeLabel} — ${presentation.statusCode}`
    : presentation.statusCode;
  return Object.freeze({
    title: presentation.title,
    accessibleLabel: [presentation.title, presentation.runtimeLabel ?? agentLabel, presentation.statusCode]
      .filter(Boolean)
      .join(" — "),
    detail,
    status,
    running: presentation.running,
    resourceId: presentation.sessionId,
  });
}
