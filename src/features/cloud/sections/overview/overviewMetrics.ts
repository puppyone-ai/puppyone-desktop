import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import { buildCloudAutomationRows } from "../../../automation/automationDomain";
import {
  buildDesktopCloudAccessRows,
  isCloudAccessNavigationResource,
} from "../access/accessRows";
import { getCloudScopeRows } from "../../utils";

export const CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS = 7;
const DAY_IN_MS = 86_400_000;

/**
 * Derive Overview totals from the same domain rows rendered by Access and
 * Automation. Project-list summary fields can be stale and must not override
 * the detail resources already loaded for this route.
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
  const accessRows = buildDesktopCloudAccessRows({
    scopeRows,
    connectors,
    mcpEndpoints,
    identity,
    apiBaseUrl: null,
  }).filter(isCloudAccessNavigationResource);
  const automationRows = buildCloudAutomationRows({
    scopes: scopeRows,
    connectors,
  });

  return { accessPointCount: accessRows.length, accessRows, automationRows };
}

export function getRecentCloudCommitActivity(
  history: DesktopCloudHistory | null,
  now = Date.now(),
  windowDays = CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS,
) {
  const threshold = now - windowDays * DAY_IN_MS;
  const datedCommits = (history?.commits ?? [])
    .map((commit) => Date.parse(commit.created_at ?? ""))
    .filter(Number.isFinite);
  const count = datedCommits.filter((createdAt) => createdAt >= threshold).length;
  const oldestLoadedCommit = datedCommits.length > 0 ? Math.min(...datedCommits) : null;
  const isLowerBound = Boolean(
    history?.has_more
    && oldestLoadedCommit !== null
    && oldestLoadedCommit >= threshold,
  );
  return { count, isLowerBound, windowDays };
}
