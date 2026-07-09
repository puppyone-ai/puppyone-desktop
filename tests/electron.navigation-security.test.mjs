import { describe, expect, it, vi } from "vitest";
import {
  classifyWindowNavigation,
  installWindowNavigationSecurity,
  isPotentiallyExecutableFile,
  requireSafeExternalUrl,
} from "../electron/main/security.mjs";

describe("desktop window navigation security", () => {
  it("allows only the packaged application document to navigate in place", () => {
    const applicationUrl = "file:///Applications/PuppyOne.app/Contents/Resources/app.asar/dist/index.html";

    expect(classifyWindowNavigation(`${applicationUrl}#workspace`, applicationUrl)).toEqual({
      action: "allow-application",
    });
    expect(classifyWindowNavigation(`${applicationUrl}?spoof=1`, applicationUrl)).toEqual({ action: "deny" });
    expect(classifyWindowNavigation(
      "file:///Applications/PuppyOne.app/Contents/Resources/app.asar/dist/other.html",
      applicationUrl,
    )).toEqual({ action: "deny" });
    expect(classifyWindowNavigation("javascript:alert(1)", applicationUrl)).toEqual({ action: "deny" });
    expect(classifyWindowNavigation("puppyone-local://file/root/secret", applicationUrl)).toEqual({ action: "deny" });
  });

  it("allows same-origin development navigation and externalizes safe web URLs", () => {
    const applicationUrl = "http://127.0.0.1:5173/";

    expect(classifyWindowNavigation("http://127.0.0.1:5173/settings", applicationUrl)).toEqual({
      action: "allow-application",
    });
    expect(classifyWindowNavigation("https://example.com/docs", applicationUrl)).toEqual({
      action: "open-external",
      url: "https://example.com/docs",
    });
    expect(classifyWindowNavigation("mailto:security@example.com", applicationUrl)).toEqual({
      action: "open-external",
      url: "mailto:security@example.com",
    });
  });

  it("prevents unsafe in-place and popup navigation while using the system browser for safe targets", () => {
    const listeners = new Map();
    let windowOpenHandler = null;
    const webContents = {
      on: vi.fn((name, handler) => listeners.set(name, handler)),
      setWindowOpenHandler: vi.fn((handler) => {
        windowOpenHandler = handler;
      }),
    };
    const shell = {
      openExternal: vi.fn(() => Promise.resolve()),
    };
    const logger = { warn: vi.fn() };
    const applicationUrl = "file:///app/dist/index.html";

    installWindowNavigationSecurity({ webContents, applicationUrl, shell, logger });

    const applicationEvent = { preventDefault: vi.fn() };
    listeners.get("will-navigate")(applicationEvent, `${applicationUrl}#files`);
    expect(applicationEvent.preventDefault).not.toHaveBeenCalled();

    const externalEvent = { preventDefault: vi.fn() };
    listeners.get("will-navigate")(externalEvent, "https://example.com/path");
    expect(externalEvent.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/path");

    const unsafeEvent = { preventDefault: vi.fn() };
    listeners.get("will-navigate")(unsafeEvent, "javascript:alert(1)");
    expect(unsafeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenCalledTimes(1);

    const redirectEvent = { preventDefault: vi.fn() };
    listeners.get("will-redirect")(redirectEvent, "https://example.com/redirected");
    expect(redirectEvent.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenLastCalledWith("https://example.com/redirected");

    expect(windowOpenHandler({ url: "mailto:security@example.com" })).toEqual({ action: "deny" });
    expect(shell.openExternal).toHaveBeenLastCalledWith("mailto:security@example.com");
    expect(windowOpenHandler({ url: applicationUrl })).toEqual({ action: "deny" });
    expect(windowOpenHandler({ url: "file:///tmp/untrusted.html" })).toEqual({ action: "deny" });
    expect(shell.openExternal).toHaveBeenCalledTimes(3);
  });

  it("treats platform launchers and executable file modes as dangerous", () => {
    const inertStats = { mode: 0o644 };
    for (const filename of [
      "run.bat",
      "run.cmd",
      "run.com",
      "install.msi",
      "payload.scr",
      "script.ps1",
      "launcher.desktop",
      "tool.AppImage",
      "bundle.jar",
    ]) {
      expect(isPotentiallyExecutableFile(filename, inertStats)).toBe(true);
    }
    expect(isPotentiallyExecutableFile("notes.txt", { mode: 0o755 })).toBe(process.platform !== "win32");
  });

  it("allows only credential-free web URLs and non-empty mail recipients", () => {
    expect(requireSafeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(requireSafeExternalUrl("mailto:security@example.com")).toBe("mailto:security@example.com");

    for (const unsafeUrl of [
      "https://user@example.com/",
      "https://user:secret@example.com/",
      "https://",
      "https://example.com/%0aheader",
      "https://example.com/path\nnext",
      "mailto:?subject=missing",
    ]) {
      expect(() => requireSafeExternalUrl(unsafeUrl)).toThrow();
    }
  });
});
