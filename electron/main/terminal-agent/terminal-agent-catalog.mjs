import path from "node:path";
import { claudeCliCandidates } from "../local-agent-candidates/claude-cli-candidates.mjs";

const DEFAULT_TERMINAL_AGENT_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "codex",
    displayName: "Codex",
    executableNames: Object.freeze(["codex"]),
  }),
  Object.freeze({
    id: "claude",
    displayName: "Claude Code",
    executableNames: Object.freeze(["claude"]),
    candidatePaths: ({ env, homedir, platform }) => claudeCliCandidates({
      env,
      homedir,
      platform,
    }),
  }),
  Object.freeze({
    id: "cursor",
    displayName: "Cursor Agent",
    executableNames: Object.freeze(["cursor-agent", "agent", "cursor agent"]),
    identityPolicy: Object.freeze({
      requiredForInvocations: Object.freeze(["agent"]),
      pathFragments: Object.freeze(["cursor-agent", "/cursor/"]),
      fileMarkers: Object.freeze(["cursor-agent", "cursor_invoked_as"]),
    }),
  }),
  Object.freeze({
    id: "opencode",
    displayName: "OpenCode",
    executableNames: Object.freeze(["opencode"]),
    candidatePaths: ({ homedir }) => [path.join(homedir, ".opencode", "bin", "opencode")],
  }),
  Object.freeze({
    id: "pi",
    displayName: "Pi Agent",
    executableNames: Object.freeze(["pi"]),
    identityPolicy: Object.freeze({
      requiredForInvocations: Object.freeze(["pi"]),
      packageNames: Object.freeze([
        "@earendil-works/pi-coding-agent",
        "@mariozechner/pi-coding-agent",
      ]),
      pathFragments: Object.freeze(["/pi-coding-agent/"]),
      fileMarkers: Object.freeze(["pi_coding_agent", "pi-coding-agent"]),
    }),
  }),
  Object.freeze({
    id: "hermes",
    displayName: "Hermes Agent",
    executableNames: Object.freeze(["hermes"]),
  }),
]);

/** Immutable allowlist shared by advisory discovery and authoritative launch. */
export function createTerminalAgentCatalog(definitions = DEFAULT_TERMINAL_AGENT_DEFINITIONS) {
  const seen = new Set();
  return Object.freeze(Array.from(definitions, (definition) => {
    validateDefinition(definition);
    if (seen.has(definition.id)) {
      throw new Error(`Duplicate Terminal Agent launcher id: ${definition.id}`);
    }
    seen.add(definition.id);
    return Object.freeze({
      id: definition.id,
      displayName: definition.displayName,
      executableNames: Object.freeze([...definition.executableNames]),
      ...(definition.candidatePaths ? { candidatePaths: definition.candidatePaths } : {}),
      ...(definition.identityPolicy
        ? { identityPolicy: freezeIdentityPolicy(definition.identityPolicy) }
        : {}),
    });
  }));
}

function validateDefinition(definition) {
  if (!definition || !/^[a-z][a-z0-9-]{0,39}$/u.test(definition.id)) {
    throw new TypeError("Terminal Agent launcher id is invalid.");
  }
  if (typeof definition.displayName !== "string" || !definition.displayName.trim()) {
    throw new TypeError(`Terminal Agent ${definition.id} requires a display name.`);
  }
  if (!Array.isArray(definition.executableNames) || definition.executableNames.length === 0) {
    throw new TypeError(`Terminal Agent ${definition.id} requires executable candidates.`);
  }
  if (definition.candidatePaths !== undefined && typeof definition.candidatePaths !== "function") {
    throw new TypeError(`Terminal Agent ${definition.id} candidatePaths must be a function.`);
  }
  if (definition.identityPolicy !== undefined) validateIdentityPolicy(definition);
}

function validateIdentityPolicy(definition) {
  const policy = definition.identityPolicy;
  if (!policy || typeof policy !== "object") {
    throw new TypeError(`Terminal Agent ${definition.id} identityPolicy must be an object.`);
  }
  for (const field of [
    "requiredForInvocations",
    "packageNames",
    "pathFragments",
    "fileMarkers",
  ]) {
    const values = policy[field] ?? [];
    if (!Array.isArray(values) || values.length > 8 || values.some((value) => (
      typeof value !== "string" || value.length === 0 || value.length > 160
    ))) {
      throw new TypeError(`Terminal Agent ${definition.id} identityPolicy.${field} is invalid.`);
    }
  }
  const invocationNames = new Set(definition.executableNames.map((entry) => (
    typeof entry === "object" && entry
      ? String(entry.invokedAs || entry.fileName)
      : String(entry)
  )));
  if ((policy.requiredForInvocations ?? []).some((value) => !invocationNames.has(value))) {
    throw new TypeError(
      `Terminal Agent ${definition.id} identityPolicy references an unknown invocation.`,
    );
  }
}

function freezeIdentityPolicy(policy) {
  return Object.freeze({
    requiredForInvocations: Object.freeze([...(policy.requiredForInvocations ?? [])]),
    packageNames: Object.freeze([...(policy.packageNames ?? [])]),
    pathFragments: Object.freeze([...(policy.pathFragments ?? [])]),
    fileMarkers: Object.freeze([...(policy.fileMarkers ?? [])]),
  });
}

export const terminalAgentCatalogDefaults = DEFAULT_TERMINAL_AGENT_DEFINITIONS;
