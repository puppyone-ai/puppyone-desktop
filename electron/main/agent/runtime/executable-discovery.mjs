import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";

const LOGIN_ENV_TIMEOUT_MS = 4_000;
const VERSION_TIMEOUT_MS = 4_000;
const MAX_DISCOVERY_OUTPUT = 64 * 1024;

export async function readLoginShellEnvironment({
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
} = {}) {
  if (platform === "win32") return {};
  const shell = typeof env.SHELL === "string" && path.isAbsolute(env.SHELL)
    ? env.SHELL
    : "/bin/zsh";
  const result = await runBounded(spawn, shell, ["-ilc", "/usr/bin/env -0"], {
    env,
    timeoutMs: LOGIN_ENV_TIMEOUT_MS,
    maxBytes: MAX_DISCOVERY_OUTPUT,
    label: "Agent login-shell environment",
  });
  if (result.code !== 0) throw new Error("Unable to read the login-shell environment.");
  const parsed = {};
  for (const entry of result.stdout.split("\0")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    parsed[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return parsed;
}

export async function discoverExecutable({
  executableNames,
  additionalCandidates = [],
  fsModule = fs,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
  parseVersion,
  minimumVersion,
  label,
  buildEnvironment = buildAgentEnvironment,
  validateCandidate,
  searchPath = true,
}) {
  let loginEnv = {};
  let environmentWarning = null;
  if (searchPath) {
    try {
      loginEnv = await readLoginShellEnvironment({ spawn, env, platform });
    } catch (error) {
      environmentWarning = error instanceof Error ? error.message : String(error);
    }
  }
  const environment = buildEnvironment(env, loginEnv);
  const executablePath = await resolveExecutable({
    fsModule,
    executableNames,
    additionalCandidates,
    pathValue: loginEnv.PATH || env.PATH || "",
    homedir,
    platform,
    validateCandidate,
    searchPath,
  });
  if (!executablePath) {
    return {
      status: "not-installed",
      version: null,
      minimumVersion,
      executablePath: null,
      environment,
      message: `${label} was not found. Install it, complete its setup in a terminal, then refresh.`,
      ...(environmentWarning ? { diagnostic: environmentWarning } : {}),
    };
  }
  try {
    const result = await runBounded(spawn, executablePath, ["--version"], {
      env: environment,
      timeoutMs: VERSION_TIMEOUT_MS,
      maxBytes: MAX_DISCOVERY_OUTPUT,
      label,
    });
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (result.code !== 0 || !version) {
      return {
        status: "unsupported-version",
        version,
        minimumVersion,
        executablePath,
        environment,
        message: `The installed ${label} version could not be verified. Update it and refresh.`,
      };
    }
    if (minimumVersion && compareVersions(version, minimumVersion) < 0) {
      return {
        status: "unsupported-version",
        version,
        minimumVersion,
        executablePath,
        environment,
        message: `${label} ${version} is older than the tested baseline ${minimumVersion}.`,
      };
    }
    return {
      status: "ready",
      version,
      minimumVersion,
      executablePath,
      environment,
      message: environmentWarning
        ? `${label} is ready. The login-shell environment could not be loaded, so fallback paths were used.`
        : `${label} is ready.`,
      ...(environmentWarning ? { diagnostic: environmentWarning } : {}),
    };
  } catch (error) {
    return {
      status: "error",
      version: null,
      minimumVersion,
      executablePath,
      environment,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function resolveExecutable({
  fsModule = fs,
  executableNames,
  additionalCandidates = [],
  pathValue,
  homedir,
  platform,
  validateCandidate,
  searchPath = true,
}) {
  const separator = platform === "win32" ? ";" : ":";
  const names = Array.isArray(executableNames) ? executableNames : [executableNames];
  const candidates = new Set(additionalCandidates.filter(Boolean).map((candidate) => path.resolve(candidate)));
  if (searchPath) {
    for (const directory of String(pathValue).split(separator).filter(Boolean)) {
      for (const name of names) candidates.add(path.resolve(directory, name));
    }
    for (const directory of [
      path.join(homedir, ".local", "bin"),
      path.join(homedir, ".npm-global", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
    ]) {
      for (const name of names) candidates.add(path.join(directory, name));
    }
  }
  for (const candidate of candidates) {
    try {
      await fsModule.promises.access(candidate, fsModule.constants.X_OK);
      const resolvedPath = await fsModule.promises.realpath(candidate);
      if (validateCandidate && !await validateCandidate({ candidate, resolvedPath })) continue;
      return resolvedPath;
    } catch {
      // Continue through the bounded set of explicit and PATH-derived candidates.
    }
  }
  return null;
}

export function runBounded(spawn, file, args, {
  env,
  timeoutMs,
  maxBytes,
  label = "Agent executable",
}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, {
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let totalBytes = 0;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const append = (target, chunk) => {
      const text = String(chunk);
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > maxBytes) {
        child.kill();
        finish(() => reject(new Error(`${label} discovery output exceeded the safety limit.`)));
        return target;
      }
      return target + text;
    };
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code, signal) => finish(() => resolve({ stdout, stderr, code, signal })));
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`${label} discovery timed out.`)));
    }, timeoutMs);
    timer.unref?.();
  });
}

export function buildAgentEnvironment(baseEnv, loginEnv) {
  return {
    ...baseEnv,
    ...loginEnv,
    TERM: "dumb",
    PUPPYONE_AGENT: "1",
  };
}

export function parseSemanticVersion(value, prefixPattern = "") {
  const prefix = prefixPattern ? `(?:${prefixPattern}\\s+)?` : "";
  const match = String(value).match(new RegExp(`${prefix}(\\d+\\.\\d+\\.\\d+)`, "i"));
  return match?.[1] ?? null;
}

export function compareVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export const executableDiscoveryLimits = Object.freeze({
  loginEnvironmentTimeoutMs: LOGIN_ENV_TIMEOUT_MS,
  versionTimeoutMs: VERSION_TIMEOUT_MS,
  maxDiscoveryOutput: MAX_DISCOVERY_OUTPUT,
});
