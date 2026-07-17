import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Terminal architecture boundaries", () => {
  it("keeps the terminal content free of overlapping chrome", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebar = source("src/features/app-shell/headerElements.tsx");

    expect(panel).not.toContain("TerminalSurfaceActions");
    expect(panel).not.toContain("TerminalSurfaceHeader");
    expect(panel).toContain("sessionGeneration");
    expect(panel).toContain("handleResetTerminal");
    expect(panel).toContain("useImperativeHandle");
    expect(panel).toContain('import { WebLinksAddon } from "@xterm/addon-web-links"');
    expect(panel).toContain("linkHandler:");
    expect(panel).toContain("allowNonHttpProtocols: false");
    expect(panel).toContain("terminal.loadAddon(new WebLinksAddon");
    expect(panel).toContain("bridge.openExternalUrl(href)");
    expect(titlebarActions).toContain('aria-haspopup="menu"');
    expect(titlebarActions).toContain('t("terminal.actions")');
    expect(titlebarActions).toContain('t("terminal.clear")');
    expect(titlebarActions).toContain('t("terminal.reset")');
    expect(app).not.toContain("terminalSessionResetToken");
    expect(app).toContain("terminalPanelRef");
    expect(titlebar).not.toContain("Clear Terminal");
    expect(titlebar).not.toContain("Reset Terminal");
    expect(titlebar).not.toContain("has-menu");
    expect(titlebar).toContain('aria-pressed={terminal.sidebarOpen}');
  });

  it("keeps terminal presentation styles co-located with the feature", () => {
    const css = source("src/features/desktop-terminal/ui/desktop-terminal.css");
    const globalLayout = source("src/styles/layout.css");
    expect(css).not.toContain(".desktop-terminal-surface-actions");
    expect(css).not.toContain(".desktop-terminal-action-trigger");
    expect(css).not.toContain(".desktop-terminal-surface-header");
    expect(css).toContain("text-spacing-trim: space-all");
    expect(globalLayout).not.toContain(".desktop-terminal-");
  });

  it("keeps Terminal and overflow as separate titlebar controls", () => {
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const titlebarCss = source("src/styles/titlebar.css");
    expect(titlebarActions).toContain("TerminalTitlebarActionsMenu");
    expect(titlebarActions).toContain("onClearTerminal");
    expect(titlebarActions).toContain("onResetTerminal");
    expect(titlebarActions).toContain("onToggleTerminal");
    expect(titlebarActions).toContain('id: "terminal-menu"');
    expect(titlebarActions).not.toContain("desktop-titlebar-terminal-cluster");
    expect(titlebarActions).toContain(
      'className="desktop-titlebar-menu desktop-titlebar-terminal-menu"',
    );
    expect(titlebarCss).not.toContain(".desktop-titlebar-terminal-cluster");
    expect(titlebarCss).toContain(".desktop-titlebar-terminal-menu");
    expect(titlebarCss).toContain("width: var(--desktop-titlebar-control-height);");
    expect(titlebarCss).toContain("height: var(--desktop-titlebar-control-height);");
    expect(titlebarCss).toContain("background: var(--desktop-titlebar-hover);");
    expect(titlebarCss.indexOf(".desktop-titlebar-terminal-menu {")).toBeGreaterThan(
      titlebarCss.indexOf(".desktop-titlebar-menu {"),
    );
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-terminal-menu\s*\{[^}]*inset-inline-start:\s*auto;[^}]*inset-inline-end:\s*0;[^}]*\}/s,
    );
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-terminal-menu\s*\{[^}]*width:\s*min\(200px, calc\(100vw - 32px\)\);[^}]*\}/s,
    );
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
