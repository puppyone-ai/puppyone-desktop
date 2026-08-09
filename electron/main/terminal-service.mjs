import { randomUUID } from "node:crypto";
import path from "node:path";
import pty from "node-pty";
import { resolveCanonicalWorkspaceDirectory } from "./workspace-authorization.mjs";

export function createTerminalService({
  appVersion,
  environment = process.env,
  initializeWorkspaceEditReview,
  logger = console,
  platform = process.platform,
  ptyService = pty,
}) {
  const sessions = new Map();

  async function create(sender, request, workspaceRoot = null) {
    const senderId = requireSenderId(sender);
    if (typeof workspaceRoot !== "string" || workspaceRoot.trim().length === 0) {
      throw new Error("No local workspace is assigned to this window.");
    }
    const cwd = await resolveCanonicalWorkspaceDirectory(
      workspaceRoot,
      request?.cwd ?? workspaceRoot,
      { label: "Terminal cwd" },
    );
    const id = normalizeTerminalId(request?.id);
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    const spawnConfig = buildTerminalSpawnConfig(environment, platform);

    const existing = get(id);
    if (existing && existing.sender.id !== senderId) {
      throw new Error("Terminal session id is already owned by another window.");
    }
    if (existing) closeSession(existing);
    await initializeWorkspaceEditReview(workspaceRoot).catch((error) => {
      logger.warn("Unable to initialize edit review baseline:", error);
    });

    let terminal;
    try {
      terminal = ptyService.spawn(spawnConfig.file, spawnConfig.args, {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: buildTerminalEnvironment(environment, {
          appVersion,
          freshLoginShell: spawnConfig.loginShell,
          platform,
        }),
      });
    } catch (error) {
      throw new Error(`Failed to start terminal: ${error instanceof Error ? error.message : String(error)}`);
    }

    const session = {
      id,
      terminal,
      sender,
      cols,
      rows,
    };

    sessions.set(id, session);

    terminal.onData((data) => sendTerminalData(session, data));
    terminal.onExit(({ exitCode, signal }) => {
      sendTerminalExit(session, exitCode, signal ? String(signal) : null);
      if (sessions.get(id) === session) sessions.delete(id);
    });

    return {
      id,
      pid: terminal.pid ?? null,
      shell: spawnConfig.displayShell,
      cwd,
    };
  }

  function input(sender, request) {
    const session = getOwnedSession(sender, request?.id);
    const data = request?.data;
    if (!session || typeof data !== "string" || data.length === 0) return false;
    session.terminal.write(data);
    return true;
  }

  function resize(sender, request) {
    const session = getOwnedSession(sender, request?.id);
    if (!session) return false;
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    session.cols = cols;
    session.rows = rows;
    session.terminal.resize(cols, rows);
    return true;
  }

  function close(sender, id) {
    const session = getOwnedSession(sender, id);
    if (!session) return false;
    closeSession(session);
    return true;
  }

  function closeSession(session) {
    sessions.delete(session.id);
    try {
      session.terminal.kill();
    } catch {
      // The PTY may already be gone.
    }
  }

  function closeSessionsForWindow(webContentsId) {
    for (const session of Array.from(sessions.values())) {
      if (session.sender.id === webContentsId) {
        closeSession(session);
      }
    }
  }

  function closeAll() {
    for (const session of Array.from(sessions.values())) {
      closeSession(session);
    }
  }

  function getSessionCount() {
    return sessions.size;
  }

  function get(id) {
    if (typeof id !== "string") return null;
    return sessions.get(id) ?? null;
  }

  function getOwnedSession(sender, id) {
    const session = get(id);
    return session && sender?.id === session.sender.id ? session : null;
  }

  return {
    create,
    input,
    resize,
    close,
    closeSessionsForWindow,
    closeAll,
    getSessionCount,
  };
}

function requireSenderId(sender) {
  const senderId = sender?.id;
  if (!Number.isSafeInteger(senderId) || senderId <= 0) {
    throw new Error("Terminal sender is invalid.");
  }
  return senderId;
}

function normalizeTerminalId(id) {
  if (typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id)) {
    return id;
  }
  return randomUUID();
}

function normalizeTerminalSize(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), min), max);
}

function buildTerminalSpawnConfig(environment, platform) {
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") {
    const file = environment.ComSpec || environment.COMSPEC || "cmd.exe";
    return {
      file,
      args: [],
      displayShell: pathModule.basename(file),
      loginShell: false,
    };
  }

  const file = environment.SHELL || "/bin/zsh";
  const shellName = pathModule.basename(file);
  const args = shellName === "bash" || shellName === "zsh" ? ["-l"] : [];

  return {
    file,
    args,
    displayShell: shellName,
    loginShell: args.length > 0,
  };
}

const NPM_LIFECYCLE_KEYS = new Set([
  "INIT_CWD",
  "NPM_COMMAND",
  "NPM_EXECPATH",
  "NPM_NODE_EXECPATH",
]);

export function buildTerminalEnvironment(source, {
  appVersion,
  platform = process.platform,
  freshLoginShell = platform !== "win32",
} = {}) {
  const entries = Object.entries(source ?? {})
    .filter(([, value]) => typeof value === "string");
  const condaPrefixes = freshLoginShell
    ? entries
      .filter(([key, value]) => /^CONDA_PREFIX(?:_\d+)?$/i.test(key) && value)
      .map(([, value]) => value)
    : [];
  const env = {};

  for (const [key, value] of entries) {
    const canonicalKey = key.toUpperCase();
    if (canonicalKey === "NO_COLOR") continue;
    if (isNpmLifecycleKey(canonicalKey) || canonicalKey === "NPM_CONFIG_PREFIX") continue;
    if (canonicalKey === "PREFIX") continue;
    if (freshLoginShell && isCondaActivationKey(canonicalKey)) continue;
    env[key] = value;
  }

  if (freshLoginShell && typeof env.PATH === "string" && condaPrefixes.length > 0) {
    env.PATH = removeCondaActivationPaths(env.PATH, condaPrefixes, platform);
  }

  return {
    ...env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLICOLOR: env.CLICOLOR || "1",
    TERM_PROGRAM: "PuppyOne",
    TERM_PROGRAM_VERSION: appVersion,
    PUPPYONE_TERMINAL: "1",
  };
}

function isNpmLifecycleKey(key) {
  const canonicalKey = key.toUpperCase();
  return NPM_LIFECYCLE_KEYS.has(canonicalKey)
    || canonicalKey.startsWith("NPM_LIFECYCLE_")
    || canonicalKey.startsWith("NPM_PACKAGE_");
}

function isCondaActivationKey(key) {
  return key === "CONDA_PREFIX"
    || /^CONDA_PREFIX_\d+$/.test(key)
    || key === "CONDA_SHLVL"
    || key === "CONDA_DEFAULT_ENV"
    || key === "CONDA_PROMPT_MODIFIER"
    || key === "CONDA_PATH_BACKUP"
    || key === "CONDA_PS1_BACKUP"
    || /^CONDA_STACKED_\d+$/.test(key)
    || /^__CONDA_SHLVL_\d+_/.test(key);
}

function removeCondaActivationPaths(value, prefixes, platform) {
  const separator = platform === "win32" ? ";" : ":";
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const targets = new Set();
  for (const prefix of prefixes) {
    const candidatePaths = platform === "win32"
      ? [
          prefix,
          pathModule.join(prefix, "Library", "mingw-w64", "bin"),
          pathModule.join(prefix, "Library", "usr", "bin"),
          pathModule.join(prefix, "Library", "bin"),
          pathModule.join(prefix, "Scripts"),
          pathModule.join(prefix, "bin"),
        ]
      : [pathModule.join(prefix, "bin")];
    for (const candidate of candidatePaths) {
      targets.add(normalizePathEntry(candidate, platform));
    }
  }

  return value
    .split(separator)
    .filter((entry) => !targets.has(normalizePathEntry(entry, platform)))
    .join(separator);
}

function normalizePathEntry(value, platform) {
  const normalized = String(value).replace(/[\\/]+$/u, "");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sendTerminalData(session, data) {
  if (session.sender.isDestroyed()) return;
  session.sender.send("terminal:data", {
    id: session.id,
    data: String(data),
  });
}

function sendTerminalExit(session, code, signal) {
  if (session.sender.isDestroyed()) return;
  session.sender.send("terminal:exit", {
    id: session.id,
    code,
    signal,
  });
}
