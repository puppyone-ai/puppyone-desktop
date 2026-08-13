import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const tabsSource = readFileSync(
  new URL("../src/features/editor-workbench/DesktopEditorTabs.tsx", import.meta.url),
  "utf8",
);
const tabsStyles = readFileSync(
  new URL("../src/features/editor-workbench/desktop-editor-tabs.css", import.meta.url),
  "utf8",
);
const dataWorkspaceSource = readFileSync(
  new URL("../packages/shared-ui/src/data/DataWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("editor tabs header architecture", () => {
  it("projects Editor Group state through the app-shell titlebar slot", () => {
    const slotStart = appSource.indexOf("const titlebarSlot");
    const actionsStart = appSource.indexOf("const titlebarActions", slotStart);
    const slotSource = appSource.slice(slotStart, actionsStart);

    expect(slotSource).toContain("<DesktopTitlebarContext");
    expect(slotSource).toContain("<DesktopEditorTabs");
    expect(slotSource).toContain("editors={editorGroup.state.editors}");
    expect(slotSource).toContain('navigateDesktopView("data")');
  });

  it("keeps tab presentation out of the shared editor canvas", () => {
    expect(dataWorkspaceSource).not.toContain("EditorTabs");
    expect(dataWorkspaceSource).not.toContain("openEditors");
  });

  it("uses the titlebar interaction and color tokens", () => {
    expect(tabsSource).toContain('data-window-no-drag="true"');
    expect(tabsSource).toContain('data-po-scrollbar="hidden"');
    expect(tabsStyles).toContain("var(--desktop-titlebar-control-height)");
    expect(tabsStyles).toContain("var(--desktop-titlebar-hover)");
    expect(tabsStyles).toContain("var(--desktop-titlebar-active)");
    expect(tabsStyles).toContain("var(--desktop-titlebar-focus)");
    expect(tabsStyles).toContain("var(--desktop-toolbar-action-radius)");
    expect(tabsStyles).not.toContain("var(--po-canvas)");
  });
});
