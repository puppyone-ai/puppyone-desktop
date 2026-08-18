export const MARKDOWN_FORMAT_ACTIVE_CHANNEL = "editor:markdown-format-active";
export const MARKDOWN_FORMAT_SHORTCUT_CHANNEL = "editor:markdown-format-shortcut";

export const MARKDOWN_FORMAT_COMMANDS = Object.freeze(["strong", "emphasis", "underline", "strike"]);

const controllers = new Map();

export function isMarkdownFormatCommand(value) {
  return MARKDOWN_FORMAT_COMMANDS.includes(value);
}

/**
 * Window-level Markdown format keys. Chromium/macOS otherwise steal Cmd+I / Cmd+U
 * before the editor keymap can toggle italic and underline.
 */
export function matchMarkdownFormatInput(input, platform = process.platform) {
  if (!input || input.type !== "keyDown" || input.isAutoRepeat || input.alt) return null;

  const isMac = platform === "darwin";
  const hasMod = isMac ? Boolean(input.meta) && !input.control : Boolean(input.control) && !input.meta;
  if (!hasMod) return null;

  const key = typeof input.key === "string" ? input.key.toLowerCase() : "";
  if (input.shift) return key === "x" ? "strike" : null;
  if (key === "b") return "strong";
  if (key === "i") return "emphasis";
  if (key === "u") return "underline";
  if (key === "d") return "strike";
  return null;
}

export function attachMarkdownFormatShortcuts(
  webContents,
  { platform = process.platform } = {},
) {
  if (!webContents || typeof webContents.on !== "function" || typeof webContents.send !== "function") {
    throw new TypeError("A WebContents instance is required for Markdown format shortcuts.");
  }

  const existing = controllers.get(webContents.id);
  if (existing) return existing;

  let active = false;
  const onBeforeInput = (event, input) => {
    if (!active) return;
    const type = matchMarkdownFormatInput(input, platform);
    if (!type) return;
    event.preventDefault();
    if (webContents.isDestroyed?.()) return;
    webContents.send(MARKDOWN_FORMAT_SHORTCUT_CHANNEL, { type });
  };
  const dispose = () => {
    active = false;
    webContents.removeListener?.("before-input-event", onBeforeInput);
    controllers.delete(webContents.id);
  };

  webContents.on("before-input-event", onBeforeInput);
  webContents.once?.("destroyed", dispose);

  const controller = {
    setActive(nextActive) {
      active = nextActive === true;
    },
    dispose,
  };
  controllers.set(webContents.id, controller);
  return controller;
}

export function setMarkdownFormatShortcutsActive(webContentsId, active) {
  controllers.get(webContentsId)?.setActive(active === true);
}

export function registerMarkdownFormatIpcHandlers({ ipcMain }) {
  if (!ipcMain || typeof ipcMain.on !== "function") {
    throw new TypeError("Trusted ipcMain is required for Markdown format shortcuts.");
  }

  ipcMain.on(MARKDOWN_FORMAT_ACTIVE_CHANNEL, (event, request) => {
    const webContentsId = event?.sender?.id;
    if (!Number.isSafeInteger(webContentsId) || webContentsId <= 0) return;
    setMarkdownFormatShortcutsActive(webContentsId, request?.active === true);
  });
}
