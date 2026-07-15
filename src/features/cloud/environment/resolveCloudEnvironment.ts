import { desktopCloudApiBaseUrlFromRemote } from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import { getCanonicalPuppyoneRemote } from "../../source-control/remotes";
import { normalizeCloudApiBaseUrl } from "../../../../shared/cloudEndpoint.js";

export type CloudEnvironmentSource = "remote" | "default";

export type CloudEnvironment = {
  apiBaseUrl: string | null;
  source: CloudEnvironmentSource;
  cloudRemote: ReturnType<typeof getCanonicalPuppyoneRemote>;
};

export function resolveCloudEnvironment({
  status,
  desktopApiBaseUrl,
}: {
  status: GitStatusSnapshot | null;
  desktopApiBaseUrl?: string | null;
}): CloudEnvironment {
  const cloudRemote = getCanonicalPuppyoneRemote(status);
  const remoteApiBaseUrl = desktopCloudApiBaseUrlFromRemote(cloudRemote?.rawUrl ?? null);
  const configuredDesktopApiBaseUrl = normalizeCloudApiBaseUrl(desktopApiBaseUrl);
  // Local desktop development owns its API + web pair. A production Git remote
  // must not silently redirect account sign-in away from that local stack.
  const apiBaseUrl = isLoopbackApiBase(configuredDesktopApiBaseUrl)
    ? configuredDesktopApiBaseUrl
    : remoteApiBaseUrl ?? configuredDesktopApiBaseUrl;
  return {
    apiBaseUrl,
    source: cloudRemote ? "remote" : "default",
    cloudRemote,
  };
}

function isLoopbackApiBase(apiBaseUrl: string | null): boolean {
  if (!apiBaseUrl) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(apiBaseUrl).hostname);
  } catch {
    return false;
  }
}
