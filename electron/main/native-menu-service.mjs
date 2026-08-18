function runMenuAction(actionId, action, logger) {
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      logger.error(`Unable to run native menu action ${actionId}:`, error);
    });
}

export function createDesktopNativeMenuService({
  app,
  Menu,
  platform = process.platform,
  t,
  onNewWindow,
  onOpenWorkspace,
  onOpenWorkspaceInNewWindow,
  logger = console,
}) {
  if (!app) throw new TypeError("An Electron app is required.");
  if (!Menu || typeof Menu.buildFromTemplate !== "function") {
    throw new TypeError("The Electron Menu authority is required.");
  }
  if (typeof t !== "function") throw new TypeError("A native menu translator is required.");
  if (typeof onNewWindow !== "function") throw new TypeError("onNewWindow must be a function.");
  if (typeof onOpenWorkspace !== "function") {
    throw new TypeError("onOpenWorkspace must be a function.");
  }
  if (typeof onOpenWorkspaceInNewWindow !== "function") {
    throw new TypeError("onOpenWorkspaceInNewWindow must be a function.");
  }

  const action = (actionId, handler) => () => runMenuAction(actionId, handler, logger);

  const createFileMenu = () => ({
    label: t("native.menu.file"),
    submenu: [
      {
        id: "file.newWindow",
        label: t("native.dock.newWindow"),
        accelerator: "CmdOrCtrl+N",
        click: action("file.newWindow", onNewWindow),
      },
      { type: "separator" },
      {
        id: "file.openWorkspace",
        label: t("native.menu.openWorkspace"),
        accelerator: "CmdOrCtrl+O",
        click: action("file.openWorkspace", onOpenWorkspace),
      },
      {
        id: "file.openWorkspaceInNewWindow",
        label: t("native.menu.openWorkspaceInNewWindow"),
        accelerator: "CmdOrCtrl+Shift+O",
        click: action("file.openWorkspaceInNewWindow", onOpenWorkspaceInNewWindow),
      },
      { type: "separator" },
      { role: "close" },
    ],
  });

  const createApplicationMenuTemplate = () => [
    { role: "appMenu" },
    createFileMenu(),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    { role: "help" },
  ];

  const createDockMenuTemplate = () => [
    {
      id: "dock.newWindow",
      label: t("native.dock.newWindow"),
      click: action("dock.newWindow", onNewWindow),
    },
  ];

  const refresh = () => {
    if (platform !== "darwin") return { supported: false };

    const applicationMenu = Menu.buildFromTemplate(createApplicationMenuTemplate());
    Menu.setApplicationMenu(applicationMenu);

    if (app.dock && typeof app.dock.setMenu === "function") {
      app.dock.setMenu(Menu.buildFromTemplate(createDockMenuTemplate()));
    }

    return { supported: true };
  };

  return Object.freeze({
    createApplicationMenuTemplate,
    createDockMenuTemplate,
    refresh,
  });
}
