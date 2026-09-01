const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//;

/**
 * Compatibility adapter for persisted runtime events created before Main
 * normalized harness paths. It never guesses across Workspace Folder roots.
 */
export function resolveAgentWorkspaceProviderPath(
  workspaceRootPath: string,
  candidatePath: string,
): string | null {
  const root = normalizeFilesystemPath(workspaceRootPath);
  const candidate = normalizeFilesystemPath(candidatePath);
  if (!root || !candidate || candidate.includes("://")) return null;

  const windowsStyle = WINDOWS_DRIVE_PATH.test(root) || root.startsWith("//");
  const absolute = candidate.startsWith("/") || WINDOWS_DRIVE_PATH.test(candidate) || candidate.startsWith("//");
  if (!absolute) return normalizeProviderPath(candidate);

  const comparableRoot = windowsStyle ? root.toLocaleLowerCase("en-US") : root;
  const comparableCandidate = windowsStyle ? candidate.toLocaleLowerCase("en-US") : candidate;
  if (comparableCandidate === comparableRoot) return null;
  if (!comparableCandidate.startsWith(`${comparableRoot}/`)) return null;
  return normalizeProviderPath(candidate.slice(root.length + 1));
}

function normalizeFilesystemPath(value: string): string {
  const input = typeof value === "string" ? value.trim().replaceAll("\\", "/") : "";
  if (!input) return "";
  const prefix = WINDOWS_DRIVE_PATH.test(input)
    ? input.slice(0, 3)
    : input.startsWith("//")
      ? "//"
      : input.startsWith("/")
        ? "/"
        : "";
  const body = input.slice(prefix.length);
  const segments: string[] = [];
  for (const segment of body.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return "";
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const normalized = `${prefix}${segments.join("/")}`;
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function normalizeProviderPath(value: string): string | null {
  const segments: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/") || null;
}
