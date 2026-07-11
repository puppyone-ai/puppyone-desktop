import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Terminal architecture boundaries", () => {
  it("keeps RightTerminalPanel as composition with surface-owned session actions", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const header = source("src/features/desktop-terminal/ui/TerminalSurfaceHeader.tsx");
    const app = source("src/App.tsx");
    const titlebar = source("src/features/app-shell/headerElements.tsx");

    expect(panel).toContain("TerminalSurfaceHeader");
    expect(panel).toContain("sessionGeneration");
    expect(panel).toContain("handleResetTerminal");
    expect(panel).not.toMatch(/type RightTerminalPanelProps = \{[^}]*onReset/);
    expect(header).toContain("Clear Terminal");
    expect(header).toContain("Reset Terminal");
    expect(app).not.toContain("terminalSessionResetToken");
    expect(app).not.toContain("onClearTerminal");
    expect(app).not.toContain("onResetTerminal");
    expect(titlebar).not.toContain("Clear Terminal");
    expect(titlebar).not.toContain("Reset Terminal");
    expect(titlebar).not.toContain("has-menu");
    expect(titlebar).toContain('aria-pressed={terminal.sidebarOpen}');
  });

  it("keeps terminal presentation styles co-located with the feature", () => {
    const css = source("src/features/desktop-terminal/ui/desktop-terminal.css");
    const globalLayout = source("src/styles/layout.css");
    expect(css).toContain(".desktop-terminal-surface-header");
    expect(css).toContain("text-spacing-trim: space-all");
    expect(globalLayout).not.toContain(".desktop-terminal-");
  });

  it("keeps titlebar Terminal control as a stable visibility toggle", () => {
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    expect(titlebarActions).not.toContain("terminalMenuOpen");
    expect(titlebarActions).not.toContain("onClearTerminal");
    expect(titlebarActions).not.toContain("onResetTerminal");
    expect(titlebarActions).toContain("onToggleTerminal");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
