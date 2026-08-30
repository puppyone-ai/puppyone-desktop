import { describe, expect, it } from "vitest";
import {
  agentChatTabsReducer,
  createAgentChatTabsState,
  MAX_AGENT_CHAT_TABS,
} from "../src/features/desktop-agent/domain/agent-chat-tabs";

describe("Agent Chat tabs", () => {
  it("creates and activates independent chat tabs", () => {
    let state = createAgentChatTabsState("chat-a", "New chat");
    state = agentChatTabsReducer(state, { type: "create", tabId: "chat-b", title: "New chat" });
    state = agentChatTabsReducer(state, {
      type: "present",
      tabId: "chat-a",
      presentation: {
        title: "Fix auth",
        runtimeLabel: "Codex",
        runtimeIconKey: "codex",
        sessionId: "session-a",
        statusCode: "ready",
        running: false,
      },
    });

    expect(state.tabs.map(({ id, ordinal, title }) => ({ id, ordinal, title }))).toEqual([
      { id: "chat-a", ordinal: 1, title: "Fix auth" },
      { id: "chat-b", ordinal: 2, title: "New chat" },
    ]);
    expect(state.activeTabId).toBe("chat-b");
    expect(state.tabs[0].runtimeIconKey).toBe("codex");

    state = agentChatTabsReducer(state, { type: "activate", tabId: "chat-a" });
    expect(state.activeTabId).toBe("chat-a");
  });

  it("selects the nearest tab on close and always keeps a launch tab", () => {
    let state = createAgentChatTabsState("chat-a", "New chat");
    state = agentChatTabsReducer(state, { type: "create", tabId: "chat-b", title: "New chat" });
    state = agentChatTabsReducer(state, { type: "create", tabId: "chat-c", title: "New chat" });
    state = agentChatTabsReducer(state, {
      type: "close",
      tabId: "chat-c",
      replacementTabId: "unused",
      replacementTitle: "New chat",
    });

    expect(state.tabs.map((tab) => tab.id)).toEqual(["chat-a", "chat-b"]);
    expect(state.activeTabId).toBe("chat-b");

    state = agentChatTabsReducer(state, {
      type: "close",
      tabId: "chat-b",
      replacementTabId: "unused",
      replacementTitle: "New chat",
    });
    state = agentChatTabsReducer(state, {
      type: "close",
      tabId: "chat-a",
      replacementTabId: "chat-d",
      replacementTitle: "New chat",
    });

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ id: "chat-d", ordinal: 4, title: "New chat" });
    expect(state.activeTabId).toBe("chat-d");
  });

  it("bounds live tab controllers", () => {
    let state = createAgentChatTabsState("chat-1", "New chat");
    for (let index = 2; index <= MAX_AGENT_CHAT_TABS + 1; index += 1) {
      state = agentChatTabsReducer(state, {
        type: "create",
        tabId: `chat-${index}`,
        title: "New chat",
      });
    }
    expect(state.tabs).toHaveLength(MAX_AGENT_CHAT_TABS);
    expect(state.tabs.at(-1)?.id).toBe(`chat-${MAX_AGENT_CHAT_TABS}`);
  });
});
