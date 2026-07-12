import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { redactSecretText } from "../../agent-events.mjs";
import {
  buildAgentEnvironment,
  discoverExecutable,
} from "../../runtime/executable-discovery.mjs";
import {
  OPENCODE_UPSTREAM,
} from "../opencode-protocol/opencode-manifest.mjs";
import {
  parseOpenCodeVersion,
} from "../opencode-protocol/opencode-version.mjs";
import { OPEN_CODE_HOST_SAFETY_ENVIRONMENT } from "../opencode-protocol/opencode-security-policy.mjs";

export function createUserOpenCodeDiscovery(options = {}) {
  let cached = null;
  return {
    async discover({ refresh = false } = {}) {
      if (!refresh && cached) return cached;
      cached = await discoverUserOpenCodeExecutable(options);
      return cached;
    },
  };
}

export async function discoverUserOpenCodeExecutable({
  fsModule = fs,
  spawn = nodeSpawn,
  env = process.env,
  platform = process.platform,
  homedir = os.homedir(),
  configuredExecutable = null,
} = {}) {
  const result = await discoverExecutable({
    executableNames: [platform === "win32" ? "opencode.exe" : "opencode"],
    additionalCandidates: [
      configuredExecutable,
      path.join(homedir, ".opencode", "bin", platform === "win32" ? "opencode.exe" : "opencode"),
    ].filter(Boolean),
    fsModule,
    spawn,
    env,
    platform,
    homedir,
    parseVersion: parseOpenCodeVersion,
    minimumVersion: OPENCODE_UPSTREAM.protocolFloor,
    label: "OpenCode",
    buildEnvironment: buildUserOpenCodeEnvironment,
  });
  return {
    provider: "opencode-native",
    runtimeId: "opencode-native",
    source: result.executablePath ? "user-installed" : "missing",
    compatibility: result.status === "ready" ? "native-supported" : "unavailable",
    ...result,
    message: redactSecretText(result.message),
    ...(result.diagnostic ? { diagnostic: redactSecretText(result.diagnostic) } : {}),
  };
}

export function buildUserOpenCodeEnvironment(baseEnv, loginEnv, options) {
  const environment = buildAgentEnvironment(baseEnv, loginEnv, options);
  // Preserve the user's explicit OpenCode profile, auth and provider
  // environment. PuppyOne Agent's managed profile exists only in its own
  // child environment, so this independently constructed map never inherits
  // it from that sibling backend.
  environment.OPENCODE_CLIENT = "puppyone-desktop-native";
  environment.PUPPYONE_AGENT_BACKEND = "opencode-native";
  Object.assign(environment, OPEN_CODE_HOST_SAFETY_ENVIRONMENT);
  return environment;
}
