import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
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

  it("keeps Stable update checks manual and exposes only the Settings command", async () => {
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
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

      expect(checkCount).toBe(0);
      expect(service.getState().status).toBe("idle");
      const checkFromSettings = handlers.get("updates:check");
      expect(checkFromSettings).toBeTypeOf("function");
      await checkFromSettings();

      expect(checkCount).toBe(1);
      expect(service.getState().status).toBe("not-available");
      service.dispose();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(checkCount).toBe(1);
    } finally {
      service?.dispose();
      vi.useRealTimers();
    }
  });
});
