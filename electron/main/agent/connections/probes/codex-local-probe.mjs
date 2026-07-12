import os from "node:os";
import { JsonlRpcConnection } from "../../transports/jsonl-rpc-connection.mjs";
import { assertExecutableIdentity } from "./executable-candidates.mjs";
import { createProbeEnvironment, runBoundedProbeCommand } from "./bounded-probe-command.mjs";

export const MIN_LOCAL_CODEX_VERSION = "0.144.1";

export function parseCodexLocalVersion(value) {
  return String(value).match(/(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+)/i)?.[1] ?? null;
}

export async function probeCodexLocal({
  candidate,
  runCommand = runBoundedProbeCommand,
  inspectProtocol = inspectCodexProtocol,
  appVersion = "0.0.0",
  workspaceRoot = os.homedir(),
  env = process.env,
  signal,
} = {}) {
  if (!candidate) return missingCodex();
  try {
    const executablePath = await verifyForRunner(candidate, runCommand);
    const versionResult = await runCommand(
      executablePath,
      [...(candidate.argsPrefix || []), "--version"],
      { env: createProbeEnvironment(env), signal },
    );
    const version = parseCodexLocalVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
    if (versionResult.code !== 0 || !version) return brokenCodex(candidate.source);
    if (compareVersions(version, MIN_LOCAL_CODEX_VERSION) < 0) {
      return {
        ...baseCodex(candidate.source),
        installation: "unsupported",
        version,
      };
    }
    let protocol;
    try {
      const protocolExecutablePath = runCommand === runBoundedProbeCommand
        ? await assertExecutableIdentity(candidate)
        : executablePath;
      protocol = await inspectProtocol({
        candidate: { ...candidate, executablePath: protocolExecutablePath },
        appVersion,
        workspaceRoot,
        env: createProbeEnvironment(env),
        signal,
      });
    } catch {
      protocol = { authentication: "error", protocolCompatible: false, hasModels: false };
    }
    return {
      ...baseCodex(candidate.source),
      installation: "detected",
      version,
      authentication: normalizeAuthentication(protocol.authentication),
      protocolCompatible: protocol.protocolCompatible === true,
      hasModels: protocol.hasModels === true,
    };
  } catch {
    return brokenCodex(candidate.source);
  }
}

export async function inspectCodexProtocol({
  candidate,
  appVersion,
  workspaceRoot,
  env,
  signal,
  spawn,
  connectionFactory = (options) => new JsonlRpcConnection(options),
} = {}) {
  if (signal?.aborted) throw new Error("Codex inventory probe was cancelled.");
  const connection = connectionFactory({
    executablePath: candidate.executablePath,
    args: [...(candidate.argsPrefix || []), "app-server", "--listen", "stdio://"],
    cwd: workspaceRoot || os.homedir(),
    env,
    ...(spawn ? { spawn } : {}),
    maxLineBytes: 256 * 1024,
    maxStderrBytes: 16 * 1024,
    maxPending: 4,
    forceKillTimeoutMs: 250,
  });
  connection.on?.("request", (message) => {
    if (Object.prototype.hasOwnProperty.call(message || {}, "id")) {
      connection.respondError?.(message.id, -32601, "Inventory probes do not accept server requests.");
    }
  });
  const abort = () => connection.dispose?.("Codex inventory probe cancelled.");
  signal?.addEventListener?.("abort", abort, { once: true });
  try {
    if (signal?.aborted) {
      abort();
      throw new Error("Codex inventory probe was cancelled.");
    }
    await connection.request("initialize", {
      clientInfo: {
        name: "puppyone_desktop_inventory",
        title: "PuppyOne Desktop",
        version: String(appVersion || "0.0.0").slice(0, 80),
      },
      capabilities: { experimentalApi: false, requestAttestation: false },
    }, { timeoutMs: 1_500 });
    connection.notify("initialized");
    const [account, models] = await Promise.allSettled([
      connection.request("account/read", { refreshToken: false }, { timeoutMs: 1_500 }),
      connection.request("model/list", { includeHidden: false, limit: 1 }, { timeoutMs: 1_500 }),
    ]);
    return {
      authentication: account.status === "fulfilled"
        ? codexAuthentication(account.value)
        : "error",
      protocolCompatible: true,
      hasModels: models.status === "fulfilled" && Array.isArray(models.value?.data) && models.value.data.length > 0,
    };
  } finally {
    signal?.removeEventListener?.("abort", abort);
    connection.dispose?.("Codex inventory probe complete.");
  }
}

function codexAuthentication(result) {
  if (result?.account && typeof result.account === "object") return "signed-in";
  if (result?.requiresOpenaiAuth === true) return "signed-out";
  return "unknown";
}

function normalizeAuthentication(value) {
  return ["unknown", "signed-out", "signed-in", "expired", "error"].includes(value) ? value : "unknown";
}

function baseCodex(source) {
  return {
    id: "codex",
    displayName: "Codex CLI",
    authentication: "unknown",
    protocolCompatible: false,
    hasModels: false,
    source: normalizeSource(source),
  };
}

function missingCodex() {
  return { ...baseCodex(null), installation: "not-found", version: null };
}

function brokenCodex(source) {
  return { ...baseCodex(source), installation: "broken", version: null, authentication: "error" };
}

function normalizeSource(source) {
  return ["configured", "user-installation", "system-installation", "path-installation", "application-bundle"].includes(source)
    ? source
    : null;
}

async function verifyForRunner(candidate, runCommand) {
  if (runCommand !== runBoundedProbeCommand) return candidate.executablePath;
  return assertExecutableIdentity(candidate);
}

function compareVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}
