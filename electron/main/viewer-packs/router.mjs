/**
 * Deterministic Viewer Pack router (main-process mirror of shared-ui rules).
 */

export function resolveViewerPackRoute({
  name,
  mimeType = null,
  sourceKind,
  coreViewerCapability,
  snapshot,
  preferredPluginId = null,
}) {
  if (coreViewerCapability !== "placeholder") {
    return { kind: "core", capability: coreViewerCapability };
  }

  if (sourceKind !== "local") {
    return { kind: "unsupported", reason: "cloud-source" };
  }

  const contributions = snapshot?.contributions ?? [];
  const matches = contributions.filter((contribution) =>
    contribution.enabled && contributionMatches(contribution, name, mimeType),
  );

  if (matches.length === 0) {
    return { kind: "unsupported", reason: "no-match" };
  }

  if (preferredPluginId) {
    const preferred = matches.find((item) => item.pluginId === preferredPluginId);
    if (preferred) return toPluginResult(preferred);
  }

  if (matches.length === 1) return toPluginResult(matches[0]);
  return { kind: "chooser", candidates: matches };
}

function contributionMatches(contribution, name, mimeType) {
  const extension = getExtension(name);
  const mime = (mimeType ?? "").toLowerCase();
  return contribution.formats.some((format) => {
    const extensionHit = extension && format.extensions.includes(extension);
    const mimeHit = mime && format.mimeTypes.includes(mime);
    return Boolean(extensionHit || mimeHit);
  });
}

function getExtension(name) {
  const lower = String(name || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function toPluginResult(contribution) {
  return {
    kind: "plugin",
    pluginId: contribution.pluginId,
    version: contribution.version,
    contentHash: contribution.contentHash,
    entry: contribution.viewer.entry,
    contribution,
  };
}
