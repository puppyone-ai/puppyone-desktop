/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useTerminalWorkbench } from "../src/features/desktop-terminal/workbench/useTerminalWorkbench";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let latest: ReturnType<typeof useTerminalWorkbench> | null = null;

afterEach(() => {
  latest = null;
  document.body.replaceChildren();
});

describe("Terminal Workbench controller", () => {
  it("creates, activates, splits and closes mixed Item kinds through one topology", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    act(() => reactRoot.render(<Harness />));
    const workspace = { id: "workspace-a", path: "/workspace/a" };

    let terminalId = "";
    let chatId = "";
    act(() => {
      terminalId = current().createTerminalLauncher(workspace);
      chatId = current().createAgentChat(workspace);
    });

    expect(current().items.map(({ id, kind, rootId }) => ({ id, kind, rootId }))).toEqual([
      { id: terminalId, kind: "terminal", rootId: "/workspace/a" },
      { id: chatId, kind: "agent-chat", rootId: "/workspace/a" },
    ]);
    expect(current().groups).toHaveLength(1);
    expect(current().groups[0].itemIds).toEqual([terminalId, chatId]);
    expect(current().activeItemId).toBe(chatId);

    const sourceGroupId = current().groups[0].id;
    act(() => current().splitItem(chatId, sourceGroupId, "right"));
    expect(current().groups).toHaveLength(2);
    expect(current().presentedItemIds).toEqual([terminalId, chatId]);
    expect(current().activeItemId).toBe(chatId);

    act(() => current().removeItem(chatId));
    expect(current().items.map(({ id }) => id)).toEqual([terminalId]);
    expect(current().groups).toHaveLength(1);
    expect(current().activeItemId).toBe(terminalId);

    act(() => reactRoot.unmount());
  });

  it("deduplicates an unlaunched Terminal selector within one Group", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    act(() => reactRoot.render(<Harness />));
    const workspace = { id: "workspace-a", path: "/workspace/a" };

    let first = "";
    let second = "";
    act(() => {
      first = current().createTerminalLauncher(workspace);
      second = current().createTerminalLauncher(workspace);
    });

    expect(second).toBe(first);
    expect(current().items).toHaveLength(1);
    expect(current().terminalById.get(first)?.status).toBe("selecting");
    act(() => reactRoot.unmount());
  });
});

function Harness() {
  latest = useTerminalWorkbench({ messageFormatter: (key) => key });
  return null;
}

function current() {
  if (!latest) throw new Error("Workbench controller is not mounted.");
  return latest;
}
