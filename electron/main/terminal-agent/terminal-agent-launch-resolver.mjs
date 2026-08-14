import os from "node:os";
import path from "node:path";
import {
  assertExecutableIdentity,
} from "../local-executable-resolver.mjs";
import { createTerminalAgentCandidateResolver } from "./terminal-agent-candidate-resolver.mjs";
import { createTerminalAgentCatalog } from "./terminal-agent-catalog.mjs";

const TERMINAL_AGENT_LAUNCHER_IDS = new Set(
  createTerminalAgentCatalog().map(({ id }) => id),
);

/**
 * Authoritative launch-time resolver. Locator snapshots are advisory, so the
 * executable is resolved and identity-checked again for every process start.
 */
export function createTerminalAgentLaunchResolver(options = {}) {
  const {
    catalog = createTerminalAgentCatalog(),
    env = process.env,
    homedir = os.homedir(),
    platform = process.platform,
    assertCandidate = (candidate) => assertExecutableIdentity(candidate),
  } = options;
  const candidateResolver = options.candidateResolver ?? createTerminalAgentCandidateResolver({
    env,
    homedir,
    platform,
  });
  const createResolutionContext = options.createResolutionContext
    ?? (options.resolveCandidate ? async () => Object.freeze({}) : () => candidateResolver.createContext());
  const resolveCandidate = options.resolveCandidate
    ?? ((definition, context) => candidateResolver.resolve(definition, context));
  const definitions = createTerminalAgentCatalog(catalog);
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));

  return async function resolveTerminalAgentLaunch(launcherId) {
    const definition = definitionsById.get(launcherId);
    if (!definition) throw terminalAgentUnavailableError();

    const resolutionContext = await Promise.resolve(createResolutionContext()).catch(() => null);
    if (!resolutionContext) throw terminalAgentUnavailableError();
    const candidate = await resolveCandidate(definition, resolutionContext).catch(() => null);
    if (!isSafeLaunchCandidate(candidate)) throw terminalAgentUnavailableError();
    const executablePath = await assertCandidate(candidate).catch(() => null);
    if (!isSafeAbsolutePath(executablePath)) throw terminalAgentUnavailableError();

    return Object.freeze({
      args: Object.freeze([...(candidate.argsPrefix ?? [])]),
      displayName: definition.displayName,
      executablePath,
      pathEntries: Object.freeze(candidate.launchPathEntry ? [candidate.launchPathEntry] : []),
    });
  };
}

export function isTerminalAgentLauncherId(value) {
  return typeof value === "string"
    && TERMINAL_AGENT_LAUNCHER_IDS.has(value);
}

function isSafeLaunchCandidate(candidate) {
  return isSafeAbsolutePath(candidate?.executablePath)
    && Array.isArray(candidate.argsPrefix ?? [])
    && (candidate.argsPrefix ?? []).length <= 4
    && (candidate.argsPrefix ?? []).every((argument) => (
      typeof argument === "string"
      && argument.length <= 160
      && !/[\r\n\0]/u.test(argument)
    ))
    && (
      candidate.launchPathEntry === undefined
      || isSafeAbsolutePath(candidate.launchPathEntry)
    );
}

function isSafeAbsolutePath(value) {
  return typeof value === "string"
    && path.isAbsolute(value)
    && value.length <= 4_096
    && !/[\r\n\0]/u.test(value);
}

function terminalAgentUnavailableError() {
  return new Error("TERMINAL_AGENT_UNAVAILABLE");
}

export const terminalAgentLauncherPolicy = Object.freeze({
  launcherIds: Object.freeze(createTerminalAgentCatalog().map(({ id }) => id)),
});
