import { describe, expect, it, vi } from "vitest";
import { createDesktopNativeMenuService } from "../electron/main/native-menu-service.mjs";

function createHarness({ platform = "darwin" } = {}) {
  const Menu = {
    buildFromTemplate: vi.fn((template) => ({ template })),
    setApplicationMenu: vi.fn(),
  };
  const app = { dock: { setMenu: vi.fn() } };
  const actions = {
    newWindow: vi.fn(),
    openWorkspace: vi.fn(),
    openWorkspaceInNewWindow: vi.fn(),
  };
  const labels = {
    "native.menu.file": "File",
    "native.dock.newWindow": "New Window",
    "native.menu.openWorkspace": "Open Workspace…",
    "native.menu.openWorkspaceInNewWindow": "Open Workspace in New Window…",
  };
  const service = createDesktopNativeMenuService({
    app,
    Menu,
    platform,
    t: (messageId) => labels[messageId] ?? messageId,
    onNewWindow: actions.newWindow,
    onOpenWorkspace: actions.openWorkspace,
    onOpenWorkspaceInNewWindow: actions.openWorkspaceInNewWindow,
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
      "appMenu",
      "File",
      "editMenu",
      "viewMenu",
      "windowMenu",
      "help",
    ]);

    const fileItems = applicationTemplate[1].submenu;
    const newWindow = fileItems.find((item) => item.id === "file.newWindow");
    const openWorkspace = fileItems.find((item) => item.id === "file.openWorkspace");
    const openWorkspaceInNewWindow = fileItems.find(
      (item) => item.id === "file.openWorkspaceInNewWindow",
    );
    expect(newWindow).toMatchObject({ label: "New Window", accelerator: "CmdOrCtrl+N" });
    expect(openWorkspace).toMatchObject({ label: "Open Workspace…", accelerator: "CmdOrCtrl+O" });
    expect(openWorkspaceInNewWindow).toMatchObject({
      label: "Open Workspace in New Window…",
      accelerator: "CmdOrCtrl+Shift+O",
    });
    expect(fileItems.at(-1)).toEqual({ role: "close" });

    newWindow.click();
    openWorkspace.click();
    openWorkspaceInNewWindow.click();
    Menu.buildFromTemplate.mock.calls[1][0][0].click();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.newWindow).toHaveBeenCalledTimes(2);
    expect(actions.openWorkspace).toHaveBeenCalledOnce();
    expect(actions.openWorkspaceInNewWindow).toHaveBeenCalledOnce();
  });

  it("does not replace native menus outside macOS", () => {
    const { app, Menu, service } = createHarness({ platform: "linux" });

    expect(service.refresh()).toEqual({ supported: false });
    expect(Menu.buildFromTemplate).not.toHaveBeenCalled();
    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();
    expect(app.dock.setMenu).not.toHaveBeenCalled();
  });
});
