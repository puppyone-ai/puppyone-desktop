import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Terminal architecture boundaries", () => {
  it("keeps terminal processes user-owned and the content free of overlapping chrome", () => {
    const panel = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const closeDialog = source(
      "src/features/desktop-terminal/ui/TerminalCloseConfirmationDialog.tsx",
    );
    const launcher = source("src/features/desktop-terminal/ui/TerminalLauncher.tsx");
    const launchers = source("src/features/desktop-terminal/model/terminalLaunchers.ts");
    const sessionView = source("src/features/desktop-terminal/ui/TerminalSessionView.tsx");
    const sessionHost = source("src/features/desktop-terminal/ui/TerminalSessionHost.tsx");
    const controller = source("src/features/desktop-terminal/controller/useTerminalSessions.ts");
    const agentLocatorController = source(
      "src/features/desktop-terminal/controller/useTerminalAgentLocator.ts",
    );
    const nativeAgentLocator = source(
      "electron/main/terminal-agent/terminal-agent-locator.mjs",
    );
    const nativeCandidateResolver = source(
      "electron/main/terminal-agent/terminal-agent-candidate-resolver.mjs",
    );
    const nativeIdentityVerifier = source(
      "electron/main/terminal-agent/terminal-agent-identity.mjs",
    );
    const runtime = source("src/features/desktop-terminal/runtime/terminalRuntime.ts");
    const registry = source("src/features/desktop-terminal/runtime/terminalRuntimeRegistry.ts");
    const titlebarActions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebar = source("src/features/app-shell/headerElements.tsx");

    expect(panel).not.toContain("TerminalSurfaceActions");
    expect(panel).not.toContain("TerminalSurfaceHeader");
    expect(panel).toContain("useTerminalSessions");
    expect(panel).toContain("<TerminalSessionHost");
    expect(panel).toContain("<TerminalSessionHeader");
    expect(sessionHost).toContain("<TerminalSessionView");
    expect(panel).not.toContain("new Terminal(");
    expect(panel).not.toContain("window.puppyoneDesktop");
    expect(panel).toContain("useTerminalAgentLocator");
    expect(panel).not.toContain("useInstalledTerminalAgents");
    expect(agentLocatorController).toContain("locateTerminalAgents");
    expect(agentLocatorController).not.toContain("discoverLocalTerminalAgents");
    expect(nativeAgentLocator).toContain("createTerminalAgentCandidateResolver");
    expect(nativeAgentLocator).toContain("publishProgress");
    expect(nativeAgentLocator).toContain("getDiagnostics");
    expect(nativeAgentLocator).not.toMatch(/runCommand|spawn\(|--version|account\/read|model\/list/);
    expect(nativeAgentLocator).not.toContain("local-agent-inventory");
    expect(nativeAgentLocator).not.toContain("agent/connections");
    expect(nativeCandidateResolver).toContain("createExecutableSearchContext");
    expect(nativeCandidateResolver).toContain("verifyTerminalAgentCandidateIdentity");
    expect(nativeCandidateResolver).not.toMatch(/runCommand|spawn\(|--version|account\/read|model\/list/);
    expect(nativeIdentityVerifier).toContain("MAX_EXECUTABLE_PREFIX_BYTES");
    expect(nativeIdentityVerifier).not.toMatch(/runCommand|spawn\(|--version|account\/read|model\/list/);
    expect(controller).toContain("desktopTerminalSessionsReducer");
    expect(controller).toContain('dispatch({ type: "create"');
    expect(controller).toContain('dispatch({ type: "create-launcher"');
    expect(controller).toContain('dispatch({ type: "launch"');
    expect(controller).toContain('dispatch({ type: "activate"');
    expect(controller).toContain('dispatch({ type: "close"');
    expect(controller).toContain("runtimeRegistry.ensure(sessionId, launcherId)");
    expect(controller).toContain("runtimeRegistry.close(sessionId)");
    expect(controller).toContain("pendingCloseSessionId");
    expect(panel).toContain("close: requestCloseSession");
    expect(panel).toContain("onClose={requestCloseSession}");
    expect(panel).toContain("<TerminalCloseConfirmationDialog");
    expect(closeDialog).toContain("<DesktopOverlayLayer>");
    expect(closeDialog).toContain("<DesktopDialogRoot");
    expect(panel).toContain("<TerminalLauncher");
    expect(panel).toContain("create: createLauncher");
    expect(panel).toContain("onCreate={createLauncher}");
    expect(panel).not.toContain('createSession("shell")');
    expect(panel).toContain('session.status === "selecting"');
    expect(panel).toContain('sessions.length > 0');
    expect(panel).not.toContain("initiallyActive");
    expect(controller).not.toContain("initiallyActive");
    expect(controller).not.toContain("getDesktopTerminalLauncher(launcherId)");
    expect(launcher).toContain("DESKTOP_TERMINAL_LAUNCHERS");
    expect(launcher).not.toContain("window.puppyoneDesktop");
    expect(launchers).not.toContain("command:");
    expect(controller).not.toContain('dispatch({ type: "restart-active" });');
    expect(panel).toContain("sessions.map");
    expect(sessionView).toContain("runtime.mount(container)");
    expect(sessionView).toContain("runtime.unmount(container)");
    expect(sessionView).toContain("runtime.setActive(active)");
    expect(sessionView).not.toContain("runtime.dispose()");
    expect(sessionView).not.toContain("window.puppyoneDesktop?.closeTerminal");
    expect(runtime).toContain("void window.puppyoneDesktop?.closeTerminal?.(this.sessionId)");
    expect(runtime).toContain("sameTerminalSize(this.lastPtySize, size)");
    expect(runtime).toContain("launcherId: this.launcherId");
    expect(runtime).not.toContain("initialCommand");
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
    expect(app).not.toContain("currentTerminalSnapshot.sessions.length === 0");
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
    const sessionView = source("src/features/desktop-terminal/ui/TerminalSessionView.tsx");
    const launcher = source("src/features/desktop-terminal/ui/TerminalLauncher.tsx");
    const launcherCss = source("src/features/desktop-terminal/ui/terminal-launcher.css");
    const launcherIconCss = source(
      "src/features/desktop-terminal/ui/terminal-launcher-icon.css",
    );
    const activityGridCss = source(
      "src/features/desktop-terminal/ui/terminal-activity-grid.css",
    );
    const header = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionHeader.tsx",
    );
    const headerTab = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionTab.tsx",
    );
    const headerStatus = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionHeaderStatus.tsx",
    );
    const headerLayout = source(
      "src/features/desktop-terminal/model/terminalSessionHeaderLayout.ts",
    );
    const headerPresentation = source(
      "src/features/desktop-terminal/model/terminalSessionHeader.ts",
    );
    const headerOverflow = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionOverflowMenu.tsx",
    );
    const headerController = source(
      "src/features/desktop-terminal/ui/session-header/useTerminalSessionHeaderController.ts",
    );
    const headerLayoutHook = source(
      "src/features/desktop-terminal/ui/session-header/useTerminalSessionHeaderLayout.ts",
    );
    const headerCss = source(
      "src/features/desktop-terminal/ui/session-header/terminal-session-header.css",
    );
    const xpTokensCss = source("src/styles/interfaces/windows-xp/tokens.css");
    const terminalActivity = source(
      "src/features/desktop-terminal/runtime/terminalActivity.ts",
    );
    const runtime = source("src/features/desktop-terminal/runtime/terminalRuntime.ts");
    const globalLayout = source("src/styles/layout.css");
    expect(css).not.toContain(".desktop-terminal-surface-actions");
    expect(css).not.toContain(".desktop-terminal-action-trigger");
    expect(css).not.toContain(".desktop-terminal-surface-header");
    expect(css).toContain(".desktop-terminal-session.is-active");
    expect(css).toContain(".desktop-terminal-body.is-empty");
    expect(css).not.toContain(".desktop-terminal-launcher");
    expect(launcher).toContain('import "./terminal-launcher.css"');
    expect(launcherCss).toContain(".desktop-terminal-launcher");
    expect(launcherCss).toContain("container-type: size");
    expect(launcherCss).toMatch(
      /\.desktop-terminal-launcher\s*\{[^}]*place-items:\s*start center;[^}]*padding:\s*clamp\(56px, 20vh, 220px\) 0 32px;/s,
    );
    expect(launcherCss).toMatch(
      /\.desktop-terminal-launcher-availability\.is-assistive\s*\{[^}]*position:\s*absolute;[^}]*width:\s*1px;[^}]*height:\s*1px;/s,
    );
    expect(launcherCss).toContain("@container (min-width: 460px)");
    expect(launcherCss).toContain("var(--po-terminal-bg)");
    expect(launcherCss).toContain("var(--po-focus-ring)");
    expect(launcherIconCss).toMatch(
      /\.desktop-terminal-launcher-icon\.is-compact\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s,
    );
    expect(launcherIconCss).toContain(".desktop-terminal-launcher-icon.is-compact.is-hermes");
    expect(launcher).toContain("desktop-terminal-launcher-heading");
    expect(launcher).toContain("desktop-terminal-launcher-scan");
    expect(launcher).toContain("desktop-terminal-launcher-group is-agents");
    expect(launcher).toContain("desktop-terminal-launcher-group is-shell");
    expect(launcher).toContain('t("terminal.launcher.shell.title")');
    expect(launcher).toContain('aria-label={t("terminal.launcher.scanAgain")}');
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-group\s*\{[^}]*padding:\s*18px;[^}]*border:\s*1px solid var\(--po-border\);[^}]*border-radius:\s*0;/s);
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-content\s*\{[^}]*gap:\s*28px;/s);
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-heading\s*\{[^}]*inset-inline-start:\s*22px;[^}]*justify-content:\s*flex-start;/s);
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-heading h2\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*500;[^}]*text-align:\s*start;/s);
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-tool\s*\{[^}]*border-radius:\s*6px;/s);
    expect(launcherCss).toMatch(/\.desktop-terminal-launcher-shell\s*\{[^}]*border-radius:\s*6px;/s);
    expect(launcherCss).not.toContain("aspect-ratio:");
    expect(header).toContain('import "./terminal-session-header.css"');
    expect(header).toContain("<TerminalSessionTab");
    expect(header).toContain("<TerminalSessionOverflowMenu");
    expect(header).toContain("useTerminalSessionHeaderController");
    expect(header).toContain("useTerminalSessionHeaderLayout");
    expect(header).toContain("data-activation-motion");
    expect(headerTab).toContain("<TerminalSessionHeaderStatus");
    expect(headerPresentation).toContain("terminalPathLabel(workspacePath)");
    expect(headerPresentation).toContain("presentTerminalSessionHeader");
    expect(headerStatus).toContain("runtime.subscribeActivity(setActive)");
    expect(headerStatus).toContain("<TerminalActivityGrid");
    expect(headerStatus).toContain("<TerminalLauncherIcon");
    expect(headerLayout).toContain('mode: "full"');
    expect(headerLayout).toContain('"compact"');
    expect(headerLayout).toContain('"overflow"');
    expect(headerOverflow).toContain("<DesktopMenuSurface");
    expect(headerOverflow).toContain("<TerminalSessionHeaderStatus");
    expect(headerController).toContain("TERMINAL_SESSION_HEADER_METRICS.activationMotionMs");
    expect(headerLayout).toContain("activationMotionMs: 220");
    expect(headerLayout).toContain("canPreserveVisibleWindow");
    expect(headerLayoutHook).toContain("preferredVisibleSessionIds: visibleWindow");
    expect(headerLayoutHook).toContain("capacityRef");
    expect(headerLayoutHook).not.toContain("railRef");
    expect(headerLayoutHook).toContain("TERMINAL_SESSION_HEADER_METRICS.createControl");
    expect(header).not.toContain("Working");
    expect(header).not.toContain("brailleSpinnerFrames");
    expect(terminalActivity).toContain("TerminalActivityController");
    expect(terminalActivity).toContain("cursorBusyLabels");
    expect(terminalActivity).toContain("noteOutput");
    expect(terminalActivity).toContain("beginPresentationRefresh");
    expect(runtime).toContain("this.activityController.beginPresentationRefresh()");
    expect(activityGridCss).toContain("grid-template-columns: repeat(2");
    expect(activityGridCss).not.toContain("border-radius");
    expect(headerCss).not.toContain("desktop-terminal-tab-activity-dot");
    expect(panel).not.toContain("<SquareTerminal");
    expect(headerCss).toContain("border-radius: var(--desktop-toolbar-action-radius);");
    expect(headerCss).not.toContain("background: var(--po-selected);");
    expect(headerCss).toContain(
      "background: var(--desktop-terminal-tab-active-background, var(--po-control));",
    );
    expect(headerCss).not.toContain("--desktop-terminal-tab-active-indicator");
    expect(headerCss).not.toContain(".desktop-terminal-tab::after");
    expect(headerCss).not.toContain(".desktop-terminal-tab-shell");
    expect(headerLayout).toContain("tabBounds");
    expect(headerLayout).toContain("inlineStart");
    expect(headerCss).toMatch(/\.desktop-terminal-tab-rail\s*\{[^}]*flex:\s*0 1 auto;/s);
    expect(headerCss).toMatch(
      /\.desktop-terminal-tabs\s*\{[^}]*position:\s*relative;[^}]*width:\s*var\(--desktop-terminal-tabs-resolved-width\);/s,
    );
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab\s*\{[^}]*position:\s*absolute;[^}]*inset-inline-start:\s*var\(--desktop-terminal-tab-inline-start\);/s,
    );
    expect(headerCss).toMatch(/\.desktop-terminal-tab\s*\{(?![^}]*transition:)[^}]*\}/s);
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab-rail\[data-activation-motion="true"\] \.desktop-terminal-tab\s*\{[^}]*inset-inline-start var\(--desktop-terminal-tab-activation-motion\)[^}]*width var\(--desktop-terminal-tab-activation-motion\)/s,
    );
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab-select\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--desktop-terminal-tab-control-height\) minmax\(0, 1fr\);/s,
    );
    expect(headerCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".desktop-terminal-session:not(.is-ready) .desktop-terminal-xterm");
    expect(headerCss).toContain("--desktop-terminal-tab-control-height: 28px;");
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab-status\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;[^}]*flex:\s*0 0 14px;/s,
    );
    expect(headerCss).toMatch(/\.desktop-terminal-subheader\s*\{[^}]*height:\s*38px;/s);
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab-select\s*\{[^}]*font-size:\s*var\(--desktop-sidebar-font-size, var\(--po-text-size-sidebar, 13px\)\);/s,
    );
    expect(headerCss).toMatch(
      /\.desktop-terminal-tab-title\s*\{[^}]*font-weight:\s*var\(--desktop-sidebar-font-weight, var\(--po-text-weight-medium, 500\)\);/s,
    );
    expect(headerCss).not.toMatch(/\.desktop-terminal-tab-select\s*\{[^}]*font-size:\s*11px;/s);
    expect(headerCss).toMatch(
      /\.desktop-terminal-subheader\s*\{[^}]*border-block-end:\s*1px solid var\(--desktop-terminal-tab-bar-border, var\(--po-divider\)\);[^}]*background:\s*var\(--desktop-terminal-tab-bar-background, var\(--po-panel\)\);/s,
    );
    expect(headerCss).not.toContain(".desktop-terminal-subheader::after");
    expect(xpTokensCss).toContain("--desktop-terminal-tab-bar-background: #f5f4ee;");
    expect(xpTokensCss).toContain("--desktop-terminal-tab-active-background: #ddd9cf;");
    expect(xpTokensCss).not.toContain("--desktop-terminal-tab-active-indicator");
    expect(xpTokensCss).not.toContain("--desktop-terminal-tab-active-background: #1059c9;");
    expect(xpTokensCss).not.toContain("--desktop-terminal-tab-active-background: #316ac5;");
    expect(css).not.toContain(".desktop-terminal-subheader");
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
    expect(runtime).toContain("terminal.onScroll(() => {");
    expect(runtime).toContain("this.markScrollbarActive();");
    expect(runtime).toContain("this.syncScrollbarPresentation();");
    expect(runtime).toContain('container.classList.add("po-scrollbar-active")');
    expect(runtime).toContain("this.terminal?.scrollLines(direction)");
    expect(runtime).toContain("terminal.scrollToLine(nextViewportY)");
    expect(sessionView).toContain("desktop-terminal-classic-scrollbar-controls");
    expect(sessionView).toContain("desktop-terminal-classic-scrollbar-button");
    expect(sessionView).not.toContain("po-classic-scrollbar-button");
    expect(sessionView).toContain("runtime.subscribeScrollbar(setScrollbarState)");
    expect(css).toContain(".desktop-terminal-classic-scrollbar-track");
    expect(css).toContain(".desktop-terminal-classic-scrollbar-thumb");
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
    const header = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionHeader.tsx",
    );
    const tab = source(
      "src/features/desktop-terminal/ui/session-header/TerminalSessionTab.tsx",
    );
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
    expect(header).toContain('role="tablist"');
    expect(tab).toContain('role="tab"');
    expect(tab).toContain("onActivate(session.id)");
    expect(tab).toContain("onClose(session.id)");
    expect(header).toContain("onCreate");
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
