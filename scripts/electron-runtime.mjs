import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const electronSourceBundleDefaults = {
  CFBundleName: "Electron",
  CFBundleDisplayName: "Electron",
  CFBundleIdentifier: "com.github.Electron",
  CFBundleExecutable: "Electron",
  CFBundleIconFile: "electron.icns",
};

export function getDefaultElectronBin(desktopRoot, platform = process.platform) {
  // Spawn the native executable directly on Windows.  The npm-generated
  // electron.cmd shim cannot be used with child_process.spawn without a shell
  // and made both `npm run dev` and `npm run start` fail before Electron ran.
  return platform === "win32"
    ? path.join(desktopRoot, "node_modules", "electron", "dist", "electron.exe")
    : path.join(desktopRoot, "node_modules", ".bin", "electron");
}

/**
 * Electron uses this variable to deliberately run its binary as plain Node.
 * A parent test runner or shell can leave it set, so never inherit it when
 * launching the desktop application itself.
 */
export function getElectronRuntimeEnv(env = process.env) {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...electronEnv } = env;
  return electronEnv;
}

export function prepareElectronAppRuntime({
  desktopRoot,
  targetAppPath,
  appName,
  displayName = appName,
  bundleIdentifier,
  iconPath,
}) {
  const defaultElectronBin = getDefaultElectronBin(desktopRoot);
  if (process.platform !== "darwin") return defaultElectronBin;

  const electronSourceAppPath = path.join(
    desktopRoot,
    "node_modules",
    "electron",
    "dist",
    "Electron.app",
  );
  const targetExecutablePath = path.join(targetAppPath, "Contents", "MacOS", "Electron");
  const targetInfoPlistPath = path.join(targetAppPath, "Contents", "Info.plist");
  const targetIconPath = path.join(targetAppPath, "Contents", "Resources", "electron.icns");

  try {
    repairElectronSourceBundle(electronSourceAppPath);

    if (!existsSync(targetExecutablePath)) {
      rmSync(targetAppPath, { recursive: true, force: true });
      copyAppBundle(electronSourceAppPath, targetAppPath);
    }

    if (iconPath && existsSync(iconPath) && existsSync(targetIconPath)) {
      copyFileSync(iconPath, targetIconPath);
    }

    if (existsSync(targetInfoPlistPath)) {
      setPlistValue(targetInfoPlistPath, "CFBundleName", appName);
      setPlistValue(targetInfoPlistPath, "CFBundleDisplayName", displayName);
      setPlistValue(targetInfoPlistPath, "CFBundleIdentifier", bundleIdentifier);
      setPlistValue(targetInfoPlistPath, "CFBundleExecutable", "Electron");
      setPlistValue(targetInfoPlistPath, "CFBundleIconFile", "electron.icns");
    }

    return targetExecutablePath;
  } catch (error) {
    console.warn("Unable to prepare puppyone Electron runtime:", error);
    return defaultElectronBin;
  }
}

function repairElectronSourceBundle(sourceAppPath) {
  const sourceInfoPlistPath = path.join(sourceAppPath, "Contents", "Info.plist");
  if (!existsSync(sourceInfoPlistPath)) return;

  for (const [key, value] of Object.entries(electronSourceBundleDefaults)) {
    if (readPlistValue(sourceInfoPlistPath, key) === value) continue;
    try {
      setPlistValue(sourceInfoPlistPath, key, value);
    } catch (error) {
      console.warn(`Unable to restore Electron source bundle ${key}:`, error);
    }
  }
}

function copyAppBundle(sourcePath, targetPath) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const result = spawnSync("/bin/cp", ["-R", sourcePath, targetPath], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to copy Electron app bundle from ${sourcePath}`);
  }
}

function readPlistValue(infoPlistPath, key) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, infoPlistPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function setPlistValue(infoPlistPath, key, value) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, infoPlistPath], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to set ${key} in ${infoPlistPath}`);
  }
}
