import { describe, expect, it, vi } from "vitest";
import { createDesktopNativeMenuService } from "../electron/main/native-menu-service.mjs";

function createHarness({ platform = "darwin" } = {}) {
  const Menu = {
    buildFromTemplate: vi.fn((template) => ({ template })),
    setApplicationMenu: vi.fn(),
  };
  const app = { name: "puppyone", dock: { setMenu: vi.fn() } };
  const actions = {
    checkForUpdates: vi.fn(),
    newWindow: vi.fn(),
    openThemesDirectory: vi.fn(),
    reloadThemes: vi.fn(),
    selectTheme: vi.fn(),
  };
  const labels = {
    "native.menu.file": "File",
    "native.menu.checkForUpdates": "Check for Updates…",
    "native.menu.theme": "Theme",
    "native.menu.theme.pack": "Theme Pack",
    "native.menu.theme.customize": "Customize",
    "native.menu.theme.followPack": "Follow Theme Pack",
    "native.menu.theme.application": "Application",
    "native.menu.theme.markdown": "Markdown",
    "native.menu.theme.csv": "Table",
    "native.menu.theme.openFolder": "Open Themes Folder",
    "native.menu.theme.reload": "Reload Themes",
    "native.dock.newWindow": "New Window",
  };
  const service = createDesktopNativeMenuService({
    app,
    Menu,
    platform,
    t: (messageId) => labels[messageId] ?? messageId,
    onCheckForUpdates: actions.checkForUpdates,
    onNewWindow: actions.newWindow,
    onOpenThemesDirectory: actions.openThemesDirectory,
    onReloadThemes: actions.reloadThemes,
    onSelectTheme: actions.selectTheme,
  });
  return { actions, app, Menu, service };
}

describe("DesktopNativeMenuService", () => {
  it("installs a native macOS File menu and shares New Window with the Dock", async () => {
    const { actions, app, Menu, service } = createHarness();

    expect(service.refresh()).toEqual({ supported: true });
    expect(Menu.setApplicationMenu).toHaveBeenCalledOnce();
    expect(app.dock.setMenu).toHaveBeenCalledOnce();

    const applicationTemplate = Menu.buildFromTemplate.mock.calls[0][0];
    expect(applicationTemplate.map((item) => item.role ?? item.label)).toEqual([
      "puppyone",
      "File",
      "editMenu",
      "viewMenu",
      "Theme",
      "windowMenu",
      "help",
    ]);

    const appItems = applicationTemplate[0].submenu;
    const checkForUpdates = appItems.find((item) => item.id === "app.checkForUpdates");
    expect(appItems.map((item) => item.role ?? item.id ?? item.type)).toEqual([
      "about",
      "separator",
      "app.checkForUpdates",
      "separator",
      "services",
      "separator",
      "hide",
      "hideOthers",
      "unhide",
      "separator",
      "quit",
    ]);
    expect(checkForUpdates).toMatchObject({ label: "Check for Updates…" });

    const fileItems = applicationTemplate[1].submenu;
    const newWindow = fileItems.find((item) => item.id === "file.newWindow");
    expect(fileItems).toHaveLength(3);
    expect(newWindow).toMatchObject({ label: "New Window", accelerator: "CmdOrCtrl+N" });
    expect(fileItems[1]).toEqual({ type: "separator" });
    expect(fileItems.at(-1)).toEqual({ role: "close" });

    newWindow.click();
    checkForUpdates.click();
    Menu.buildFromTemplate.mock.calls[1][0][0].click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.newWindow).toHaveBeenCalledTimes(2);
    expect(actions.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("builds a primary theme-pack group and advanced surface overrides", async () => {
    const { actions, service } = createHarness();
    service.setThemeState({
      pack: "builtin.pack.forest",
      overrides: {
        application: null,
        markdown: "builtin.markdown.newsprint",
        csv: "builtin.csv.ledger",
      },
      selection: {
        application: "builtin.pack.forest",
        markdown: "builtin.markdown.newsprint",
        csv: "builtin.csv.ledger",
      },
      themes: [
        { id: "default", name: "Default", targets: ["application", "markdown", "csv"] },
        { id: "builtin.pack.forest", name: "Forest", targets: ["application", "markdown", "csv"] },
        { id: "builtin.markdown.newsprint", name: "Newsprint", targets: ["markdown"] },
        { id: "builtin.csv.ledger", name: "Ledger", targets: ["csv"] },
      ],
    });

    const themeMenu = service.createApplicationMenuTemplate()
      .find((item) => item.id === "themes");
    expect(themeMenu.label).toBe("Theme");
    expect(themeMenu.submenu.slice(0, 2).map((item) => item.label)).toEqual([
      "Theme Pack",
      "Customize",
    ]);
    expect(themeMenu.submenu[0].submenu.find((item) => item.label === "Forest"))
      .toMatchObject({ type: "radio", checked: true });
    const customize = themeMenu.submenu[1].submenu;
    expect(customize[1].submenu.find((item) => item.label === "Newsprint"))
      .toMatchObject({ type: "radio", checked: true });
    expect(customize[2].submenu.find((item) => item.label === "Ledger"))
      .toMatchObject({ type: "radio", checked: true });
    expect(customize[0].submenu.find((item) => item.label === "Follow Theme Pack"))
      .toMatchObject({ type: "radio", checked: true });

    themeMenu.submenu[0].submenu.find((item) => item.label === "Default").click();
    customize[1].submenu.find((item) => item.label === "Follow Theme Pack").click();
    themeMenu.submenu.at(-2).click();
    themeMenu.submenu.at(-1).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.selectTheme).toHaveBeenCalledWith({ kind: "pack", themeId: "default" });
    expect(actions.selectTheme).toHaveBeenCalledWith({
      kind: "override",
      target: "markdown",
      themeId: null,
    });
    expect(actions.openThemesDirectory).toHaveBeenCalledOnce();
    expect(actions.reloadThemes).toHaveBeenCalledOnce();
  });

  it("does not replace native menus outside macOS", () => {
    const { app, Menu, service } = createHarness({ platform: "linux" });

    expect(service.refresh()).toEqual({ supported: false });
    expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();
    expect(app.dock.setMenu).not.toHaveBeenCalled();
  });
});
