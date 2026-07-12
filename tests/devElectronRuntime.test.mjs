import { describe, expect, it } from "vitest";
import path from "node:path";

import { getNpmExecutable, getNpmSpawnOptions } from "../scripts/node-package-manager.mjs";
import { getDefaultElectronBin, getElectronRuntimeEnv } from "../scripts/electron-runtime.mjs";

describe("Electron development runtime", () => {
  it("uses npm.cmd when spawning the renderer on Windows", () => {
    expect(getNpmExecutable("win32")).toBe("npm.cmd");
  });

  it("uses npm on POSIX platforms", () => {
    expect(getNpmExecutable("linux")).toBe("npm");
    expect(getNpmExecutable("darwin")).toBe("npm");
  });

  it("runs the Windows npm batch shim through cmd", () => {
    expect(getNpmSpawnOptions("win32")).toEqual({ shell: true });
    expect(getNpmSpawnOptions("linux")).toEqual({});
  });

  it("spawns Electron's native binary instead of the Windows npm shim", () => {
    expect(getDefaultElectronBin("C:/desktop", "win32")).toBe(
      path.join("C:/desktop", "node_modules", "electron", "dist", "electron.exe"),
    );
    expect(getDefaultElectronBin("/desktop", "linux")).toBe(
      path.join("/desktop", "node_modules", ".bin", "electron"),
    );
  });

  it("does not inherit the test-only Electron-as-Node switch", () => {
    const parentEnv = { PATH: "test-path", ELECTRON_RUN_AS_NODE: "1" };
    expect(getElectronRuntimeEnv(parentEnv)).toEqual({ PATH: "test-path" });
    expect(parentEnv.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});
