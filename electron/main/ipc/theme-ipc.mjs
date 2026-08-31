export const THEME_LIST_CHANNEL = "theme:list";
export const THEME_OPEN_DIRECTORY_CHANNEL = "theme:open-directory";
export const THEME_CREATE_CHANNEL = "theme:create";
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
    || typeof themeService.createTheme !== "function"
  ) {
    throw new TypeError("Theme service is required for theme IPC.");
  }
  if (typeof onSyncNativeMenu !== "function") {
    throw new TypeError("onSyncNativeMenu must be a function.");
  }

  ipcMain.handle(THEME_LIST_CHANNEL, () => themeService.listThemes());
  ipcMain.handle(THEME_OPEN_DIRECTORY_CHANNEL, () => themeService.openDirectory());
  ipcMain.handle(THEME_CREATE_CHANNEL, () => themeService.createTheme());
  ipcMain.handle(THEME_SYNC_NATIVE_MENU_CHANNEL, (_event, request) => {
    const state = parseThemeMenuState(request);
    onSyncNativeMenu(state);
    return { synced: true };
  });
}

const LEGACY_DEFAULT_SUB_THEME_ID = "default";
const FALLBACK_SUB_THEME_ID = "default.neutral";
const SUB_THEME_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const BUILTIN_SUB_THEME_ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

function parseThemeMenuState(value) {
  const targets = ["application", "markdown", "csv"];
  const requiredTargets = Array.isArray(value?.requiredTargets)
    ? [...new Set(value.requiredTargets.filter((target) => targets.includes(target)))]
    : [...targets];
  const pack = parseThemeId(value?.pack) ?? FALLBACK_SUB_THEME_ID;
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
    requiredTargets: Object.freeze(requiredTargets),
    themes: Object.freeze(themes),
  });
}

function parseThemeId(value) {
  if (value === LEGACY_DEFAULT_SUB_THEME_ID) return FALLBACK_SUB_THEME_ID;
  if (typeof value !== "string") return null;
  if (SUB_THEME_ID_PATTERN.test(value) || BUILTIN_SUB_THEME_ID_PATTERN.test(value)) return value;
  return null;
}
