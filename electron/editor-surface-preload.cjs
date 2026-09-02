const { contextBridge, ipcRenderer } = require("electron");
let activeSessionId = null;

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("puppyoneEditorSurface", {
  getBootstrap: async () => {
    const payload = await ipcRenderer.invoke("editor-surface:bootstrap");
    activeSessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;
    return payload;
  },
  onAppearance: (callback) => subscribe("editor-surface:appearance", callback),
  reportReady: (request = {}) => ipcRenderer.send("editor-surface:ready", {
    ...request,
    sessionId: activeSessionId,
  }),
  reportError: (request = {}) => ipcRenderer.send("editor-surface:error", {
    ...request,
    sessionId: activeSessionId,
  }),
});

// The isolated surface needs localization but receives none of the Desktop
// workspace, filesystem, terminal, Agent, Cloud, or shell bridges.
contextBridge.exposeInMainWorld("puppyoneDesktop", {
  getLocalizationBootstrap: () => ipcRenderer.invoke("editor-surface:localization-bootstrap"),
  setLanguagePreference: () => ipcRenderer.invoke("editor-surface:localization-bootstrap"),
  onLocaleChanged: (callback) => subscribe("editor-surface:locale-changed", callback),
});
