/** Launches one native Agent as an isolated POSIX process group when available. */
export function createManagedAgentProcess({
  spawn,
  executablePath,
  args,
  options,
  platform = process.platform,
}) {
  const grouped = platform !== "win32";
  const child = spawn(executablePath, args, {
    ...options,
    shell: false,
    detached: grouped,
  });
  return { child, grouped };
}

/** Terminates the harness and descendants; falls back to the direct child handle. */
export function terminateManagedAgentProcess(
  processHandle,
  signal = "SIGTERM",
  { platform = process.platform, processKill = process.kill } = {},
) {
  const child = processHandle?.child;
  if (!child) return false;
  if (platform !== "win32" && processHandle.grouped && Number.isSafeInteger(child.pid) && child.pid > 0) {
    try {
      processKill(-child.pid, signal);
      return true;
    } catch {
      // The leader may have exited while a direct child handle is still usable.
    }
  }
  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}
