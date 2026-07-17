import { spawn } from "node:child_process";

export function spawnManagedChild(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
  });
}

export function terminateManagedChild(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;

  if (process.platform !== "win32" && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  return child.kill(signal);
}
