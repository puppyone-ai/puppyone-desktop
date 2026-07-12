const SAFE_SOURCES = new Set([
  "configured", "user-installation", "system-installation", "path-installation", "application-bundle",
]);

export function deriveLocalConnection(probe, gates = {}) {
  const installation = normalizeInstallation(probe?.installation);
  const authentication = normalizeAuthentication(probe?.authentication);
  const version = safeVersion(probe?.version);
  const ready = installation === "detected"
    && authentication === "signed-in"
    && probe?.protocolCompatible === true
    && gates.bridgeAuthorized === true
    && gates.bridgeCompatible === true
    && gates.hasTextAndToolsModel === true
    && gates.workspaceAllowed === true;
  const integration = ready
    ? "ready"
    : installation === "unsupported"
      ? "incompatible"
      : installation === "broken"
        ? "blocked"
        : installation === "detected"
          ? "bridge-required"
          : "inventory-only";

  return {
    id: normalizeId(probe?.id),
    displayName: safeText(probe?.displayName, "Local Agent", 80),
    installation,
    version,
    authentication,
    integration,
    capabilities: {
      versionProbe: Boolean(version),
      authenticationProbe: authentication !== "unknown",
      protocolProbe: probe?.protocolCompatible === true,
    },
    selectable: integration === "ready",
    statusMessage: statusMessage({
      displayName: probe?.displayName,
      installation,
      authentication,
      version,
      bridgeRequiredMessage: probe?.bridgeRequiredMessage,
    }),
    actions: actionsFor(installation),
    ...(SAFE_SOURCES.has(probe?.source) ? { source: probe.source } : {}),
  };
}

function statusMessage({ displayName, installation, authentication, version, bridgeRequiredMessage }) {
  const label = safeText(displayName, "Local Agent", 80);
  const suffix = version ? ` ${version}` : "";
  if (installation === "not-found") return `${label} was not found in known installation locations.`;
  if (installation === "unsupported") return `${label}${suffix} is older than the tested compatibility baseline.`;
  if (installation === "broken") return `${label} was detected, but its version or status probe could not be completed safely.`;
  if (authentication === "signed-out") return `${label}${suffix} is detected but requires sign-in. Refresh after signing in with its documented CLI flow.`;
  if (authentication === "expired") return `${label}${suffix} is detected, but its local session has expired.`;
  if (authentication === "error") return `${label}${suffix} is detected, but its authentication state could not be read.`;
  const bridgeMessage = safeText(
    bridgeRequiredMessage,
    "No authorized OpenCode provider bridge is available.",
    256,
  );
  return `${label}${suffix} is detected${authentication === "signed-in" ? " and signed in" : ""}. ${bridgeMessage}`;
}

function actionsFor(installation) {
  if (installation === "not-found") return [{ id: "learn-more", label: "Learn more" }];
  return [
    { id: "refresh", label: "Refresh" },
    { id: "learn-more", label: "Learn why" },
  ];
}

function normalizeInstallation(value) {
  return ["not-found", "detected", "unsupported", "broken"].includes(value) ? value : "broken";
}

function normalizeAuthentication(value) {
  return ["unknown", "signed-out", "signed-in", "expired", "error"].includes(value) ? value : "unknown";
}

function normalizeId(value) {
  const normalized = String(value || "local-agent").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized) ? normalized : "local-agent";
}

function safeVersion(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= 80 && /^[A-Za-z0-9._+-]+$/.test(normalized) ? normalized : null;
}

function safeText(value, fallback, limit) {
  const normalized = typeof value === "string" ? value.replace(/[\r\n\0]+/g, " ").trim() : "";
  return (normalized || fallback).slice(0, limit);
}
