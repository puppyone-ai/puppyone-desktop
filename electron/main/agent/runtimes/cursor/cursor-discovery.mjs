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
    environment: {},
    source: result.source ?? (candidate ? "user-installed" : "missing"),
    compatibility: "protocol-unavailable",
  };
  if (result.installation === "not-found") {
    return { ...base, status: "not-installed", message: "Cursor Agent was not found." };
  }
  if (result.installation !== "detected") {
    return { ...base, status: "error", message: "Cursor Agent was detected but could not be inspected safely." };
  }
  return {
    ...base,
    status: "protocol-unavailable",
    message: "Cursor Agent is installed, but PuppyOne will enable it only after Cursor exposes a stable supported Agent protocol.",
  };
}
