import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudDashboard,
  DesktopCloudTree,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import {
  buildAccessPointRows,
  isAccessPointNavigationResource,
} from "../../access-points/model";
import { getCloudScopeRows, normalizeCloudEntryPath } from "../../utils";

/**
 * Derive Overview totals from the same domain rows rendered by Access.
 * Project-list summary fields can be stale and must not override the detail
 * resources already loaded for this route.
 */
export function getCloudOverviewMetrics({
  scopes,
  connectors,
  mcpEndpoints,
  identity,
}: {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
}) {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const accessRows = buildAccessPointRows({
    scopeRows,
    connectors,
    mcpEndpoints,
    identity,
    apiBaseUrl: null,
  }).filter(isAccessPointNavigationResource);
  return { accessPointCount: accessRows.length, accessRows };
}

export function getLatestCloudUpdateAt(
  projectUpdatedAt: string | null | undefined,
  history: DesktopCloudHistory | null,
) {
  const candidates = [
    projectUpdatedAt,
    ...(history?.commits.map((commit) => commit.created_at) ?? []),
  ].filter((value): value is string => Boolean(value));
  const latest = candidates
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((candidate) => Number.isFinite(candidate.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  return latest?.value ?? null;
}

export function getCloudOverviewRootEntries(tree: DesktopCloudTree | null) {
  const rootPath = normalizeCloudEntryPath(tree?.path ?? "");
  const prefix = rootPath ? `${rootPath}/` : "";
  return (tree?.entries ?? []).filter((entry) => {
    const entryPath = normalizeCloudEntryPath(entry.path);
    const relativePath = prefix && entryPath.startsWith(prefix)
      ? entryPath.slice(prefix.length)
      : entryPath;
    return Boolean(relativePath) && !relativePath.includes("/");
  });
}

export function getCloudOverviewStorageUsage(
  dashboard: DesktopCloudDashboard | null,
  tree: DesktopCloudTree | null,
) {
  const limitBytes = normalizeStorageBytes(dashboard?.nodes.storage_limit_bytes);
  const explicitBytes = dashboard?.nodes.storage_bytes;
  if (typeof explicitBytes === "number" && Number.isFinite(explicitBytes)) {
    const bytes = Math.max(0, explicitBytes);
    return { bytes, limitBytes, percent: getStoragePercent(bytes, limitBytes), isLowerBound: false };
  }

  const fileEntries = (tree?.entries ?? []).filter((entry) => entry.type !== "folder");
  const sizedFileEntries = fileEntries.filter((entry) => (
    typeof entry.size_bytes === "number" && Number.isFinite(entry.size_bytes)
  ));
  if (sizedFileEntries.length === 0) {
    return dashboard?.nodes.files === 0
      ? { bytes: 0, limitBytes, percent: getStoragePercent(0, limitBytes), isLowerBound: false }
      : { bytes: null, limitBytes, percent: null, isLowerBound: false };
  }

  const bytes = sizedFileEntries.reduce((total, entry) => (
    total + Math.max(0, entry.size_bytes ?? 0)
  ), 0);
  const allProjectFilesAreSized = (
    sizedFileEntries.length === fileEntries.length
    && sizedFileEntries.length === dashboard?.nodes.files
  );
  return {
    bytes,
    limitBytes,
    percent: getStoragePercent(bytes, limitBytes),
    isLowerBound: !allProjectFilesAreSized,
  };
}

function normalizeStorageBytes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function getStoragePercent(bytes: number, limitBytes: number | null) {
  if (limitBytes === null) return null;
  return Math.min(100, Math.max(0, (bytes / limitBytes) * 100));
}
