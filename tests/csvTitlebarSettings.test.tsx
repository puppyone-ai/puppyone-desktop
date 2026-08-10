/**
 * @vitest-environment happy-dom
 */
import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CsvTableEditor,
  EditorChromeContributionProvider,
  type EditorChromeContribution,
} from "@puppyone/shared-ui";
import { DesktopTitlebarActions } from "../src/features/app-shell/DesktopTitlebarActions";
import { DEFAULT_TITLEBAR_ACTIONS_SETTINGS } from "../src/preferences";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("CSV titlebar settings", () => {
  it("contributes the product menu before Open external and keeps view changes live", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(<Harness />)));

    expect(container.querySelector(".csv-table-editor__settings-button")).toBeNull();
    const actions = Array.from(container.querySelectorAll<HTMLButtonElement>(".desktop-titlebar-action"));
    expect(actions[0]?.classList.contains("desktop-titlebar-csv-settings")).toBe(true);
    expect(actions[1]?.classList.contains("desktop-titlebar-external-open")).toBe(true);

    const trigger = actions[0];
    act(() => trigger?.click());
    const menu = container.querySelector(".desktop-titlebar-csv-settings-menu");
    expect(menu?.classList.contains("desktop-menu-surface")).toBe(true);
    expect(menu?.getAttribute("role")).toBe("menu");

    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    expect(items[1]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(items[0]);

    act(() => items[0]?.click());
    expect(container.querySelector(".csv-table-editor__table thead")).toBeNull();
    expect(container.querySelector(".desktop-titlebar-csv-settings-menu")).not.toBeNull();
    expect(container.querySelector('[role="menuitemcheckbox"]')?.getAttribute("aria-checked"))
      .toBe("false");

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector(".desktop-titlebar-csv-settings-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

function Harness() {
  const [contribution, setContribution] = useState<EditorChromeContribution | null>(null);

  return (
    <>
      <div className="desktop-titlebar-actions">
        <DesktopTitlebarActions
          canOpenActiveFileExternal
          csvViewSettings={contribution?.kind === "csv-view-settings" ? contribution : null}
          titlebarActionsSettings={DEFAULT_TITLEBAR_ACTIONS_SETTINGS}
          terminalSidebarOpen={false}
          terminalToolEnabled={false}
          terminalSessionLayout="menu"
          terminalSessions={[]}
          activeTerminalSessionId={null}
          agentChatEnabled={false}
          agentChatSidebarOpen={false}
          onOpenActiveFileExternal={vi.fn()}
          onCreateTerminal={vi.fn()}
          onActivateTerminal={vi.fn()}
          onCloseTerminal={vi.fn()}
          onToggleAgentChat={vi.fn()}
          onToggleTerminal={vi.fn()}
        />
      </div>
      <EditorChromeContributionProvider onContributionChange={setContribution}>
        <CsvTableEditor
          documentId="/workspace/data.csv"
          content={"Name,Score\nAda,1\nLin,2"}
          nodeName="data.csv"
        />
      </EditorChromeContributionProvider>
    </>
  );
}
