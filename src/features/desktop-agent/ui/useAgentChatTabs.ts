import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  readAgentChatTabsState,
  writeAgentChatTabsState,
} from "../application/agent-chat-tab-state-registry";
import {
  agentChatTabsReducer,
  createAgentChatTabsState,
  MAX_AGENT_CHAT_TABS,
  type AgentChatTabPresentation,
} from "../domain/agent-chat-tabs";

type UseAgentChatTabsOptions = {
  workspaceRoot: string;
  newChatTitle: string;
  closeController: (tabId: string) => Promise<boolean>;
};

export function useAgentChatTabs({ workspaceRoot, newChatTitle, closeController }: UseAgentChatTabsOptions) {
  const [state, dispatch] = useReducer(
    agentChatTabsReducer,
    null,
    () => readAgentChatTabsState(
      workspaceRoot,
      () => createAgentChatTabsState(createAgentChatTabId(), newChatTitle),
    ),
  );

  useEffect(() => {
    writeAgentChatTabsState(workspaceRoot, state);
  }, [state, workspaceRoot]);

  const createTab = useCallback(() => {
    dispatch({ type: "create", tabId: createAgentChatTabId(), title: newChatTitle });
  }, [newChatTitle]);

  const activateTab = useCallback((tabId: string) => {
    dispatch({ type: "activate", tabId });
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    const closed = await closeController(tabId);
    if (!closed) return false;
    dispatch({
      type: "close",
      tabId,
      replacementTabId: createAgentChatTabId(),
      replacementTitle: newChatTitle,
    });
    return true;
  }, [closeController, newChatTitle]);

  const presentTab = useCallback((tabId: string, presentation: AgentChatTabPresentation) => {
    dispatch({ type: "present", tabId, presentation });
  }, []);

  const running = useMemo(() => state.tabs.some((tab) => tab.running), [state.tabs]);

  return {
    ...state,
    activateTab,
    closeTab,
    createTab,
    presentTab,
    running,
    canCreate: state.tabs.length < MAX_AGENT_CHAT_TABS,
  };
}

function createAgentChatTabId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `agent_chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
