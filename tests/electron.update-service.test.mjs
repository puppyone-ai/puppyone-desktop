import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_UPDATE_INITIAL_DELAY_MS,
  BACKGROUND_UPDATE_INTERVAL_MS,
  createUpdateService,
  resolveDesktopUpdateConfiguration,
} from "../electron/update-service.mjs";
import { resolveDesktopBuildIdentity } from "../shared/desktop-build-identity.mjs";

const commitSha = "d".repeat(40);

describe("Desktop updater channel isolation", () => {
  it("pins Internal builds to the Internal feed and ignores runtime overrides", () => {
    const buildInfo = resolveDesktopBuildIdentity({
      baseVersion: "1.4.0",
      buildNumber: 72,
      channel: "internal",
      commitSha,
    });
    expect(resolveDesktopUpdateConfiguration({
      buildInfo,
      environment: {
        PUPPYONE_DESKTOP_UPDATE_CHANNEL: "stable",
        PUPPYONE_DESKTOP_UPDATE_URL: "https://attacker.invalid/latest",
        PUPPYONE_DESKTOP_DEV_UPDATE_URL: "https://attacker.invalid/dev",
        PUPPYONE_DESKTOP_FORCE_DEV_UPDATE_CONFIG: "1",
      },
      isPackaged: true,
    })).toEqual({
      allowPrerelease: true,
      channel: "internal",
      currentVersion: "1.4.0-internal.72",
      feedUrl: "https://downloads.puppyone.ai/desktop/internal/mac/latest",
      forceDevUpdateConfig: false,
      updateChannel: "internal",
    });
  });

  it("pins Stable builds to the Stable feed and stable-only releases", () => {
    const buildInfo = resolveDesktopBuildIdentity({
      baseVersion: "1.4.0",
      buildNumber: 73,
      channel: "stable",
      commitSha,
    });
    expect(resolveDesktopUpdateConfiguration({
      buildInfo,
      environment: {},
      isPackaged: true,
    })).toMatchObject({
      allowPrerelease: false,
      channel: "stable",
      currentVersion: "1.4.0",
      feedUrl: "https://updates.puppyone.ai/desktop/stable/mac/latest",
      forceDevUpdateConfig: false,
      updateChannel: "stable",
    });
  });

  it("keeps Development updates off unless an unpackaged test opts in explicitly", () => {
    const buildInfo = resolveDesktopBuildIdentity({
      baseVersion: "1.4.0",
      channel: "dev",
      commitSha,
    });
    expect(resolveDesktopUpdateConfiguration({
      buildInfo,
      environment: {
        PUPPYONE_DESKTOP_DEV_UPDATE_URL: "https://localhost.invalid/dev",
      },
      isPackaged: false,
    })).toMatchObject({
      channel: "dev",
      feedUrl: null,
      forceDevUpdateConfig: false,
      updateChannel: null,
    });
    expect(resolveDesktopUpdateConfiguration({
      buildInfo,
      environment: {
        PUPPYONE_DESKTOP_DEV_UPDATE_URL: "https://localhost.invalid/dev/",
        PUPPYONE_DESKTOP_FORCE_DEV_UPDATE_CONFIG: "true",
      },
      isPackaged: false,
    })).toMatchObject({
      channel: "dev",
      feedUrl: "https://localhost.invalid/dev",
      forceDevUpdateConfig: true,
      updateChannel: "dev",
    });
  });

  it("never enables a Development override inside a packaged app", () => {
    const buildInfo = resolveDesktopBuildIdentity({
      baseVersion: "1.4.0",
      channel: "dev",
      commitSha,
    });
    expect(resolveDesktopUpdateConfiguration({
      buildInfo,
      environment: {
        PUPPYONE_DESKTOP_DEV_UPDATE_URL: "https://localhost.invalid/dev",
        PUPPYONE_DESKTOP_FORCE_DEV_UPDATE_CONFIG: "1",
      },
      isPackaged: true,
    })).toMatchObject({
      feedUrl: null,
      forceDevUpdateConfig: false,
      updateChannel: null,
    });
  });

  it("checks Stable feeds quietly in the background and keeps the Settings command", async () => {
    vi.useFakeTimers();
    let service;
    try {
      const buildInfo = resolveDesktopBuildIdentity({
        baseVersion: "1.4.0",
        buildNumber: 74,
        channel: "stable",
        commitSha,
      });
      const handlers = new Map();
      const autoUpdater = new EventEmitter();
      let checkCount = 0;
      Object.assign(autoUpdater, {
        checkForUpdates: async () => {
          checkCount += 1;
          return { updateInfo: null };
        },
        setFeedURL: () => {},
      });
      service = createUpdateService({
        app: { isPackaged: true },
        autoUpdater,
        buildInfo,
        getRestartBlockers: () => [],
        getWindows: () => [],
        ipcMain: {
          handle: (channel, handler) => handlers.set(channel, handler),
        },
        platform: "linux",
      });

      service.start();
      service.start();
      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_INITIAL_DELAY_MS - 1);

      expect(checkCount).toBe(0);
      expect(service.getState().status).toBe("idle");
      await vi.advanceTimersByTimeAsync(1);
      expect(checkCount).toBe(1);
      expect(service.getState().status).toBe("not-available");

      const checkFromSettings = handlers.get("updates:check");
      expect(checkFromSettings).toBeTypeOf("function");
      await checkFromSettings();

      expect(checkCount).toBe(2);
      expect(service.getState().status).toBe("not-available");
      service.dispose();
      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_INTERVAL_MS);
      expect(checkCount).toBe(2);
    } finally {
      service?.dispose();
      vi.useRealTimers();
    }
  });
});

describe("Desktop updater restart safety", () => {
  it("reuses a downloaded update and confirms PuppyOne-owned sessions without checking again", async () => {
    const buildInfo = resolveDesktopBuildIdentity({
      baseVersion: "1.4.0",
      buildNumber: 75,
      channel: "stable",
      commitSha,
    });
    const handlers = new Map();
    const autoUpdater = new EventEmitter();
    const updateInfo = {
      version: "1.4.1",
      releaseName: "PuppyOne 1.4.1",
      releaseDate: "2026-07-31T00:00:00.000Z",
      releaseNotes: null,
    };
    const checkForUpdates = vi.fn(async () => {
      autoUpdater.emit("update-available", updateInfo);
      return { updateInfo };
    });
    const downloadUpdate = vi.fn(async () => {
      autoUpdater.emit("update-downloaded", updateInfo);
      return [];
    });
    const quitAndInstall = vi.fn();
    const confirmRestartWithBlockers = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    Object.assign(autoUpdater, {
      checkForUpdates,
      downloadUpdate,
      quitAndInstall,
      setFeedURL: vi.fn(),
    });
    const blockers = [{
      id: "terminal-sessions",
      label: "PuppyOne terminal sessions open (4)",
      detail: "External terminals are not affected.",
    }];
    const service = createUpdateService({
      app: { isPackaged: true },
      autoUpdater,
      buildInfo,
      confirmRestartWithBlockers,
      getRestartBlockers: () => blockers,
      getWindows: () => [],
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
      },
      platform: "linux",
    });

    service.start();
    const updateNow = handlers.get("updates:update-now");
    expect(updateNow).toBeTypeOf("function");

    await updateNow();
    expect(service.getState()).toMatchObject({
      status: "blocked",
      availableVersion: "1.4.1",
      blockers,
    });
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(quitAndInstall).not.toHaveBeenCalled();
    expect(confirmRestartWithBlockers).toHaveBeenLastCalledWith({
      availableVersion: "1.4.1",
      blockers,
      currentVersion: "1.4.0",
    });

    await updateNow();
    expect(service.getState()).toMatchObject({
      status: "installing",
      availableVersion: "1.4.1",
      blockers: [],
    });
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(confirmRestartWithBlockers).toHaveBeenCalledTimes(2);
    expect(quitAndInstall).toHaveBeenCalledOnce();
  });
});
