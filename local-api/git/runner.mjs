import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const GIT_MAX_BUFFER = 4 * 1024 * 1024;
export const GIT_STREAM_MAX_BYTES = 8 * 1024 * 1024;

/** Fast read-only queries (status, rev-parse, fingerprint). */
export const GIT_READ_TIMEOUT_MS = 5_000;
/**
 * Local mutations that may run hooks (commit, merge tooling, stash).
 * Must not share the read timeout — legitimate pre-commit hooks often exceed 5s.
 */
export const GIT_MUTATION_TIMEOUT_MS = 120_000;
/** Network-bound operations (fetch/push/pull/publish). */
export const GIT_NETWORK_TIMEOUT_MS = 60_000;

/** @deprecated Prefer GIT_READ_TIMEOUT_MS; kept for existing call sites. */
export const GIT_DEFAULT_TIMEOUT_MS = GIT_READ_TIMEOUT_MS;

export function execGit(rootPath, args, options = {}) {
  const timeout = options.timeout ?? GIT_READ_TIMEOUT_MS;
  return execFileAsync("git", ["-C", rootPath, "-c", "core.quotePath=false", ...args], {
    timeout,
    maxBuffer: options.maxBuffer ?? GIT_MAX_BUFFER,
    signal: options.signal,
    env: buildGitEnvironment({ optionalLocks: options.optionalLocks }),
  }).catch((error) => {
    annotateGitError(error, args, timeout);
    throw error;
  });
}

/**
 * Bounded binary-safe Git read. Callers must provide a domain-specific
 * maxBuffer; the default deliberately stays at the ordinary Git output cap.
 */
export function execGitBuffer(rootPath, args, options = {}) {
  const timeout = options.timeout ?? GIT_READ_TIMEOUT_MS;
  return execFileAsync("git", ["-C", rootPath, "-c", "core.quotePath=false", ...args], {
    encoding: null,
    timeout,
    maxBuffer: options.maxBuffer ?? GIT_MAX_BUFFER,
    signal: options.signal,
    env: buildGitEnvironment({ optionalLocks: options.optionalLocks }),
  }).catch((error) => {
    annotateGitError(error, args, timeout);
    throw error;
  });
}

/**
 * Runs a potentially large read without buffering an unbounded child-process
 * result. The returned stdout always ends on a complete NUL-delimited record
 * when the process is stopped by a byte/record limit.
 */
export function execGitStreaming(rootPath, args, options = {}) {
  const timeout = options.timeout ?? GIT_READ_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? GIT_STREAM_MAX_BYTES;
  const recordLimit = options.recordLimit ?? 0;
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const child = spawn(
      "git",
      ["-C", rootPath, "-c", "core.quotePath=false", ...args],
      {
        env: buildGitEnvironment({ optionalLocks: options.optionalLocks }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let recordCount = 0;
    let didHitLimit = false;
    let timedOut = false;
    let aborted = false;
    let spawnError = null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      if (didHitLimit) return;
      stdout += chunk;
      stdoutBytes += Buffer.byteLength(chunk);
      recordCount += countCharacter(chunk, "\0");
      if (stdoutBytes > maxBytes || (recordLimit > 0 && recordCount > recordLimit)) {
        didHitLimit = true;
        stdout = trimToCompleteNulRecord(stdout);
        killChild(child);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < GIT_MAX_BUFFER) stderr += chunk;
    });
    child.on("error", (error) => {
      spawnError = error;
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChild(child);
    }, timeout);
    timeoutHandle.unref?.();

    const onAbort = () => {
      aborted = true;
      killChild(child);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (exitCode) => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);

      if (aborted || signal?.aborted) {
        reject(createAbortError());
        return;
      }
      if (timedOut) {
        const error = new Error(`Git command timed out after ${Math.round(timeout / 1000)}s.`);
        error.code = "ETIMEDOUT";
        annotateGitError(error, args, timeout);
        reject(error);
        return;
      }
      if (spawnError) {
        annotateGitError(spawnError, args, timeout);
        reject(spawnError);
        return;
      }
      if (exitCode !== 0 && !didHitLimit) {
        const error = new Error(stderr.trim() || `Git exited with code ${exitCode}.`);
        error.code = exitCode;
        error.stdout = stdout;
        error.stderr = stderr;
        annotateGitError(error, args, timeout);
        reject(error);
        return;
      }

      resolve({ stdout, stderr, didHitLimit, recordCount });
    });
  });
}

export function buildGitEnvironment({ optionalLocks = true } = {}) {
  const env = {
    ...process.env,
    // Force English Git messages so error classification stays locale-stable.
    LC_ALL: "C",
    LANG: "C",
    GCM_INTERACTIVE: "never",
    GIT_TERMINAL_PROMPT: "0",
  };
  if (optionalLocks === false) env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}

export function getGitEnvironmentForTests(options = {}) {
  return buildGitEnvironment(options);
}

function annotateGitError(error, args, timeout) {
  if (!error || typeof error !== "object") return;
  error.gitArgs = args;
  error.gitTimeoutMs = timeout;
}

function trimToCompleteNulRecord(value) {
  const lastSeparator = value.lastIndexOf("\0");
  return lastSeparator >= 0 ? value.slice(0, lastSeparator + 1) : "";
}

function countCharacter(value, character) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === character) count += 1;
  }
  return count;
}

function killChild(child) {
  try {
    child.kill();
  } catch {
    // Best-effort cancellation.
  }
}

function createAbortError() {
  const error = new Error("Git command was cancelled.");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}
