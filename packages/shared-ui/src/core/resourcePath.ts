export type CanonicalResourcePath = string;

/** Canonical comparison form for workspace-relative resource paths. */
export function canonicalizeResourcePath(path: string): CanonicalResourcePath {
  const canonical = path
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
  if (!canonical) throw new TypeError("Resource path must not be empty.");
  return canonical;
}

/** True when candidate is the resource itself or belongs to its subtree. */
export function isSameOrDescendantResourcePath(candidate: string, resource: string): boolean {
  const canonicalCandidate = canonicalizeResourcePath(candidate);
  const canonicalResource = canonicalizeResourcePath(resource);
  return canonicalCandidate === canonicalResource
    || canonicalCandidate.startsWith(`${canonicalResource}/`);
}

/** Rebase one workspace-relative resource path without using substring-only matching. */
export function rebaseResourcePath(
  candidate: string,
  previousResource: string,
  nextResource: string,
): CanonicalResourcePath {
  const canonicalCandidate = canonicalizeResourcePath(candidate);
  const canonicalPrevious = canonicalizeResourcePath(previousResource);
  const canonicalNext = canonicalizeResourcePath(nextResource);
  if (canonicalCandidate === canonicalPrevious) return canonicalNext;
  return canonicalCandidate.startsWith(`${canonicalPrevious}/`)
    ? `${canonicalNext}${canonicalCandidate.slice(canonicalPrevious.length)}`
    : canonicalCandidate;
}
