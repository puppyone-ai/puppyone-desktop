import type { GitRemoteSummary, GitStatusSnapshot } from "../../types/electron";

export type PuppyoneRemoteInfo = {
  kind: "access-point" | "project" | "scope";
  host: string;
  displayId: string;
  projectId?: string;
  scopeId?: string;
  accessKey?: string;
};

const CANONICAL_GIT_ID = "[A-Za-z0-9][A-Za-z0-9_-]{0,199}";
const CANONICAL_SCOPE_REMOTE = new RegExp(
  `^/git/(${CANONICAL_GIT_ID})/scopes/(${CANONICAL_GIT_ID})\\.git$`,
);
const CANONICAL_PROJECT_REMOTE = new RegExp(
  `^/git/(${CANONICAL_GIT_ID})\\.git$`,
);

export function getPuppyoneRemote(status: GitStatusSnapshot | null): {
  remote: GitRemoteSummary;
  rawUrl: string;
  info: PuppyoneRemoteInfo;
} | null {
  for (const remote of status?.remotes ?? []) {
    const rawUrl = remote.fetchUrl ?? remote.pushUrl;
    const info = parsePuppyoneRemote(rawUrl);
    if (info && rawUrl) return { remote, rawUrl, info };
  }

  return null;
}

export function parsePuppyoneRemote(rawUrl: string | null): PuppyoneRemoteInfo | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const isCanonicalTransport = url.protocol === "http:" || url.protocol === "https:";
    const hasUrlCredential = Boolean(url.username || url.password || url.search || url.hash);
    if (!isCanonicalTransport || !url.host || hasUrlCredential) return null;
    const accessPointMatch = url.pathname.match(/^\/git\/ap\/([^/]+)\.git$/);
    const accessKey = accessPointMatch?.[1];
    if (accessPointMatch) {
      return {
        kind: "access-point",
        host: url.host,
        displayId: accessKey ? maskSecret(accessKey) : "access point",
        accessKey,
      };
    }

    const scopeMatch = url.pathname.match(CANONICAL_SCOPE_REMOTE);
    if (scopeMatch) {
      const projectId = scopeMatch[1];
      const scopeId = scopeMatch[2];
      return {
        kind: "scope",
        host: url.host,
        displayId: `${projectId}/${scopeId}`,
        projectId,
        scopeId,
      };
    }

    const projectMatch = url.pathname.match(CANONICAL_PROJECT_REMOTE);
    const projectId = projectMatch?.[1];
    if (projectMatch) {
      return {
        kind: "project",
        host: url.host,
        displayId: projectId ?? "project",
        projectId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeRemoteUrlForCompare(rawUrl: string | null) {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function maskRemoteUrl(rawUrl: string) {
  let masked = rawUrl.replace(/\/git\/ap\/([^/]+)\.git/g, (_match, accessKey: string) => {
    return `/git/ap/${maskSecret(accessKey)}.git`;
  });

  try {
    const url = new URL(masked);
    if (url.password) url.password = "••••";
    if (url.username) url.username = maskSecret(url.username);
    masked = url.toString();
  } catch {
    // Non-URL remotes, such as scp-like SSH remotes, are displayed as-is.
  }

  return masked;
}

export function maskSecret(value: string) {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
