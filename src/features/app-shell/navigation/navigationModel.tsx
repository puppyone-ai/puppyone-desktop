import { Blocks, Clock3, Cloud, Folder, Workflow } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { GitStatusEntry, GitStatusSnapshot } from "../../../types/electron";
import { VersionControlIcon } from "../../source-control";
import type {
  DesktopNavigationAvailability,
  DesktopNavigationItem,
} from "./types";

export function AssetsDistributionIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon="assets-distribution"
    >
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
      <path d="M9.5 14.5 20.5 3.5" />
      <path d="M13.5 3.5h7v7" />
    </svg>
  );
}

const DESKTOP_NAV_ITEMS: readonly DesktopNavigationItem[] = [
  { view: "data", labelId: "shell.navigation.files", icon: Folder },
  { view: "git", labelId: "shell.navigation.changes", icon: VersionControlIcon, iconSize: 18 },
  { view: "plugins", labelId: "shell.navigation.plugins", icon: Blocks },
  { view: "access", labelId: "shell.navigation.assets", icon: AssetsDistributionIcon },
  { view: "automation", labelId: "shell.navigation.automation", icon: Workflow },
] as const;

const CLOUD_HISTORY_ITEM: DesktopNavigationItem = {
  view: "git",
  labelId: "shell.navigation.history",
  icon: Clock3,
};

const CLOUD_HUB_ITEM: DesktopNavigationItem = {
  view: "cloud",
  labelId: "shell.navigation.cloud",
  icon: Cloud,
};

const LOCAL_ITEMS = DESKTOP_NAV_ITEMS.filter(
  (item) => item.view !== "access" && item.view !== "automation",
);
const CLOUD_ITEMS = DESKTOP_NAV_ITEMS.filter(
  (item) => item.view === "access" || item.view === "automation",
);

export function resolveNavigationItems({
  availableSurfaceIds,
  cloudHistoryEnabled = false,
  cloudHubEnabled = false,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
}: DesktopNavigationAvailability) {
  if (availableSurfaceIds) {
    const available = new Set(availableSurfaceIds);
    return {
      localItems: LOCAL_ITEMS
        .filter(({ view }) => available.has(view))
        .map((item) => cloudHistoryEnabled && item.view === "git" ? CLOUD_HISTORY_ITEM : item),
      cloudHubItems: available.has("cloud") ? [CLOUD_HUB_ITEM] : [],
      cloudItems: CLOUD_ITEMS.filter(({ view }) => available.has(view)),
    };
  }

  return {
    localItems: LOCAL_ITEMS
      .filter((item) => (
        (gitEnabled || cloudHistoryEnabled || item.view !== "git")
        && (pluginsEnabled || item.view !== "plugins")
      ))
      .map((item) => cloudHistoryEnabled && item.view === "git" ? CLOUD_HISTORY_ITEM : item),
    cloudHubItems: cloudHubEnabled ? [CLOUD_HUB_ITEM] : [],
    cloudItems: cloudToolsEnabled ? CLOUD_ITEMS : [],
  };
}

export type DesktopNavigationBadge = {
  count: number;
  tone: "remote" | "workspace";
  kind: "remote" | "workspace" | "none";
};

export function getDesktopNavigationBadge(
  view: DesktopView,
  gitIncomingCount: number,
  workspaceChangeCount: number,
): DesktopNavigationBadge {
  if (view !== "git") return { count: 0, tone: "remote", kind: "none" };
  if (workspaceChangeCount > 0) {
    return { count: workspaceChangeCount, tone: "workspace", kind: "workspace" };
  }
  if (gitIncomingCount > 0) {
    return { count: gitIncomingCount, tone: "remote", kind: "remote" };
  }
  return { count: 0, tone: "remote", kind: "none" };
}

export function getDesktopNavigationLabel(
  t: MessageFormatter,
  label: string,
  view: DesktopView,
  badge: DesktopNavigationBadge,
  workspaceChangeCount: number,
) {
  if (view === "data" && workspaceChangeCount > 0) {
    return t("shell.navigation.workspaceChangesDetected", { label });
  }
  if (badge.count <= 0) return label;
  if (badge.kind === "workspace") {
    return t("shell.navigation.workspaceChangeCount", { label, count: badge.count });
  }
  return t("shell.navigation.remoteChangeCount", { label, count: badge.count });
}

export type DesktopGitNavSummary = {
  active: boolean;
  snapshotReady: boolean;
  changeCount: number;
  conflicts: number;
  unstaged: number;
  staged: number;
  committed: number;
  remoteIncoming: number;
  operationActive: boolean;
};

export function getDesktopGitNavSummary(
  status: GitStatusSnapshot | null,
  gitIncomingCount: number,
  operationLoading: string | null,
): DesktopGitNavSummary {
  const summary: DesktopGitNavSummary = {
    active: gitIncomingCount > 0,
    snapshotReady: Boolean(status),
    changeCount: 0,
    conflicts: 0,
    unstaged: 0,
    staged: 0,
    committed: 0,
    remoteIncoming: gitIncomingCount,
    operationActive: Boolean(operationLoading),
  };

  for (const entry of status?.entries ?? []) {
    if (getDesktopGitEntryKind(entry) === "conflict") summary.conflicts += 1;
  }
  summary.unstaged = (status?.unstagedEntries.length ?? 0) + (status?.untrackedEntries.length ?? 0);
  summary.staged = status?.stagedEntries.length ?? 0;
  summary.committed = Math.max(0, status?.sourceControl.remote.ahead ?? 0);
  summary.remoteIncoming = Math.max(summary.remoteIncoming, status?.sourceControl.remote.behind ?? 0);
  summary.active = summary.active
    || summary.unstaged > 0
    || summary.staged > 0
    || summary.committed > 0
    || summary.remoteIncoming > 0
    || summary.conflicts > 0;
  summary.changeCount = summary.unstaged
    + summary.staged
    + summary.committed
    + summary.conflicts
    + summary.remoteIncoming;
  return summary;
}

function getDesktopGitEntryKind(
  entry: GitStatusEntry,
): "added" | "modified" | "deleted" | "renamed" | "conflict" {
  const status = entry.status.toLowerCase();
  if (entry.conflict || status === "conflict") return "conflict";
  if (status === "untracked" || status === "added" || entry.staged === "A" || entry.unstaged === "A") {
    return "added";
  }
  if (status === "deleted" || entry.staged === "D" || entry.unstaged === "D") return "deleted";
  if (status === "renamed" || status === "copied" || entry.staged === "R" || entry.unstaged === "R") {
    return "renamed";
  }
  return "modified";
}
