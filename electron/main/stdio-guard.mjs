/**
 * Electron main can keep running after its inherited stdout/stderr pipe is
 * closed (Dock launch, detached child, closed terminal). console.* then throws
 * `write EIO` / `write EPIPE`, and Electron surfaces that as an Uncaught Exception
 * dialog — often when IPC replyWithError tries to log a rejected invoke.
 *
 * Install this before any other main-process logging.
 *
 * Do not register a blanket `uncaughtException` listener here: Electron hides its
 * default crash dialog whenever any such listener is present.
 */

const BROKEN_STDIO_CODES = new Set(["EIO", "EPIPE"]);

export function isBrokenStdioWriteError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  if (!BROKEN_STDIO_CODES.has(error.code)) {
    return false;
  }
  if (error.syscall === "write") {
    return true;
  }
  return /^write E(IO|PIPE)$/i.test(String(error.message ?? ""));
}

function ignoreBrokenStdioStreamErrors(stream) {
  if (!stream || typeof stream.on !== "function") {
    return;
  }
  stream.on("error", (error) => {
    if (isBrokenStdioWriteError(error)) {
      return;
    }
    try {
      process.emitWarning?.(error);
    } catch {
      // ignore secondary logging failures
    }
  });
}

function wrapConsoleMethod(methodName) {
  const original = console[methodName];
  if (typeof original !== "function") {
    return;
  }
  console[methodName] = (...args) => {
    try {
      return original.apply(console, args);
    } catch (error) {
      if (isBrokenStdioWriteError(error)) {
        return undefined;
      }
      throw error;
    }
  };
}

/**
 * @param {NodeJS.Process} [targetProcess]
 * @returns {{ installed: true }}
 */
export function installBrokenStdioGuards(targetProcess = process) {
  ignoreBrokenStdioStreamErrors(targetProcess.stdout);
  ignoreBrokenStdioStreamErrors(targetProcess.stderr);

  for (const methodName of ["error", "warn", "log", "info", "debug"]) {
    wrapConsoleMethod(methodName);
  }

  return { installed: true };
}
