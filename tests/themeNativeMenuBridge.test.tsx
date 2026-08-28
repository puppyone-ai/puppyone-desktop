import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("native theme menu bridge", () => {
  it("syncs safe menu metadata and handles selection and reload requests", () => {
    const preload = source("electron/preload.cjs");
    const ipc = source("electron/main/ipc/theme-ipc.mjs");
    const catalog = source("src/features/themes/useThemeCatalog.ts");

    expect(preload).toContain('ipcRenderer.invoke("theme:sync-native-menu"');
    expect(preload).toContain('ipcRenderer.on("theme:selection-requested"');
    expect(preload).toContain('ipcRenderer.on("theme:reload-requested"');
    expect(ipc).toContain('THEME_SYNC_NATIVE_MENU_CHANNEL = "theme:sync-native-menu"');
    expect(catalog).toContain("onSelectionRequested");
    expect(catalog).toContain("onReloadRequested");
    expect(catalog).toContain("syncNativeMenu");
  });
});
