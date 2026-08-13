import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Terminal architecture boundaries", () => {
  it("keeps terminal processes user-owned and the content free of overlapping chrome", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const sessionView = source("src/features/desktop-terminal/ui/TerminalSessionView.tsx");
    const controller = source("src/features/desktop-terminal/controller/useTerminalSessions.ts");
    const runtime = source("src/features/desktop-terminal/runtime/terminalRuntime.ts");
    const registry = source("src/features/desktop-terminal/runtime/terminalRuntimeRegistry.ts");
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebar = source("src/features/app-shell/headerElements.tsx");

    expect(panel).not.toContain("TerminalSurfaceActions");
    expect(panel).not.toContain("TerminalSurfaceHeader");
    expect(panel).toContain("useTerminalSessions");
    expect(panel).toContain("<TerminalSessionView");
    expect(panel).not.toContain("new Terminal(");
    expect(panel).not.toContain("window.puppyoneDesktop");
    expect(controller).toContain("desktopTerminalSessionsReducer");
    expect(controller).toContain('dispatch({ type: "create"');
    expect(controller).toContain('dispatch({ type: "activate"');
    expect(controller).toContain('dispatch({ type: "close"');
    expect(controller).toContain("runtimeRegistry.ensure(sessionId)");
    expect(controller).toContain("runtimeRegistry.close(sessionId)");
    expect(controller).toContain("pendingCloseSessionId");
    expect(panel).toContain("close: requestCloseSession");
    expect(panel).toContain("onClose={requestCloseSession}");
    expect(panel).toContain("<TerminalCloseConfirmationDialog");
    expect(controller).not.toContain('dispatch({ type: "restart-active" });');
    expect(panel).toContain("sessions.map");
    expect(sessionView).toContain("runtime.mount(container)");
    expect(sessionView).toContain("runtime.setActive(active)");
    expect(sessionView).not.toContain("runtime.dispose()");
    expect(sessionView).not.toContain("window.puppyoneDesktop?.closeTerminal");
    expect(runtime).toContain("void window.puppyoneDesktop?.closeTerminal?.(this.sessionId)");
    expect(runtime).toContain("sameTerminalSize(this.lastPtySize, size)");
    expect(runtime).not.toContain("[80, 180, 260]");
    expect(registry).toContain("runtime.dispose()");
    expect(registry).toContain("this.disposeTimer = setTimeout");
    expect(panel).not.toContain("handleClearTerminal");
    expect(panel).toContain("useImperativeHandle");
    expect(runtime).toContain('import { WebLinksAddon } from "@xterm/addon-web-links"');
    expect(runtime).toContain("linkHandler:");
    expect(runtime).toContain("allowNonHttpProtocols: false");
    expect(runtime).toContain("terminal.loadAddon(new WebLinksAddon");
    expect(runtime).toContain("bridge.openExternalUrl(href)");
    expect(titlebarActions).toContain('aria-haspopup="menu"');
    expect(titlebarActions).toContain('t("terminal.actions")');
    expect(titlebarActions).toContain('t("terminal.closeSession"');
    expect(titlebarActions).toContain('t("terminal.new")');
    expect(titlebarActions).not.toContain('t("terminal.openSessions")');
    expect(titlebarActions).not.toContain('t("terminal.restart")');
    expect(titlebarActions).not.toContain('t("terminal.clear")');
    expect(titlebarActions).not.toContain('t("terminal.reset")');
    expect(app).not.toContain("terminalSessionResetToken");
    expect(app).toContain("terminalPanelRef");
    expect(app).toContain("terminalPanelRef.current?.create()");
    expect(app).toContain("terminalPanelRef.current?.activate(sessionId)");
    expect(app).toContain("terminalPanelRef.current?.close(sessionId)");
    expect(app).not.toContain("terminalPanelRef.current?.restartActive()");
    expect(app).toContain("onSessionsChange={setTerminalSnapshot}");
    expect(titlebar).not.toContain("Clear Terminal");
    expect(titlebar).not.toContain("Reset Terminal");
    expect(titlebar).not.toContain("has-menu");
    expect(titlebar).toContain('aria-pressed={terminal.sidebarOpen}');
  });

  it("keeps terminal presentation styles co-located with the feature", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const css = source("src/features/desktop-terminal/ui/desktop-terminal.css");
    const runtime = source("src/features/desktop-terminal/runtime/terminalRuntime.ts");
    const globalLayout = source("src/styles/layout.css");
    expect(css).not.toContain(".desktop-terminal-surface-actions");
    expect(css).not.toContain(".desktop-terminal-action-trigger");
    expect(css).not.toContain(".desktop-terminal-surface-header");
    expect(css).toContain(".desktop-terminal-session.is-active");
    expect(css).toContain(".desktop-terminal-empty-state");
    expect(css).toContain(".desktop-terminal-body.is-empty");
    expect(css).toMatch(/\.desktop-terminal-empty-state\s*\{[^}]*color:\s*var\(--po-text-subtle\);/s);
    expect(css).not.toContain(".desktop-terminal-empty-state button");
    expect(panel).not.toContain("<SquareTerminal");
    expect(css).toContain("border-radius: var(--desktop-toolbar-action-radius);");
    expect(css).toContain("background: var(--po-selected);");
    expect(css).not.toContain(".desktop-terminal-tab::after");
    expect(css).not.toContain(".desktop-terminal-tab-shell");
    expect(css).toMatch(/\.desktop-terminal-tabs\s*\{[^}]*flex:\s*0 1 auto;/s);
    expect(css).toMatch(
      /\.desktop-terminal-tab\s*\{[^}]*flex:\s*0 0 var\(--desktop-terminal-tab-width\);/s,
    );
    expect(css).not.toMatch(/\.desktop-terminal-tab\s*\{[^}]*transition:/s);
    expect(css).toContain(".desktop-terminal-session:not(.is-ready) .desktop-terminal-xterm");
    expect(css).toContain("--desktop-terminal-tab-control-height: 28px;");
    expect(css).toMatch(/\.desktop-terminal-subheader\s*\{[^}]*height:\s*38px;/s);
    expect(css).toMatch(
      /\.desktop-terminal-tab-select\s*\{[^}]*font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\);/s,
    );
    expect(css).toMatch(
      /\.desktop-terminal-tab-title\s*\{[^}]*font-weight:\s*var\(--desktop-sidebar-font-weight, var\(--po-text-weight-medium, 500\)\);/s,
    );
    expect(css).not.toMatch(/\.desktop-terminal-tab-select\s*\{[^}]*font-size:\s*11px;/s);
    expect(css).toMatch(
      /\.desktop-terminal-subheader\s*\{[^}]*background:\s*var\(--po-terminal-bg\);/s,
    );
    expect(css).not.toMatch(/\.desktop-terminal-subheader\s*\{[^}]*box-shadow:/s);
    expect(css).not.toContain(".desktop-terminal-subheader::after");
    expect(css).not.toMatch(/\.desktop-terminal-subheader\s*\{[^}]*border-bottom:/s);
    expect(css).toContain("text-spacing-trim: space-all");
    expect(css).toContain(
      "--desktop-terminal-scrollbar-track-size: var(--po-scrollbar-size, 12px);",
    );
    expect(css).toContain(
      "--desktop-terminal-scrollbar-thumb-active-size: var(--po-scrollbar-thumb-active-size, 8px);",
    );
    expect(css).toContain(
      "--desktop-terminal-scrollbar-thumb-inset: var(--po-scrollbar-thumb-inset, 3px);",
    );
    expect(css).toContain("--po-scrollbar-thumb-active-inset,");
    expect(css).toContain(':root[data-interface-style="default"] .desktop-terminal-xterm');
    expect(css).toContain(
      "--desktop-terminal-scrollbar-thumb-color: var(",
    );
    expect(css).toContain("--po-scrollbar-presentation-thumb,");
    expect(css).toContain(".desktop-terminal-xterm.po-scrollbar-active");
    expect(css).not.toContain(".desktop-terminal-xterm:focus-within");
    expect(runtime).toContain("terminal.onScroll(() => this.markScrollbarActive())");
    expect(runtime).toContain('container.classList.add("po-scrollbar-active")');
    expect(css).toMatch(
      /\.xterm-scrollable-element > \.scrollbar\.vertical\s*\{[^}]*width:\s*var\(--desktop-terminal-scrollbar-track-size\) !important;/s,
    );
    expect(css).toMatch(
      /\.xterm-scrollable-element > \.scrollbar > \.slider\s*\{[^}]*width:\s*var\(--desktop-terminal-scrollbar-track-size\) !important;/s,
    );
    expect(css).toContain(
      ".desktop-terminal-xterm .xterm .xterm-scrollable-element > .scrollbar > .slider::after",
    );
    expect(css).toMatch(
      /\.slider::after\s*\{[^}]*inset-inline-end:\s*var\(--desktop-terminal-scrollbar-thumb-inset\);[^}]*width:\s*var\(--desktop-terminal-scrollbar-thumb-size\);[^}]*pointer-events:\s*none;/s,
    );
    expect(css).toContain(
      "inset-inline-end: var(--desktop-terminal-scrollbar-thumb-active-inset);",
    );
    expect(css).toContain(
      "border-inline-width: var(--desktop-terminal-scrollbar-thumb-inset);",
    );
    expect(css).not.toContain("border-left-width:");
    expect(globalLayout).not.toContain(".desktop-terminal-");
  });

  it("keeps Terminal visibility separate from its explicit session manager", () => {
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const tabs = source("src/features/desktop-terminal/ui/TerminalSessionTabs.tsx");
    const settings = source("src/features/settings/SettingsView.tsx");
    const titlebarCss = source("src/styles/titlebar.css");
    expect(titlebarActions).toContain("TerminalTitlebarMenu");
    expect(titlebarActions).not.toContain("DesktopMenuSection");
    expect(titlebarActions).toContain("sessions.length > 0 && <DesktopMenuSeparator />");
    expect(titlebarActions).toContain("onCreateTerminal");
    expect(titlebarActions).toContain("onActivateTerminal");
    expect(titlebarActions).toContain("onCloseTerminal");
    expect(titlebarActions).not.toContain("onRestartTerminal");
    expect(titlebarActions).not.toContain("onClearTerminal");
    expect(titlebarActions).not.toContain("onResetTerminal");
    expect(titlebarActions).toContain("onToggleTerminal");
    expect(titlebarActions).toContain('id: "terminal-menu"');
    expect(titlebarActions).not.toContain('id: "terminal-close"');
    expect(titlebarActions).not.toContain("TerminalTitlebarCloseButton");
    expect(titlebarActions).not.toContain("desktop-titlebar-terminal-cluster");
    expect(titlebarActions).toContain("desktop-titlebar-terminal-session-row");
    expect(titlebarActions).toContain("DesktopMenuIconButton");
    expect(titlebarActions).toContain('role="menuitemradio"');
    expect(titlebarActions).toContain('terminalSessionLayout === "menu"');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain("onActivate(session.id)");
    expect(tabs).toContain("onClose(session.id)");
    expect(tabs).toContain("onCreate");
    expect(settings).toContain("desktop-terminal-layout-segment");
    expect(settings).toContain('(["menu", "tabs"] as const)');
    expect(settings).not.toContain("settings.appearance.terminalTabs");
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
      /\.desktop-titlebar-terminal-menu\s*\{[^}]*width:\s*min\(248px, calc\(100vw - 32px\)\);[^}]*\}/s,
    );
    expect(titlebarCss).toContain(".desktop-titlebar-terminal-session-list");
    expect(titlebarCss).toContain(".desktop-titlebar-terminal-session-close");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
