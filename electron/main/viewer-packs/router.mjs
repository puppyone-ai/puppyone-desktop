/**
 * Deterministic Viewer Pack router (main-process mirror of shared-ui rules).
 */

export function resolveViewerPackRoute({
  name,
  mimeType = null,
  sourceKind,
  coreViewerCapability,
  coreViewerId = null,
  snapshot,
  preferredPluginId = null,
}) {
  if (coreViewerCapability !== "placeholder") {
    return { kind: "core", viewerId: coreViewerId, capability: coreViewerCapability };
  }

  if (sourceKind !== "local") {
    return { kind: "unsupported", reason: "cloud-source" };
  }

  const contributions = snapshot?.contributions ?? [];
  const scored = contributions
    .filter((contribution) => contribution.enabled)
    .map((contribution) => ({
      contribution,
      score: contributionMatchScore(contribution, name, mimeType),
    }));
  const bestScore = scored.reduce((best, item) => Math.max(best, item.score), 0);
  const matches = scored
    .filter((item) => item.score > 0 && item.score === bestScore)
    .map((item) => item.contribution)
    .sort((left, right) => left.pluginId.localeCompare(right.pluginId));

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

function contributionMatchScore(contribution, name, mimeType) {
  const extensions = new Set(getExtensions(name));
  const mime = String(mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (!contribution.viewer?.sources?.includes("local")) return 0;
  let score = 0;
  for (const format of contribution.formats) {
    const matchingExtensions = format.extensions
      .map((extension) => String(extension).toLowerCase())
      .filter((extension) => extensions.has(extension));
    const mimeHit = mime && format.mimeTypes.some((candidate) =>
      String(candidate).toLowerCase() === mime,
    );
    if (matchingExtensions.length > 0) {
      score = Math.max(score, 1_000 + Math.max(...matchingExtensions.map((item) => item.length)));
    } else if (mimeHit) {
      score = Math.max(score, 100);
    }
  }
  return score;
}

function getExtensions(name) {
  const base = String(name || "").replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const extensions = [];
  for (let index = base.indexOf("."); index >= 0; index = base.indexOf(".", index + 1)) {
    if (index < base.length - 1) extensions.push(base.slice(index));
  }
  return extensions.sort((left, right) => right.length - left.length);
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
