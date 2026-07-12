import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { redactSecretText } from "../../agent-events.mjs";
import {
  buildAgentEnvironment,
  discoverExecutable,
} from "../../runtime/executable-discovery.mjs";

export const CLAUDE_AGENT_SDK_VERSION = "0.3.159";
export const CLAUDE_CODE_TESTED_BASELINE = "2.1.159";

export function createClaudeDiscovery(options = {}) {
  let cached = null;
  return {
    async discover({ refresh = false } = {}) {
      if (!refresh && cached) return cached;
      cached = await discoverClaudeRuntime(options);
      return cached;
    },
  };
}

export async function discoverClaudeRuntime({
  fsModule = fs,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
  tmpdir = os.tmpdir(),
  sdkLoader = () => import("@anthropic-ai/claude-agent-sdk"),
} = {}) {
  try {
    const sdk = await sdkLoader();
    if (typeof sdk?.query !== "function" || typeof sdk?.getSessionMessages !== "function") {
      throw new Error("Claude Agent SDK is incomplete.");
    }
  } catch (error) {
    return {
      runtimeId: "claude",
      provider: "claude",
      status: "error",
      version: null,
      minimumVersion: CLAUDE_CODE_TESTED_BASELINE,
      sdkVersion: CLAUDE_AGENT_SDK_VERSION,
      executablePath: null,
      environment: buildAgentEnvironment(env, {}),
      source: "missing",
      compatibility: "unavailable",
      message: redactSecretText(`Claude Agent SDK is unavailable: ${error instanceof Error ? error.message : String(error)}`),
    };
  }

  let probeDirectory = null;
  let local;
  try {
    local = await discoverExecutable({
      executableNames: [platform === "win32" ? "claude.exe" : "claude"],
      additionalCandidates: [
        path.join(homedir, ".claude", "local", platform === "win32" ? "claude.exe" : "claude"),
      ],
      fsModule,
      spawn,
      env,
      platform,
      homedir,
      parseVersion: parseClaudeVersion,
      minimumVersion: CLAUDE_CODE_TESTED_BASELINE,
      label: "Claude Code",
      buildEnvironment: buildAgentEnvironment,
      buildProbeEnvironment: async (runtimeEnvironment) => {
        probeDirectory = await fsModule.promises.mkdtemp(
          path.join(tmpdir, "puppyone-claude-version-probe-"),
        );
        return {
          ...runtimeEnvironment,
          CLAUDE_CONFIG_DIR: probeDirectory,
        };
      },
    });
  } finally {
    try {
      if (probeDirectory) {
        await fsModule.promises.rm(probeDirectory, { recursive: true, force: true });
      }
    } catch {
      // Probe cleanup is best-effort and must never hide the discovery result.
    }
  }
  const useLocal = local.status === "ready";
  const hasLocalExecutable = Boolean(local.executablePath);
  return {
    runtimeId: "claude",
    provider: "claude",
    ...local,
    status: local.status,
    version: local.version,
    minimumVersion: CLAUDE_CODE_TESTED_BASELINE,
    sdkVersion: CLAUDE_AGENT_SDK_VERSION,
    executablePath: local.executablePath,
    source: hasLocalExecutable ? "user-installed" : "missing",
    compatibility: useLocal ? "native-sdk-local-cli" : "unavailable",
    message: useLocal
      ? `Claude Code ${local.version} is ready through the Claude Agent SDK.`
      : local.status === "not-installed"
        ? "Claude Code was not found. Install the native Claude Code product, configure an API key or supported cloud provider, then refresh."
        : redactSecretText(local.message),
    ...(local.diagnostic ? { diagnostic: redactSecretText(local.diagnostic) } : {}),
  };
}

export function parseClaudeVersion(value) {
  for (const line of String(value).split(/\r?\n/u)) {
    const match = /^(?:claude(?:\s+code)?\s+)?v?(\d+\.\d+\.\d+)(?:\s+\(Claude Code\))?$/iu.exec(line.trim());
    if (match) return match[1];
  }
  return null;
}
