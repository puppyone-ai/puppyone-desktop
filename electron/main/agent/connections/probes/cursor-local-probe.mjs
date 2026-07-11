import { assertExecutableIdentity } from "./executable-candidates.mjs";
import { createProbeEnvironment, runBoundedProbeCommand } from "./bounded-probe-command.mjs";

export function parseCursorLocalVersion(value) {
  return String(value).match(/\b(\d{4}\.\d{2}\.\d{2}(?:-[A-Za-z0-9._-]+)?|\d+\.\d+\.\d+)\b/)?.[1] ?? null;
}

export function parseCursorAuthentication(value) {
  const status = String(value || "").toLowerCase();
  if (/not authenticated|not logged[ -]?in|signed[ -]?out|login required|please (?:log|sign)[ -]?in/.test(status)) return "signed-out";
  if (/expired|session has expired|credentials? expired/.test(status)) return "expired";
  if (/authenticated|logged[ -]?in|signed[ -]?in/.test(status)) return "signed-in";
  if (/\berror\b|failed|secitemcopymatching|unable to/.test(status)) return "error";
  return "unknown";
}

export async function probeCursorLocal({
  candidate,
  runCommand = runBoundedProbeCommand,
  env = process.env,
  signal,
} = {}) {
  if (!candidate) return missingCursor();
  try {
    const executablePath = runCommand === runBoundedProbeCommand
      ? await assertExecutableIdentity(candidate)
      : candidate.executablePath;
    const probeEnvironment = createProbeEnvironment(env);
    const versionResult = await runCommand(
      executablePath,
      [...(candidate.argsPrefix || []), "--version"],
      { env: probeEnvironment, signal },
    );
    const version = parseCursorLocalVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
    if (versionResult.code !== 0 || !version) return brokenCursor(candidate.source);
    let authentication = "unknown";
    try {
      const statusResult = await runCommand(
        executablePath,
        [...(candidate.argsPrefix || []), "status"],
        { env: probeEnvironment, signal },
      );
      authentication = parseCursorAuthentication(`${statusResult.stdout}\n${statusResult.stderr}`);
      if (statusResult.code !== 0 && authentication === "unknown") authentication = "error";
    } catch {
      authentication = "error";
    }
    return {
      ...baseCursor(candidate.source),
      installation: "detected",
      version,
      authentication,
    };
  } catch {
    return brokenCursor(candidate.source);
  }
}

function baseCursor(source) {
  return {
    id: "cursor-agent",
    displayName: "Cursor Agent",
    authentication: "unknown",
    protocolCompatible: false,
    hasModels: false,
    source: normalizeSource(source),
  };
}

function missingCursor() {
  return { ...baseCursor(null), installation: "not-found", version: null };
}

function brokenCursor(source) {
  return { ...baseCursor(source), installation: "broken", version: null, authentication: "error" };
}

function normalizeSource(source) {
  return ["configured", "user-installation", "system-installation", "path-installation", "application-bundle"].includes(source)
    ? source
    : null;
}
