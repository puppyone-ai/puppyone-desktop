import type { DesktopCloudHistoryChange } from "../../../lib/cloudHistoryApi";
import type { GitCommitChange } from "../../../types/electron";
import type {
  CloudBranchGraphLabel,
  CloudBranchGraphRefMarker,
  CloudBranchGraphRow,
  CloudBranchGraphStats,
} from "./types";

export const CLOUD_GRAPH_COLORS = [
  "#4d9fff",
  "#ff7a1a",
  "#b45cff",
  "#ff4fa3",
  "#ffd21f",
  "#4fd6c2",
  "#6bd46b",
  "#ff5c5c",
];

const CLOUD_REF_MARKER_COLORS = {
  local: "#b45cff",
  remote: "#ff7a1a",
  cloud: "#4fd6c2",
  tag: "#ffd21f",
} satisfies Record<CloudBranchGraphLabel["kind"], string>;

export type RefOnlyGroup = {
  commitId: string;
  message: string;
  messageCode?: CloudBranchGraphRow["messageCode"];
  createdAt: string | null;
  labels: CloudBranchGraphLabel[];
};

export function buildRefOnlyGraphRows(groups: RefOnlyGroup[]): CloudBranchGraphRow[] {
  return groups
    .filter((group) => group.labels.length > 0)
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) || 0 : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) || 0 : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return compareStableText(left.labels[0]?.name ?? "", right.labels[0]?.name ?? "");
    })
    .map((group) => {
      const labels = sortCloudBranchLabels(group.labels);
      const refMarkers = buildGroupedRefMarkers(labels, 0);
      const laneCount = Math.max(1, ...refMarkers.map((marker) => marker.lane + 1));
      return {
        id: `ref:${group.commitId}:${labels.map((label) => label.name).join("|")}`,
        kind: "ref" as const,
        message: group.message,
        messageCode: group.messageCode,
        createdAt: group.createdAt,
        stats: null,
        authorName: shortGraphCommitId(group.commitId),
        authorCode: isGraphCommitId(group.commitId) ? undefined : "ref-only",
        labels,
        prefix: "▣",
        laneCount,
        nodeLane: 0,
        nodeColor: refMarkers[0]?.color ?? CLOUD_REF_MARKER_COLORS.local,
        segments: [],
        refMarkers,
        continuationLines: [],
      };
    });
}

export function buildBranchRefMarkers(
  labels: CloudBranchGraphLabel[],
  graphLaneCount: number,
  nodeLane: number,
): CloudBranchGraphRefMarker[] {
  const markerLabels = labels.filter((label) => !label.current);
  if (markerLabels.length === 0) return [];
  return buildGroupedRefMarkers(markerLabels, Math.max(graphLaneCount, nodeLane + 1));
}

function buildGroupedRefMarkers(
  labels: CloudBranchGraphLabel[],
  firstLane: number,
): CloudBranchGraphRefMarker[] {
  const markerGroups = (["local", "remote", "cloud", "tag"] as const)
    .map((kind) => ({
      kind,
      labels: labels.filter((label) => label.kind === kind),
    }))
    .filter((group) => group.labels.length > 0);

  return markerGroups.map((group, index) => ({
    lane: firstLane + index,
    color: CLOUD_REF_MARKER_COLORS[group.kind],
    label: group.labels.map((label) => label.name).join(", "),
    kind: group.kind,
    count: group.labels.length,
  }));
}

export function sortCloudBranchLabels(
  labels: CloudBranchGraphLabel[],
): CloudBranchGraphLabel[] {
  const kindRank: Record<CloudBranchGraphLabel["kind"], number> = {
    local: 0,
    remote: 1,
    cloud: 2,
    tag: 3,
  };
  return [...labels].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    if (kindRank[left.kind] !== kindRank[right.kind]) {
      return kindRank[left.kind] - kindRank[right.kind];
    }
    return compareStableText(left.name, right.name);
  });
}

export function buildGitCommitStats(changes: GitCommitChange[]): CloudBranchGraphStats {
  return {
    files: changes.length,
    addedFiles: changes.filter((change) => change.status === "added").length,
    deletedFiles: changes.filter((change) => change.status === "deleted").length,
    modifiedFiles: changes.filter((change) => (
      change.status !== "added" && change.status !== "deleted"
    )).length,
    additions: changes.reduce((total, change) => total + (change.additions ?? 0), 0),
    deletions: changes.reduce((total, change) => total + (change.deletions ?? 0), 0),
  };
}

export function buildCloudCommitStats(
  changes: DesktopCloudHistoryChange[],
): CloudBranchGraphStats {
  const isAdded = (change: DesktopCloudHistoryChange) => (
    change.action === "add" || change.op === "added"
  );
  const isDeleted = (change: DesktopCloudHistoryChange) => (
    change.action === "delete" || change.op === "deleted"
  );
  return {
    files: changes.length,
    addedFiles: changes.filter(isAdded).length,
    deletedFiles: changes.filter(isDeleted).length,
    modifiedFiles: changes.filter((change) => !isAdded(change) && !isDeleted(change)).length,
    additions: 0,
    deletions: 0,
  };
}

function shortGraphCommitId(commitId: string): string {
  return isGraphCommitId(commitId) ? commitId.slice(0, 8) : "";
}

function isGraphCommitId(commitId: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(commitId);
}

function compareStableText(left: string, right: string): number {
  const normalizedLeft = left.normalize("NFKC").toLocaleLowerCase("en-US");
  const normalizedRight = right.normalize("NFKC").toLocaleLowerCase("en-US");
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}
