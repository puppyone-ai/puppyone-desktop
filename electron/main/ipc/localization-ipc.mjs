export function registerLocalizationIpcHandlers({ ipcMain, localeService }) {
  ipcMain.handle("localization:get-bootstrap", async () => {
    await localeService.initialize();
    return localeService.getSnapshot();
  });
  ipcMain.handle("localization:set-language-preference", async (_event, preference) => (
    localeService.setLanguagePreference(preference)
  ));
}
