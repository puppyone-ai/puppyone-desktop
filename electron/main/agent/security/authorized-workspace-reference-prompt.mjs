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
  return Array.from(new Set((Array.isArray(references) ? references : [])
    .filter((entry) => entry?.kind !== "staged-attachment"
      && !(entry?.inlineMentioned === true && entry?.mentionDelivery === "path"))
    .map((entry) => authorizedWorkspaceReferencePath(entry, workspaceRoot))
    .filter(Boolean)));
}

/**
 * Validate one workspace reference independently of how it is rendered in a
 * provider prompt. Inline mentions are intentionally omitted from the prompt
 * appendix, but they still need the same workspace-bound authorization proof.
 */
export function authorizedWorkspaceReferencePath(reference, workspaceRoot) {
  if (typeof workspaceRoot !== "string" || typeof reference?.path !== "string") return null;
  const root = path.resolve(workspaceRoot);
  const filename = path.isAbsolute(reference.path)
    ? path.resolve(reference.path)
    : path.resolve(root, reference.path);
  return isSameOrInside(root, filename) ? filename : null;
}

function isSameOrInside(root, filename) {
  const relative = path.relative(root, filename);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
