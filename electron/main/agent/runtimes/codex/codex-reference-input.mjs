import {
  authorizedWorkspaceReferencePaths,
  formatAuthorizedWorkspaceReferencePrompt,
} from "../../security/authorized-workspace-reference-prompt.mjs";

export const CODEX_NATIVE_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const CODEX_NATIVE_IMAGE_MIME_TYPE_SET = new Set(CODEX_NATIVE_IMAGE_MIME_TYPES);

export function buildCodexTurnInput(prompt, references = [], workspaceRoot = null) {
  const workspaceReferences = [];
  const nativeImages = [];
  const seen = new Set();
  for (const reference of Array.isArray(references) ? references : []) {
    if (!reference || typeof reference.path !== "string" || reference.path.length === 0) {
      throw new Error("Codex received an invalid reference input.");
    }
    const authorizedReference = authorizeWorkspaceReference(reference, workspaceRoot);
    if (seen.has(authorizedReference.path)) continue;
    seen.add(authorizedReference.path);
    if (isNativeImageReference(authorizedReference)) {
      nativeImages.push({ type: "localImage", path: authorizedReference.path });
      continue;
    }
    if (authorizedReference.kind === "workspace-entry" || (
      authorizedReference.kind === "staged-attachment"
      && authorizedReference.inlineMentioned === true
      && authorizedReference.mentionDelivery === "path"
    )) {
      workspaceReferences.push(authorizedReference);
      continue;
    }
    throw new Error("Codex does not support this reference input type.");
  }
  const text = formatAuthorizedWorkspaceReferencePrompt(prompt, workspaceReferences, workspaceRoot ?? ".");
  return [{ type: "text", text, text_elements: [] }, ...nativeImages];
}

function authorizeWorkspaceReference(reference, workspaceRoot) {
  if (reference.kind !== "workspace-entry") return reference;
  if (typeof workspaceRoot !== "string") {
    throw new Error("Codex workspace references require an assigned workspace root.");
  }
  const [authorizedPath] = authorizedWorkspaceReferencePaths([reference], workspaceRoot);
  if (!authorizedPath) {
    throw new Error("Codex workspace reference is outside the assigned workspace root.");
  }
  return { ...reference, path: authorizedPath };
}

function isNativeImageReference(reference) {
  return (reference.kind === "workspace-entry" || reference.kind === "staged-attachment")
    && CODEX_NATIVE_IMAGE_MIME_TYPE_SET.has(reference.mime);
}
