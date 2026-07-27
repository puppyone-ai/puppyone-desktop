import fs from "node:fs";
import path from "node:path";

const DESKTOP_LAUNCH_INTENT_VERSION = 1;

export function createDesktopLaunchIntent({
  argv = process.argv,
  workingDirectory = process.cwd(),
  isPackaged = false,
  statSync = fs.statSync,
} = {}) {
  const launchArguments = Array.isArray(argv)
    ? argv.slice(isPackaged ? 1 : 2)
    : [];

  return {
    version: DESKTOP_LAUNCH_INTENT_VERSION,
    workspacePath: findWorkspacePathArg(launchArguments, {
      workingDirectory,
      statSync,
    }),
  };
}

export function parseDesktopLaunchIntent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== DESKTOP_LAUNCH_INTENT_VERSION) return null;

  if (value.workspacePath === null) {
    return {
      version: DESKTOP_LAUNCH_INTENT_VERSION,
      workspacePath: null,
    };
  }

  if (
    typeof value.workspacePath !== "string"
    || value.workspacePath.trim().length === 0
    || !path.isAbsolute(value.workspacePath)
  ) {
    return null;
  }

  return {
    version: DESKTOP_LAUNCH_INTENT_VERSION,
    workspacePath: path.normalize(value.workspacePath),
  };
}

export function findWorkspacePathArg(argv, {
  workingDirectory = process.cwd(),
  statSync = fs.statSync,
} = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const basePath = resolveWorkingDirectory(workingDirectory);

  for (const rawArgument of [...args].reverse()) {
    if (typeof rawArgument !== "string") continue;
    const argument = rawArgument.trim();
    if (!argument || argument.startsWith("-")) continue;

    try {
      const candidate = path.resolve(basePath, argument);
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Command-line input is untrusted. Non-path arguments are ignored.
    }
  }

  return null;
}

export async function handleSecondInstanceLaunch({
  launchIntent,
  argv,
  workingDirectory,
  isPackaged = false,
  statSync = fs.statSync,
  openWorkspaceInNewWindow,
  revealOrCreateWindow,
  reportError = console.error,
} = {}) {
  const intent = parseDesktopLaunchIntent(launchIntent)
    ?? createDesktopLaunchIntent({
      argv,
      workingDirectory,
      isPackaged,
      statSync,
    });

  if (!intent.workspacePath) {
    return revealSafely({
      revealOrCreateWindow,
      reportError,
      successStatus: "revealed-window",
    });
  }

  try {
    await openWorkspaceInNewWindow(intent.workspacePath);
    return {
      status: "opened-workspace",
      workspacePath: intent.workspacePath,
    };
  } catch (error) {
    reportSafely(
      reportError,
      "Unable to open the workspace requested by a second puppyone instance:",
      error,
    );
    return revealSafely({
      revealOrCreateWindow,
      reportError,
      successStatus: "recovered-window",
      workspacePath: intent.workspacePath,
    });
  }
}

function resolveWorkingDirectory(value) {
  if (typeof value !== "string" || value.trim().length === 0) return process.cwd();
  try {
    return path.resolve(value);
  } catch {
    return process.cwd();
  }
}

async function revealSafely({
  revealOrCreateWindow,
  reportError,
  successStatus,
  workspacePath = null,
}) {
  try {
    await revealOrCreateWindow();
    return {
      status: successStatus,
      workspacePath,
    };
  } catch (error) {
    reportSafely(
      reportError,
      "Unable to reveal puppyone after a second-instance launch:",
      error,
    );
    return {
      status: "ignored-error",
      workspacePath,
    };
  }
}

function reportSafely(reportError, message, error) {
  if (typeof reportError !== "function") return;
  try {
    reportError(message, error);
  } catch {
    // A diagnostic sink must never turn an optional launch route into a crash.
  }
}
