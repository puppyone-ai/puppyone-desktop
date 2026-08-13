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
const desktopShellSource = readFileSync(
  new URL("../src/components/DesktopCloudShell.tsx", import.meta.url),
  "utf8",
);

describe("editor tabs header architecture", () => {
  it("projects Editor Group state through the app-shell editor slot", () => {
    const slotStart = appSource.indexOf("const titlebarSidebarSlot");
    const actionsStart = appSource.indexOf("const titlebarActions", slotStart);
    const slotSource = appSource.slice(slotStart, actionsStart);

    expect(slotSource).toContain("<DesktopTitlebarContext");
    expect(slotSource).toContain("<DesktopEditorTabs");
    expect(slotSource).toContain("editors={editorGroup.state.editors}");
    expect(slotSource).toContain('connectedToEditor={!minimalMode && activeView === "data"}');
    expect(slotSource).toContain('navigateDesktopView("data")');
  });

  it("shares the resolved Explorer width with the full-height Header boundary", () => {
    expect(desktopShellSource).toContain(
      '"--desktop-titlebar-sidebar-width": `${paneLayout.explorer.width}px`',
    );
    expect(desktopShellSource).toContain('data-titlebar-sidebar-state={sidebarState}');
    expect(desktopShellSource).toContain('className="desktop-titlebar-sidebar-context"');
    expect(desktopShellSource).toContain('className="desktop-titlebar-editor-context"');
    expect(tabsStyles).toContain('inset-block: 0;');
    expect(tabsStyles).toContain(
      'inset-inline-start: var(--desktop-titlebar-sidebar-width);',
    );
  });

  it("keeps tab presentation out of the shared editor canvas", () => {
    expect(dataWorkspaceSource).not.toContain("EditorTabs");
    expect(dataWorkspaceSource).not.toContain("openEditors");
  });

  it("connects the active tab to the canvas without an outer focus ring", () => {
    expect(tabsSource).toContain('data-window-no-drag="true"');
    expect(tabsSource).toContain('data-po-scrollbar="hidden"');
    expect(tabsSource).toContain('data-connected-to-editor=');
    expect(tabsStyles).toContain("var(--desktop-titlebar-control-height)");
    expect(tabsStyles).toContain("var(--desktop-titlebar-hover)");
    expect(tabsStyles).toContain("var(--desktop-titlebar-active)");
    expect(tabsStyles).toContain("background: var(--po-canvas);");
    expect(tabsStyles).toContain("border-block-end-color: transparent;");
    expect(tabsStyles).toContain("inset-block-end: -2px;");
    expect(tabsStyles).not.toContain("var(--desktop-titlebar-focus)");
    expect(tabsStyles).not.toContain("box-shadow:");
  });
});
