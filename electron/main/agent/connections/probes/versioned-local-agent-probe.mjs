import { assertExecutableIdentity } from "./executable-candidates.mjs";
import { createProbeEnvironment, runBoundedProbeCommand } from "./bounded-probe-command.mjs";

export function parseVersionedLocalAgentVersion(value) {
  return String(value).match(/\b(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?)\b/u)?.[1] ?? null;
}

/** Installation-only probe for terminal-launched Agents without a native integration contract. */
export async function probeVersionedLocalAgent({
  candidate,
  id,
  displayName,
  runCommand = runBoundedProbeCommand,
  env = process.env,
  signal,
} = {}) {
  const base = {
    id,
    displayName,
    authentication: "unknown",
    protocolCompatible: false,
    hasModels: false,
    source: normalizeSource(candidate?.source),
  };
  if (!candidate) return { ...base, installation: "not-found", version: null };
  try {
    const executablePath = runCommand === runBoundedProbeCommand
      ? await assertExecutableIdentity(candidate)
      : candidate.executablePath;
    const result = await runCommand(
      executablePath,
      [...(candidate.argsPrefix || []), "--version"],
      { env: createProbeEnvironment(env), signal, timeoutMs: 4_000 },
    );
    const version = parseVersionedLocalAgentVersion(`${result.stdout}\n${result.stderr}`);
    if (result.code !== 0 || !version) {
      return { ...base, installation: "broken", version: null };
    }
    return { ...base, installation: "detected", version };
  } catch {
    return { ...base, installation: "broken", version: null };
  }
}

function normalizeSource(source) {
  return ["configured", "user-installation", "system-installation", "path-installation", "application-bundle"].includes(source)
    ? source
    : null;
}
