import fs from "node:fs";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";

/** Electron-safe spawn hook for Node-backed and native Claude Code installs. */
export function createClaudeSpawn({ spawn = nodeSpawn, fsModule = fs, onStderr = () => {} } = {}) {
  return (options) => {
    let command = options.command;
    let args = Array.isArray(options.args) ? [...options.args] : [];
    if (requiresNode(command)) {
      const node = resolveNodeExecutable(options.env?.PATH, fsModule);
      if (!node) throw new Error("Claude Code is Node-backed, but a Node executable was not found in its runtime PATH.");
      args = [command, ...args];
      command = node;
    } else if (command === "node") {
      command = resolveNodeExecutable(options.env?.PATH, fsModule) ?? command;
    }
    if (typeof command !== "string" || !path.isAbsolute(command) || /[\r\n\0]/u.test(command)) {
      throw new Error("Claude Code process command must be an absolute validated path.");
    }
    if (args.some((argument) => (
      typeof argument !== "string" || argument.length > 4_096 || /[\r\n\0]/u.test(argument)
    ))) {
      throw new Error("Claude Code process arguments are invalid.");
    }
    if (typeof options.cwd !== "string" || !path.isAbsolute(options.cwd) || /[\r\n\0]/u.test(options.cwd)) {
      throw new Error("Claude Code process working directory must be absolute.");
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      // The SDK drains stderr and forwards it to the adapter's bounded,
      // redacted diagnostic callback. Keeping it piped also prevents a noisy
      // native CLI from inheriting Electron's stdio or filling an OS pipe.
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stderr?.on?.("data", (chunk) => onStderr(String(chunk).slice(-8_192)));
    const stop = () => {
      try { child.kill("SIGTERM"); } catch { /* Process already exited. */ }
    };
    if (options.signal?.aborted) stop();
    else options.signal?.addEventListener?.("abort", stop, { once: true });
    if (!child.stdin || !child.stdout) throw new Error("Claude Code process streams are unavailable.");
    return child;
  };
}

function requiresNode(command) {
  return typeof command === "string" && /\.(?:c?js|mjs)$/iu.test(command);
}

function resolveNodeExecutable(pathValue, fsModule) {
  const separator = process.platform === "win32" ? ";" : ":";
  const names = process.platform === "win32" ? ["node.exe", "node"] : ["node"];
  const candidates = [];
  for (const directory of String(pathValue || "").split(separator).filter(path.isAbsolute)) {
    for (const name of names) candidates.push(path.join(directory, name));
  }
  if (path.basename(process.execPath).toLowerCase().startsWith("node")) candidates.push(process.execPath);
  return candidates.find((candidate) => {
    try {
      fsModule.accessSync(candidate, fsModule.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) ?? null;
}
