export const THEME_LIST_CHANNEL = "theme:list";
export const THEME_OPEN_DIRECTORY_CHANNEL = "theme:open-directory";
export const THEME_SYNC_NATIVE_MENU_CHANNEL = "theme:sync-native-menu";
export const THEME_SELECTION_REQUESTED_CHANNEL = "theme:selection-requested";

export function registerThemeIpcHandlers({ ipcMain, themeService, onSyncNativeMenu = () => undefined }) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Trusted ipcMain is required for theme IPC.");
  }
  if (
    !themeService
    || typeof themeService.listThemes !== "function"
    || typeof themeService.openDirectory !== "function"
  ) {
    throw new TypeError("Theme service is required for theme IPC.");
  }
  if (typeof onSyncNativeMenu !== "function") {
    throw new TypeError("onSyncNativeMenu must be a function.");
  }

  ipcMain.handle(THEME_LIST_CHANNEL, () => themeService.listThemes());
  ipcMain.handle(THEME_OPEN_DIRECTORY_CHANNEL, () => themeService.openDirectory());
  ipcMain.handle(THEME_SYNC_NATIVE_MENU_CHANNEL, (_event, request) => {
    const state = parseThemeMenuState(request);
    onSyncNativeMenu(state);
    return { synced: true };
  });
}

function parseThemeMenuState(value) {
  const targets = ["application", "markdown", "csv"];
  const pack = parseThemeId(value?.pack) ?? "default";
  const themes = [];
  const knownIds = new Set();
  for (const theme of Array.isArray(value?.themes) ? value.themes.slice(0, 500) : []) {
    const id = parseThemeId(theme?.id);
    const name = typeof theme?.name === "string" ? theme.name.trim().slice(0, 100) : "";
    const themeTargets = Array.isArray(theme?.targets)
      ? [...new Set(theme.targets.filter((target) => targets.includes(target)))]
      : [];
    if (!id || !name || themeTargets.length === 0 || knownIds.has(id)) continue;
    knownIds.add(id);
    themes.push(Object.freeze({ id, name, targets: Object.freeze(themeTargets) }));
  }
  return Object.freeze({
    pack,
    themes: Object.freeze(themes),
  });
}

function parseThemeId(value) {
  if (value === "default") return value;
  return typeof value === "string"
    && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(value)
    ? value
    : null;
}
