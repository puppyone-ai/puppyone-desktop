import { desktopCloudApiBaseUrlFromRemote } from "../../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import { getPuppyoneRemote } from "../../source-control/remotes";
import { normalizeCloudApiBaseUrl } from "../../../../shared/cloudEndpoint.js";

export type CloudEnvironmentSource = "remote" | "config" | "default";

export type CloudEnvironment = {
  apiBaseUrl: string | null;
  source: CloudEnvironmentSource;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  configuredProjectId: string | null;
};

export function resolveCloudEnvironment({
  status,
  puppyoneConfig,
  desktopApiBaseUrl,
}: {
  status: GitStatusSnapshot | null;
  puppyoneConfig?: PuppyoneWorkspaceConfig | null;
  desktopApiBaseUrl?: string | null;
}): CloudEnvironment {
  const cloudRemote = getPuppyoneRemote(status);
  const remoteApiBaseUrl = desktopCloudApiBaseUrlFromRemote(cloudRemote?.rawUrl ?? null);
  const configuredDesktopApiBaseUrl = normalizeCloudApiBaseUrl(desktopApiBaseUrl);
  // Local desktop development owns its API + web pair. A production Git remote
  // must not silently redirect account sign-in away from that local stack.
  const apiBaseUrl = isLoopbackApiBase(configuredDesktopApiBaseUrl)
    ? configuredDesktopApiBaseUrl
    : remoteApiBaseUrl ?? configuredDesktopApiBaseUrl;
  const configuredProjectId = puppyoneConfig?.cloud?.projectId?.trim() || null;

  return {
    apiBaseUrl,
    source: cloudRemote ? "remote" : configuredProjectId ? "config" : "default",
    cloudRemote,
    configuredProjectId,
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
