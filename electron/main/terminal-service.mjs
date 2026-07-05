import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import pty from "node-pty";

export function createTerminalService({
  appVersion,
  initializeWorkspaceEditReview,
  logger = console,
}) {
  const sessions = new Map();

  async function create(sender, request, workspaceRoot = null) {
    const cwd = normalizeTerminalCwd(request?.cwd, workspaceRoot);
    const id = normalizeTerminalId(request?.id);
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    const spawnConfig = buildTerminalSpawnConfig();

    close(id);
    await initializeWorkspaceEditReview(cwd).catch((error) => {
      logger.warn("Unable to initialize edit review baseline:", error);
    });

    let terminal;
    try {
      terminal = pty.spawn(spawnConfig.file, spawnConfig.args, {
        name: "xterm-256color",
        cwd,
        cols,
        rows,
        env: buildTerminalEnv(appVersion),
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
      sessions.delete(id);
    });

    return {
      id,
      pid: terminal.pid ?? null,
      shell: spawnConfig.displayShell,
      cwd,
    };
  }

  function input(request) {
    const session = get(request?.id);
    const data = request?.data;
    if (!session || typeof data !== "string" || data.length === 0) return;
    session.terminal.write(data);
  }

  function resize(request) {
    const session = get(request?.id);
    if (!session) return;
    const cols = normalizeTerminalSize(request?.cols, 80, 20, 400);
    const rows = normalizeTerminalSize(request?.rows, 24, 8, 120);
    session.cols = cols;
    session.rows = rows;
    session.terminal.resize(cols, rows);
  }

  function close(id) {
    const session = get(id);
    if (!session) return;
    sessions.delete(session.id);
    try {
      session.terminal.kill();
    } catch {
      // The PTY may already be gone.
    }
  }

  function closeSessionsForWindow(webContentsId) {
    for (const [id, session] of Array.from(sessions.entries())) {
      if (session.sender.id === webContentsId) {
        close(id);
      }
    }
  }

  function closeAll() {
    for (const id of Array.from(sessions.keys())) {
      close(id);
    }
  }

  function getSessionCount() {
    return sessions.size;
  }

  function get(id) {
    if (typeof id !== "string") return null;
    return sessions.get(id) ?? null;
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

function normalizeTerminalCwd(cwd, workspaceRoot) {
  if (typeof workspaceRoot === "string" && workspaceRoot.trim().length > 0) {
    const root = path.resolve(workspaceRoot);
    if (typeof cwd === "string" && cwd.trim().length > 0) {
      const resolved = path.resolve(root, cwd);
      if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
        return resolved;
      }
    }
    return root;
  }

  if (typeof cwd === "string" && cwd.trim().length > 0) {
    return path.resolve(cwd);
  }
  return os.homedir();
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

function buildTerminalSpawnConfig() {
  if (process.platform === "win32") {
    const file = process.env.ComSpec || "cmd.exe";
    return {
      file,
      args: [],
      displayShell: path.basename(file),
    };
  }

  const file = process.env.SHELL || "/bin/zsh";
  const shellName = path.basename(file);
  const args = shellName === "bash" || shellName === "zsh" ? ["-l"] : [];

  return {
    file,
    args,
    displayShell: shellName,
  };
}

function buildTerminalEnv(appVersion) {
  const env = { ...process.env };
  delete env.NO_COLOR;

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
