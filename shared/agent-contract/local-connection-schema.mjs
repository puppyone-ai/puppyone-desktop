import {
  assertArray,
  assertRecord,
  compact,
  contractError,
  enumValue,
  requiredOpaqueId,
  requiredString,
} from "./validation.mjs";

const INSTALLATION_STATES = Object.freeze(["not-found", "detected", "unsupported", "broken"]);
const AUTHENTICATION_STATES = Object.freeze(["unknown", "signed-out", "signed-in", "expired", "error"]);
const INTEGRATION_STATES = Object.freeze(["inventory-only", "bridge-required", "ready", "incompatible", "blocked"]);
const SOURCES = Object.freeze(["configured", "user-installation", "system-installation", "path-installation", "application-bundle"]);
const ACTIONS = Object.freeze(["refresh", "learn-more"]);

/**
 * Validate and project main-process inventory data onto the public DTO.
 * Returning a new object is intentional: executable paths, raw command output,
 * environment data and future internal fields cannot cross IPC by accident.
 */
export function sanitizeAgentLocalConnectionsSnapshot(value) {
  const snapshot = assertRecord(value, "Local Agent connections snapshot");
  const connections = assertArray(snapshot.connections, "Local Agent connections");
  if (connections.length > 16) throw contractError("connections", "contains too many entries");
  const scannedAt = requiredString(snapshot.scannedAt, "scannedAt", 64);
  if (!Number.isFinite(Date.parse(scannedAt))) throw contractError("scannedAt", "must be an ISO timestamp");
  const warnings = assertArray(snapshot.warnings, "Local Agent warnings");
  if (warnings.length > 16) throw contractError("warnings", "contains too many entries");
  return {
    connections: connections.map(sanitizeConnection),
    scannedAt,
    warnings: warnings.map((warning, index) => requiredString(warning, `warnings[${index}]`, 512)),
  };
}

function sanitizeConnection(value, index) {
  const connection = assertRecord(value, `connections[${index}]`);
  const capabilities = assertRecord(connection.capabilities, `connections[${index}].capabilities`);
  const actions = assertArray(connection.actions, `connections[${index}].actions`);
  if (actions.length > 8) throw contractError(`connections[${index}].actions`, "contains too many entries");
  const version = connection.version === null
    ? null
    : requiredString(connection.version, `connections[${index}].version`, 80);
  return compact({
    id: requiredOpaqueId(connection.id, `connections[${index}].id`),
    displayName: requiredString(connection.displayName, `connections[${index}].displayName`, 80),
    installation: enumValue(connection.installation, `connections[${index}].installation`, INSTALLATION_STATES),
    version,
    authentication: enumValue(connection.authentication, `connections[${index}].authentication`, AUTHENTICATION_STATES),
    integration: enumValue(connection.integration, `connections[${index}].integration`, INTEGRATION_STATES),
    capabilities: {
      versionProbe: requiredBoolean(capabilities.versionProbe, `connections[${index}].capabilities.versionProbe`),
      authenticationProbe: requiredBoolean(capabilities.authenticationProbe, `connections[${index}].capabilities.authenticationProbe`),
      protocolProbe: requiredBoolean(capabilities.protocolProbe, `connections[${index}].capabilities.protocolProbe`),
    },
    selectable: requiredBoolean(connection.selectable, `connections[${index}].selectable`),
    statusMessage: requiredString(connection.statusMessage, `connections[${index}].statusMessage`, 512),
    actions: actions.map((action, actionIndex) => sanitizeAction(action, index, actionIndex)),
    source: connection.source === undefined
      ? undefined
      : enumValue(connection.source, `connections[${index}].source`, SOURCES),
  });
}

function sanitizeAction(value, connectionIndex, actionIndex) {
  const action = assertRecord(value, `connections[${connectionIndex}].actions[${actionIndex}]`);
  return {
    id: enumValue(action.id, `connections[${connectionIndex}].actions[${actionIndex}].id`, ACTIONS),
    label: requiredString(action.label, `connections[${connectionIndex}].actions[${actionIndex}].label`, 80),
  };
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") throw contractError(label, "must be a boolean");
  return value;
}

export const agentLocalConnectionStates = Object.freeze({
  installation: INSTALLATION_STATES,
  authentication: AUTHENTICATION_STATES,
  integration: INTEGRATION_STATES,
  source: SOURCES,
  action: ACTIONS,
});
