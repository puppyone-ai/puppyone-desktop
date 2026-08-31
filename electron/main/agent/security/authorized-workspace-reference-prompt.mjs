import path from "node:path";

const WORKSPACE_REFERENCE_HEADING = "Authorized context files for this turn:";

/**
 * Render authorized, live workspace references as ordinary prompt text.
 *
 * The caller still owns authorization. This helper only preserves the common
 * Claude/Codex delivery contract and refuses to surface paths outside the
 * assigned workspace.
 */
export function formatAuthorizedWorkspaceReferencePrompt(prompt, references, workspaceRoot) {
  const paths = authorizedWorkspaceReferencePaths(references, workspaceRoot);
  return paths.length > 0
    ? `${prompt}\n\n${WORKSPACE_REFERENCE_HEADING}\n${paths.map((filename) => `- ${filename}`).join("\n")}`
    : prompt;
}

export function authorizedWorkspaceReferencePaths(references, workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  return Array.from(new Set((Array.isArray(references) ? references : [])
    .filter((entry) => entry?.kind !== "staged-attachment"
      && !(entry?.inlineMentioned === true && entry?.mentionDelivery === "path"))
    .map((entry) => typeof entry?.path === "string" ? path.resolve(entry.path) : null)
    .filter((filename) => filename && isSameOrInside(root, filename))));
}

function isSameOrInside(root, filename) {
  const relative = path.relative(root, filename);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
