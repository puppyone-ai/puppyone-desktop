export type AgentChatTabPresentation = {
  title: string;
  runtimeLabel: string | null;
  runtimeIconKey: string | null;
  sessionId: string | null;
  statusCode: string;
  running: boolean;
};

export type AgentChatTab = AgentChatTabPresentation & {
  id: string;
  ordinal: number;
};

export type AgentChatTabsState = {
  tabs: AgentChatTab[];
  activeTabId: string;
  nextOrdinal: number;
};

export type AgentChatTabsAction =
  | { type: "create"; tabId: string; title: string }
  | { type: "activate"; tabId: string }
  | { type: "close"; tabId: string; replacementTabId: string; replacementTitle: string }
  | { type: "present"; tabId: string; presentation: AgentChatTabPresentation };

export const MAX_AGENT_CHAT_TABS = 8;

export function createAgentChatTabsState(tabId: string, title: string): AgentChatTabsState {
  return {
    tabs: [createTab(tabId, 1, title)],
    activeTabId: tabId,
    nextOrdinal: 2,
  };
}

export function agentChatTabsReducer(
  state: AgentChatTabsState,
  action: AgentChatTabsAction,
): AgentChatTabsState {
  if (action.type === "create") {
    if (state.tabs.length >= MAX_AGENT_CHAT_TABS) return state;
    if (state.tabs.some((tab) => tab.id === action.tabId)) return state;
    return {
      tabs: [...state.tabs, createTab(action.tabId, state.nextOrdinal, action.title)],
      activeTabId: action.tabId,
      nextOrdinal: state.nextOrdinal + 1,
    };
  }

  if (action.type === "activate") {
    if (state.activeTabId === action.tabId) return state;
    if (!state.tabs.some((tab) => tab.id === action.tabId)) return state;
    return { ...state, activeTabId: action.tabId };
  }

  if (action.type === "present") {
    let changed = false;
    const tabs = state.tabs.map((tab) => {
      if (tab.id !== action.tabId || presentationEqual(tab, action.presentation)) return tab;
      changed = true;
      return { ...tab, ...action.presentation };
    });
    return changed ? { ...state, tabs } : state;
  }

  if (action.type === "close") {
    const closingIndex = state.tabs.findIndex((tab) => tab.id === action.tabId);
    if (closingIndex < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
    if (tabs.length === 0) {
      return {
        tabs: [createTab(action.replacementTabId, state.nextOrdinal, action.replacementTitle)],
        activeTabId: action.replacementTabId,
        nextOrdinal: state.nextOrdinal + 1,
      };
    }
    if (state.activeTabId !== action.tabId) return { ...state, tabs };
    const replacementIndex = Math.min(closingIndex, tabs.length - 1);
    return { ...state, tabs, activeTabId: tabs[replacementIndex].id };
  }

  return state;
}

function createTab(id: string, ordinal: number, title: string): AgentChatTab {
  return {
    id,
    ordinal,
    title,
    runtimeLabel: null,
    runtimeIconKey: null,
    sessionId: null,
    statusCode: "checking",
    running: false,
  };
}

function presentationEqual(left: AgentChatTab, right: AgentChatTabPresentation) {
  return left.title === right.title
    && left.runtimeLabel === right.runtimeLabel
    && left.runtimeIconKey === right.runtimeIconKey
    && left.sessionId === right.sessionId
    && left.statusCode === right.statusCode
    && left.running === right.running;
}
