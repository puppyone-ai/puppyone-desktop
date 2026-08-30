import os from "node:os";
import { probeCursorLocal } from "../../connections/probes/cursor-local-probe.mjs";
import { resolveFirstExecutable } from "../../connections/probes/executable-candidates.mjs";

export function createCursorDiscovery(options = {}) {
  let cached = null;
  return {
    async discover({ refresh = false } = {}) {
      if (!refresh && cached) return cached;
      cached = await discoverCursorBackend(options);
      return cached;
    },
  };
}

export async function discoverCursorBackend({
  env = process.env,
  homedir = os.homedir(),
  platform = process.platform,
  resolveCandidate = () => resolveFirstExecutable({
    names: ["cursor-agent", "agent", "cursor agent"],
    env,
    homedir,
    platform,
  }),
  probe = probeCursorLocal,
} = {}) {
  const candidate = await resolveCandidate();
  const result = await probe({ candidate, env });
  const base = {
    runtimeId: "cursor",
    provider: "cursor",
    version: result.version ?? null,
    minimumVersion: null,
    executablePath: candidate?.executablePath ?? null,
    argsPrefix: candidate?.argsPrefix ?? [],
    environment: {},
    source: result.source ?? (candidate ? "user-installed" : "missing"),
    compatibility: "acp-v1",
  };
  if (result.installation === "not-found") {
    return { ...base, status: "not-installed", message: "Cursor Agent was not found." };
  }
  if (result.installation !== "detected") {
    return { ...base, status: "error", message: "Cursor Agent was detected but could not be inspected safely." };
  }
  if (result.authentication !== "signed-in") {
    return {
      ...base,
      status: "installed-not-authenticated",
      selectable: false,
      message: "Cursor Agent is installed; sign in with Cursor before starting its ACP Agent.",
    };
  }
  return {
    ...base,
    status: "ready",
    selectable: true,
    message: `Cursor Agent ${result.version ?? ""} is ready through ACP.`.trim(),
  };
}
