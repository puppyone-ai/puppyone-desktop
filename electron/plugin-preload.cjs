const { contextBridge, ipcRenderer } = require("electron");

/**
 * Fixed PuppyOne-owned plugin preload.
 * Exposes ONLY window.puppyoneViewer — never puppyoneDesktop / ipcRenderer.
 */

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const api = {
  document: {
    getMeta: () => invoke("viewer-pack:document-get-meta", {}),
  },
  resource: {
    open: () => invoke("viewer-pack:resource-open", {}),
    readRange: (request) => invoke("viewer-pack:resource-read-range", request),
    createRangeUrl: (handle) => invoke("viewer-pack:resource-create-range-url", { handle }),
    close: (handle) => invoke("viewer-pack:resource-close", { handle }),
  },
  ui: {
    setState: (state) => {
      ipcRenderer.send("viewer-pack:ui-set-state", state);
    },
    getTheme: () => invoke("viewer-pack:ui-get-theme", {}),
    onThemeChange: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, theme) => callback(theme);
      ipcRenderer.on("viewer-pack:theme-changed", listener);
      return () => ipcRenderer.removeListener("viewer-pack:theme-changed", listener);
    },
  },
  host: {
    openExternal: () => invoke("viewer-pack:host-open-external", {}),
  },
};

contextBridge.exposeInMainWorld("puppyoneViewer", api);
