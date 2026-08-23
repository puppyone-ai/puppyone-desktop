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
  onCheckForUpdates,
  logger = console,
}) {
  if (!app) throw new TypeError("An Electron app is required.");
  if (!Menu || typeof Menu.buildFromTemplate !== "function") {
    throw new TypeError("The Electron Menu authority is required.");
  }
  if (typeof t !== "function") throw new TypeError("A native menu translator is required.");
  if (typeof onNewWindow !== "function") throw new TypeError("onNewWindow must be a function.");
  if (typeof onCheckForUpdates !== "function") {
    throw new TypeError("onCheckForUpdates must be a function.");
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
      { role: "close" },
    ],
  });

  const createAppMenu = () => ({
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        id: "app.checkForUpdates",
        label: t("native.menu.checkForUpdates"),
        click: action("app.checkForUpdates", onCheckForUpdates),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  });

  const createApplicationMenuTemplate = () => [
    createAppMenu(),
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
