import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { redactSecretText } from "./agent-events.mjs";

// This is the oldest app-server schema exercised by the checked-in protocol
// fixtures and the opt-in local smoke test. Lower versions may be compatible,
// but the experimental surface must not claim unverified support.
export const MIN_SUPPORTED_CODEX_VERSION = "0.144.1";
const LOGIN_ENV_TIMEOUT_MS = 4_000;
const VERSION_TIMEOUT_MS = 4_000;
const MAX_DISCOVERY_OUTPUT = 64 * 1024;

export function createCodexDiscovery({
  fsModule = fs,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
} = {}) {
  let cached = null;

  async function discover({ refresh = false } = {}) {
    if (!refresh && cached) return cached;
    cached = await discoverCodexExecutable({ fsModule, spawn, env, platform, homedir });
    return cached;
  }

  return { discover };
}

export async function discoverCodexExecutable({
  fsModule = fs,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
} = {}) {
  let loginEnv = {};
  let environmentWarning = null;
  try {
    loginEnv = await readLoginShellEnvironment({ spawn, env, platform });
  } catch (error) {
    environmentWarning = redactSecretText(error instanceof Error ? error.message : String(error));
  }

  const providerEnvironment = buildProviderEnvironment(env, loginEnv);

  const candidate = await resolveExecutable({
    fsModule,
    executableName: platform === "win32" ? "codex.exe" : "codex",
    pathValue: loginEnv.PATH || env.PATH || "",
    homedir,
    platform,
  });
  if (!candidate) {
    return {
      provider: "codex",
      status: "not-installed",
      version: null,
      minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
      executablePath: null,
      environment: providerEnvironment,
      message: "Codex was not found. Install Codex, sign in from a terminal, then refresh.",
      ...(environmentWarning ? { diagnostic: environmentWarning } : {}),
    };
  }

  try {
    const versionResult = await runBounded(spawn, candidate, ["--version"], {
      env: providerEnvironment,
      timeoutMs: VERSION_TIMEOUT_MS,
      maxBytes: MAX_DISCOVERY_OUTPUT,
    });
    const version = parseCodexVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
    if (versionResult.code !== 0 || !version) {
      return {
        provider: "codex",
        status: "unsupported-version",
        version,
        minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
        executablePath: candidate,
        environment: providerEnvironment,
        message: "The installed Codex version could not be verified. Update Codex and refresh.",
      };
    }
    if (compareVersions(version, MIN_SUPPORTED_CODEX_VERSION) < 0) {
      return {
        provider: "codex",
        status: "unsupported-version",
        version,
        minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
        executablePath: candidate,
        environment: providerEnvironment,
        message: `Codex ${version} is older than the tested app-server baseline ${MIN_SUPPORTED_CODEX_VERSION}.`,
      };
    }
    return {
      provider: "codex",
      status: "ready",
      version,
      minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
      executablePath: candidate,
      environment: providerEnvironment,
      message: environmentWarning
        ? "Codex is ready. The login-shell environment could not be loaded, so fallback paths were used."
        : "Codex is ready.",
    };
  } catch (error) {
    return {
      provider: "codex",
      status: "error",
      version: null,
      minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
      executablePath: candidate,
      environment: providerEnvironment,
      message: redactSecretText(error instanceof Error ? error.message : String(error)),
    };
  }
}

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

export function parseCodexVersion(value) {
  const match = String(value).match(/(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+)/i);
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

async function resolveExecutable({ fsModule, executableName, pathValue, homedir, platform }) {
  const separator = platform === "win32" ? ";" : ":";
  const candidates = new Set(
    String(pathValue)
      .split(separator)
      .filter(Boolean)
      .map((directory) => path.resolve(directory, executableName)),
  );
  for (const directory of [
    path.join(homedir, ".local", "bin"),
    path.join(homedir, ".npm-global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ]) {
    candidates.add(path.join(directory, executableName));
  }
  for (const candidate of candidates) {
    try {
      await fsModule.promises.access(candidate, fsModule.constants.X_OK);
      return await fsModule.promises.realpath(candidate);
    } catch {
      // Continue through the bounded allow-list of PATH-derived candidates.
    }
  }
  return null;
}

export function buildProviderEnvironment(baseEnv, loginEnv) {
  return {
    ...baseEnv,
    ...loginEnv,
    TERM: "dumb",
    PUPPYONE_AGENT: "1",
  };
}

function runBounded(spawn, file, args, { env, timeoutMs, maxBytes }) {
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
        finish(() => reject(new Error("Codex discovery output exceeded the safety limit.")));
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
      finish(() => reject(new Error("Codex discovery timed out.")));
    }, timeoutMs);
    timer.unref?.();
  });
}
