import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";

export const LOCAL_AGENT_PROBE_TIMEOUT_MS = 1_500;
export const LOCAL_AGENT_PROBE_MAX_OUTPUT_BYTES = 16 * 1024;

const ENVIRONMENT_ALLOWLIST = Object.freeze([
  "HOME", "USER", "LOGNAME", "PATH", "TMPDIR", "TMP", "TEMP",
  "LANG", "LC_ALL", "LC_CTYPE", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_STATE_HOME", "XDG_CACHE_HOME", "SystemRoot", "ComSpec", "PATHEXT",
]);

export function createProbeEnvironment(baseEnv = process.env) {
  const environment = {};
  for (const key of ENVIRONMENT_ALLOWLIST) {
    const value = baseEnv?.[key];
    if (typeof value === "string" && value.length <= 8_192 && !value.includes("\0")) environment[key] = value;
  }
  return {
    ...environment,
    TERM: "dumb",
    NO_COLOR: "1",
    PUPPYONE_AGENT_PROBE: "1",
  };
}

export function runBoundedProbeCommand(executablePath, args, {
  spawn = nodeSpawn,
  env = createProbeEnvironment(),
  cwd,
  timeoutMs = LOCAL_AGENT_PROBE_TIMEOUT_MS,
  maxOutputBytes = LOCAL_AGENT_PROBE_MAX_OUTPUT_BYTES,
  signal,
} = {}) {
  validateLaunch(executablePath, args);
  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    };
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const kill = () => {
      try {
        child?.kill?.("SIGKILL");
      } catch {
        // The child may have exited between the guard and kill.
      }
    };
    const fail = (message) => {
      kill();
      child?.stdout?.destroy?.();
      child?.stderr?.destroy?.();
      finish(() => reject(new Error(message)));
    };
    const abort = () => fail("Local Agent probe was cancelled.");
    const append = (target, chunk) => {
      const value = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      outputBytes += Buffer.byteLength(value, "utf8");
      if (outputBytes > maxOutputBytes) {
        fail("Local Agent probe output exceeded the safety limit.");
        return target;
      }
      return target + value;
    };

    if (signal?.aborted) {
      reject(new Error("Local Agent probe was cancelled."));
      return;
    }
    try {
      child = spawn(executablePath, args, {
        ...(cwd ? { cwd } : {}),
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      reject(new Error("Local Agent probe could not start."));
      return;
    }
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once?.("error", () => finish(() => reject(new Error("Local Agent probe could not start."))));
    child.once?.("close", (code, closeSignal) => finish(() => resolve({
      stdout,
      stderr,
      code: Number.isInteger(code) ? code : null,
      signal: closeSignal ? String(closeSignal) : null,
    })));
    signal?.addEventListener?.("abort", abort, { once: true });
    timer = setTimeout(() => fail("Local Agent probe timed out."), Math.max(1, Math.min(timeoutMs, 10_000)));
    timer.unref?.();
  });
}

function validateLaunch(executablePath, args) {
  if (typeof executablePath !== "string" || !path.isAbsolute(executablePath) || /[\r\n\0]/.test(executablePath)) {
    throw new TypeError("Local Agent probes require a safe absolute executable path.");
  }
  if (!Array.isArray(args) || args.length > 16 || args.some((arg) => (
    typeof arg !== "string" || arg.length > 4_096 || /[\r\n\0]/.test(arg)
  ))) {
    throw new TypeError("Local Agent probe arguments are invalid.");
  }
}
