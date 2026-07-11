import { spawn } from "node:child_process";
import { watch, watchFile, unwatchFile } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultElectronBin } from "./electron-runtime.mjs";
import { probeViteDevServer } from "./vite-client-health.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const devUrl = "http://127.0.0.1:5173";
const mainWatchPaths = [
  path.join(desktopRoot, "electron"),
  path.join(desktopRoot, "local-api"),
  path.join(desktopRoot, "public", "logo-square.png"),
  path.join(desktopRoot, "build", "icon.icns"),
];
const rendererDependencyWatchPaths = [
  path.join(desktopRoot, "package.json"),
  path.join(desktopRoot, "package-lock.json"),
  path.join(desktopRoot, "node_modules", "vite", "package.json"),
  path.join(desktopRoot, "node_modules", "vite", "dist", "client", "client.mjs"),
];

let renderer = null;
let healthCheckInFlight = false;
let electron = null;
let electronRestarting = false;
let electronRestartTimer = null;
let environmentRestartTimer = null;
let rendererRestartTimer = null;
let environmentRestarting = false;
let rendererStartedDuringEnvironmentRestart = false;
let shuttingDown = false;
let exitCode = 0;
const watchers = [];
let lastEnvironmentRestartReason = "renderer dependency changed";

startRenderer();
startRendererDependencyWatchers();

const healthCheck = setInterval(async () => {
  if (shuttingDown || !renderer || healthCheckInFlight) return;
  healthCheckInFlight = true;
  const probedRenderer = renderer;

  let result;
  try {
    result = await probeViteDevServer(devUrl, {
      signal: AbortSignal.timeout(2_000),
    });
  } finally {
    healthCheckInFlight = false;
  }

  if (renderer !== probedRenderer) return;

  if (!result.ready) {
    if (
      result.reason === "unresolved-client-placeholders" &&
      !environmentRestarting
    ) {
      const placeholders = result.placeholders.join(", ");
      scheduleEnvironmentRestart(`stale Vite client (${placeholders})`, 0);
    }
    return;
  }

  if (environmentRestarting) {
    if (!rendererStartedDuringEnvironmentRestart) return;
    environmentRestarting = false;
    rendererStartedDuringEnvironmentRestart = false;
    console.info("[desktop-dev] Renderer environment is healthy again.");
  }

  if (!electron) {
    startElectron();
    startMainWatchers();
  }
}, 500);

function startRenderer() {
  if (shuttingDown || renderer) return;

  const child = spawn("npm", ["run", "dev:renderer"], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: process.env,
  });
  renderer = child;
  if (environmentRestarting) {
    rendererStartedDuringEnvironmentRestart = true;
  }

  child.on("exit", (code) => {
    if (renderer !== child) return;
    renderer = null;

    if (shuttingDown) {
      maybeExit();
      return;
    }

    if (environmentRestarting) {
      scheduleRendererStart();
      return;
    }

    stopMainWatchers();
    exitCode = code ?? 0;
    shuttingDown = true;
    if (electron) electron.kill("SIGTERM");
    maybeExit();
  });
}

function scheduleRendererStart() {
  if (rendererRestartTimer) clearTimeout(rendererRestartTimer);
  rendererRestartTimer = setTimeout(() => {
    rendererRestartTimer = null;
    startRenderer();
  }, 600);
}

function startElectron() {
  if (shuttingDown || electron) return;
  const electronExecutable = getDefaultElectronBin(desktopRoot);

  const child = spawn(electronExecutable, ["."], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPYONE_DESKTOP_DEV_URL: devUrl,
    },
  });
  electron = child;

  child.on("exit", (code) => {
    if (electron !== child) return;
    electron = null;

    if (shuttingDown) {
      maybeExit();
      return;
    }

    if (environmentRestarting) return;

    if (electronRestarting) {
      electronRestarting = false;
      startElectron();
      return;
    }

    stopMainWatchers();
    exitCode = code ?? 0;
    shuttingDown = true;
    if (renderer) renderer.kill("SIGTERM");
    maybeExit();
  });
}

function scheduleElectronRestart() {
  if (shuttingDown || environmentRestarting || !electron) return;
  if (electronRestartTimer) clearTimeout(electronRestartTimer);
  electronRestartTimer = setTimeout(() => {
    electronRestartTimer = null;
    if (!electron) {
      startElectron();
      return;
    }
    electronRestarting = true;
    electron.kill("SIGTERM");
  }, 120);
}

function startMainWatchers() {
  if (watchers.length > 0) return;

  for (const watchPath of mainWatchPaths) {
    const watcher = watch(watchPath, { recursive: true }, (_eventType, fileName) => {
      const changedFile = String(fileName ?? "");
      if (changedFile.endsWith("~") || changedFile.includes(".swp")) return;
      scheduleElectronRestart();
    });
    watchers.push(watcher);
  }
}

function stopMainWatchers() {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers.length = 0;
}

function startRendererDependencyWatchers() {
  for (const watchPath of rendererDependencyWatchPaths) {
    watchFile(watchPath, { interval: 500 }, (current, previous) => {
      const unchanged =
        current.ino === previous.ino &&
        current.size === previous.size &&
        current.mtimeMs === previous.mtimeMs;
      if (unchanged) return;

      const relativePath = path.relative(desktopRoot, watchPath);
      scheduleEnvironmentRestart(`${relativePath} changed`, 700);
    });
  }
}

function stopRendererDependencyWatchers() {
  for (const watchPath of rendererDependencyWatchPaths) {
    unwatchFile(watchPath);
  }
}

function scheduleEnvironmentRestart(reason, delayMs) {
  if (shuttingDown) return;
  lastEnvironmentRestartReason = reason;
  if (environmentRestartTimer) clearTimeout(environmentRestartTimer);
  environmentRestartTimer = setTimeout(() => {
    environmentRestartTimer = null;
    restartEnvironment(lastEnvironmentRestartReason);
  }, delayMs);
}

function restartEnvironment(reason) {
  if (shuttingDown) return;
  environmentRestarting = true;
  rendererStartedDuringEnvironmentRestart = false;
  electronRestarting = false;

  if (electronRestartTimer) {
    clearTimeout(electronRestartTimer);
    electronRestartTimer = null;
  }

  console.warn(`[desktop-dev] ${reason}; restarting renderer and Electron.`);
  if (electron) electron.kill("SIGTERM");
  if (renderer) {
    renderer.kill("SIGTERM");
  } else {
    scheduleRendererStart();
  }
}

function beginShutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  stopMainWatchers();
  stopRendererDependencyWatchers();
  clearInterval(healthCheck);
  if (electronRestartTimer) clearTimeout(electronRestartTimer);
  if (environmentRestartTimer) clearTimeout(environmentRestartTimer);
  if (rendererRestartTimer) clearTimeout(rendererRestartTimer);
  if (electron) electron.kill("SIGTERM");
  if (renderer) renderer.kill("SIGTERM");
  maybeExit();
}

function maybeExit() {
  if (!shuttingDown || electron || renderer) return;
  process.exit(exitCode);
}

process.once("SIGINT", () => beginShutdown(130));
process.once("SIGTERM", () => beginShutdown(143));
