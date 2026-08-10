import { describe, expect, it } from "vitest";
import {
  MIN_MAIN_PANE_WIDTH,
  resolveDesktopPaneLayout,
} from "../src/features/app-shell/layout/desktopPaneLayout";

describe("desktop three-pane layout", () => {
  it("keeps preferred side widths when the main pane has enough room", () => {
    const layout = resolveLayout({ availableWidth: 1440 });

    expect(layout.explorer.width).toBe(320);
    expect(layout.rightSidebar.width).toBe(560);
    expect(layout.main.width).toBe(560);
    expect(layout.main.minWidth).toBe(MIN_MAIN_PANE_WIDTH);
  });

  it("uses the remaining space as the dynamic maximum instead of a fixed cap", () => {
    const layout = resolveLayout({
      availableWidth: 1440,
      explorerWidth: 320,
      rightSidebarWidth: 1200,
    });

    expect(layout.rightSidebar.maxWidth).toBe(720);
    expect(layout.rightSidebar.width).toBe(720);
    expect(layout.explorer.width).toBe(240);
    expect(layout.main.width).toBe(MIN_MAIN_PANE_WIDTH);
  });

  it("bounds either side pane without allowing it to consume the main pane", () => {
    const wideExplorer = resolveLayout({
      availableWidth: 1440,
      explorerWidth: 1200,
      rightSidebarWidth: 560,
    });
    const wideRightSidebar = resolveLayout({
      availableWidth: 1920,
      explorerCollapsed: true,
      rightSidebarWidth: 1600,
    });

    expect(wideExplorer.explorer.width).toBe(400);
    expect(wideExplorer.main.width).toBe(MIN_MAIN_PANE_WIDTH);
    expect(wideRightSidebar.rightSidebar.width).toBe(1440);
    expect(wideRightSidebar.main.width).toBe(MIN_MAIN_PANE_WIDTH);
  });

  it("temporarily collapses the explorer before violating three-pane minima", () => {
    const compact = resolveLayout({ availableWidth: 1100 });

    expect(compact.explorer.autoCollapsed).toBe(true);
    expect(compact.explorer.collapsed).toBe(true);
    expect(compact.explorer.width).toBe(0);
    expect(compact.rightSidebar.width).toBe(560);
    expect(compact.main.width).toBe(540);
  });

  it("restores the preferred explorer width when space becomes available again", () => {
    const compact = resolveLayout({ availableWidth: 1100, explorerWidth: 380 });
    const restored = resolveLayout({ availableWidth: 1600, explorerWidth: 380 });

    expect(compact.explorer.autoCollapsed).toBe(true);
    expect(restored.explorer.autoCollapsed).toBe(false);
    expect(restored.explorer.width).toBe(380);
  });

  it("temporarily closes the auxiliary pane only below its own viable width", () => {
    const tooNarrow = resolveLayout({ availableWidth: 880 });

    expect(tooNarrow.rightSidebar.autoClosed).toBe(true);
    expect(tooNarrow.rightSidebar.open).toBe(false);
    expect(tooNarrow.rightSidebar.width).toBe(0);
    expect(tooNarrow.main.width).toBeGreaterThanOrEqual(MIN_MAIN_PANE_WIDTH);
  });

  it.each([920, 1100, 1200, 1440, 1920])(
    "preserves the main-pane invariant at %ipx",
    (availableWidth) => {
      for (const explorerWidth of [240, 320, 800, 2000]) {
        for (const rightSidebarWidth of [420, 560, 1000, 2400]) {
          const layout = resolveLayout({
            availableWidth,
            explorerWidth,
            rightSidebarWidth,
          });
          expect(layout.main.width).toBeGreaterThanOrEqual(layout.main.minWidth);
          expect(
            layout.explorer.width + layout.main.width + layout.rightSidebar.width,
          ).toBe(availableWidth);
        }
      }
    },
  );
});

function resolveLayout({
  availableWidth,
  explorerCollapsed = false,
  explorerWidth = 320,
  rightSidebarOpen = true,
  rightSidebarWidth = 560,
}: {
  availableWidth: number;
  explorerCollapsed?: boolean;
  explorerWidth?: number;
  rightSidebarOpen?: boolean;
  rightSidebarWidth?: number;
}) {
  return resolveDesktopPaneLayout({
    availableWidth,
    explorer: {
      collapsed: explorerCollapsed,
      preferredWidth: explorerWidth,
      present: true,
    },
    rightSidebar: {
      open: rightSidebarOpen,
      preferredWidth: rightSidebarWidth,
      present: true,
    },
  });
}
