import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preload = readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const declarations = readFileSync(new URL("../src/types/electron.d.ts", import.meta.url), "utf8");

describe("CSS theme host bridge architecture", () => {
  it("exposes only pathless list, reload, and open-directory commands", () => {
    expect(preload).toMatch(/themes:\s*\{[\s\S]*list:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("theme:list"\)/);
    expect(preload).toMatch(/reload:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("theme:reload"\)/);
    expect(preload).toMatch(/openDirectory:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("theme:open-directory"\)/);
    expect(preload).not.toMatch(/themes:[\s\S]{0,400}(?:path|filePath|directoryPath)\s*=>/);
  });

  it("registers one host-owned service through trusted IPC", () => {
    expect(main).toContain('import { createThemeService } from "./main/themes/theme-service.mjs";');
    expect(main).toContain('import { registerThemeIpcHandlers } from "./main/ipc/theme-ipc.mjs";');
    expect(main).toMatch(/createThemeService\(\{[\s\S]*userDataPath:\s*app\.getPath\("userData"\)[\s\S]*shell/);
    expect(main).toMatch(/registerThemeIpcHandlers\(\{[\s\S]*ipcMain:\s*trustedIpcMain,[\s\S]*themeService/);
  });

  it("declares immutable renderer theme snapshots", () => {
    expect(declarations).toContain("type DesktopThemeTarget =");
    expect(declarations).toContain("type DesktopThemeSnapshot = Readonly<");
    expect(declarations).toMatch(/themes:\s*\{[\s\S]*list:\s*\(\)\s*=>\s*Promise<DesktopThemeSnapshot>/);
  });
});
