import type { GitBranchGraphSnapshot, GitCommitSummary } from "../../../types/electron";
import {
  buildBranchRefMarkers,
  buildGitCommitStats,
  buildRefOnlyGraphRows,
  CLOUD_GRAPH_COLORS,
  sortCloudBranchLabels,
  type RefOnlyGroup,
} from "./shared";
import type {
  CloudBranchGraphLabel,
  CloudBranchGraphLine,
  CloudBranchGraphRow,
  CloudBranchGraphSegment,
} from "./types";

export function buildLocalGitGraphRows(
  status: GitBranchGraphSnapshot,
  commits: GitCommitSummary[],
): CloudBranchGraphRow[] {
  const commitMap = new Map(commits.map((commit) => [commit.commit_id, commit]));
  const branchLabelsByCommit = new Map<string, CloudBranchGraphLabel[]>();
  const refOnlyGroups = new Map<string, RefOnlyGroup>();

  for (const branch of status.branches) {
    const label = {
      name: branch.name,
      kind: branch.remote ? "remote" as const : "local" as const,
      current: branch.current,
    };
    const branchCommitId = resolveBranchHeadCommitId(
      branch.lastCommitId || (branch.current ? status.headCommitId : null),
      commitMap,
    );
    if (!branchCommitId) {
      const unresolvedCommitId = branch.lastCommitId || `${label.kind}:${branch.name}`;
      const group = refOnlyGroups.get(unresolvedCommitId) ?? {
        commitId: unresolvedCommitId,
        message: branch.lastCommitMessage || "Branch head outside visible history",
        createdAt: branch.lastCommitDate,
        labels: [],
      };
      group.labels.push(label);
      refOnlyGroups.set(unresolvedCommitId, group);
      continue;
    }
    const labels = branchLabelsByCommit.get(branchCommitId) ?? [];
    labels.push(label);
    branchLabelsByCommit.set(branchCommitId, sortCloudBranchLabels(labels));
  }

  const headCommitId = resolveBranchHeadCommitId(status.headCommitId, commitMap);
  if (headCommitId) {
    const labels = branchLabelsByCommit.get(headCommitId) ?? [];
    if (!labels.some((label) => label.current)) {
      labels.push({
        name: status.branch === "detached" ? "detached" : "HEAD",
        kind: "local",
        current: true,
      });
      branchLabelsByCommit.set(headCommitId, sortCloudBranchLabels(labels));
    }
  }

  return [
    ...buildGitTopologyGraphRows(commits, branchLabelsByCommit),
    ...buildRefOnlyGraphRows([...refOnlyGroups.values()]),
  ];
}

function buildGitTopologyGraphRows(
  commits: GitCommitSummary[],
  branchLabelsByCommit: Map<string, CloudBranchGraphLabel[]>,
): CloudBranchGraphRow[] {
  const colorByLane = new Map<number, string>();
  let nextColorIndex = 0;
  const getColor = (lane: number) => {
    const existing = colorByLane.get(lane);
    if (existing) return existing;
    const color = CLOUD_GRAPH_COLORS[nextColorIndex++ % CLOUD_GRAPH_COLORS.length];
    colorByLane.set(lane, color);
    return color;
  };

  return commits.map((commit) => {
    const labels = sortCloudBranchLabels(branchLabelsByCommit.get(commit.commit_id) ?? []);
    const graphPrefix = commit.graph_prefix || "*";
    const graphLine = buildGitGraphLine(graphPrefix, getColor);
    const nodeLane = findGitGraphNodeLane(graphPrefix);
    const nodeColor = getColor(nodeLane);
    const refMarkers = buildBranchRefMarkers(labels, graphLine.laneCount, nodeLane);
    const refSegments: CloudBranchGraphSegment[] = refMarkers.map((marker) => ({
      fromLane: nodeLane,
      toLane: marker.lane,
      color: marker.color,
      from: "middle",
      to: "middle",
      kind: "lane",
    }));
    const continuationLines = (commit.graph_continuation_prefixes ?? [])
      .map((prefix) => buildGitGraphLine(prefix, getColor))
      .filter((line) => line.laneCount > 0 || line.segments.length > 0);
    const laneCount = Math.max(
      graphLine.laneCount,
      nodeLane + 1,
      ...refMarkers.map((marker) => marker.lane + 1),
      ...continuationLines.map((line) => line.laneCount),
      1,
    );

    return {
      id: commit.commit_id,
      kind: "commit" as const,
      message: commit.message || "Update workspace",
      createdAt: commit.created_at,
      stats: buildGitCommitStats(commit.changes),
      authorName: commit.author_name || "Unknown",
      labels,
      prefix: graphLine.prefix,
      laneCount,
      nodeLane,
      nodeColor,
      segments: [...graphLine.segments, ...refSegments],
      refMarkers,
      continuationLines,
    };
  });
}

export function hasStructuralGitPrefix(prefix: string): boolean {
  return /[|/\\_]/.test(prefix);
}

type GitGraphColorResolver = (lane: number) => string;

function buildGitGraphLine(
  prefix: string,
  getColor: GitGraphColorResolver,
): CloudBranchGraphLine {
  const normalized = prefix.replace(/\s+$/, "") || "*";
  const segments: CloudBranchGraphSegment[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const token = normalized[index];
    const lane = gitGraphTokenLane(index);
    if (token === "|" || token === "*") {
      segments.push({
        fromLane: lane,
        toLane: lane,
        color: getColor(lane),
        from: "top",
        to: "bottom",
        kind: "lane",
      });
      continue;
    }
    if (token === "/" || token === "\\") {
      const { leftLane, rightLane } = gitGraphEdgeLanes(index);
      const fromLane = token === "/" ? rightLane : leftLane;
      const toLane = token === "/" ? leftLane : rightLane;
      segments.push({
        fromLane,
        toLane,
        color: getColor(fromLane),
        from: "top",
        to: "bottom",
        kind: "lane",
      });
      continue;
    }
    if (token === "_" || token === "-") {
      const { leftLane, rightLane } = gitGraphEdgeLanes(index);
      segments.push({
        fromLane: leftLane,
        toLane: rightLane,
        color: getColor(leftLane),
        from: "middle",
        to: "middle",
        kind: "lane",
      });
    }
  }

  const maxSegmentLane = segments.reduce((maxLane, segment) => (
    Math.max(maxLane, segment.fromLane, segment.toLane)
  ), 0);
  const maxTokenLane = [...normalized].reduce((maxLane, token, index) => (
    token === " " ? maxLane : Math.max(maxLane, gitGraphTokenLane(index))
  ), 0);
  return {
    prefix: normalized,
    laneCount: Math.max(maxSegmentLane + 1, maxTokenLane + 1, 1),
    segments,
  };
}

function findGitGraphNodeLane(prefix: string): number {
  const nodeLane = prefix.indexOf("*");
  if (nodeLane >= 0) return gitGraphTokenLane(nodeLane);
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] && prefix[index] !== " ") return gitGraphTokenLane(index);
  }
  return 0;
}

function gitGraphTokenLane(index: number): number {
  return Math.max(0, Math.floor(index / 2));
}

function gitGraphEdgeLanes(index: number): { leftLane: number; rightLane: number } {
  const leftLane = Math.max(0, Math.floor((index - 1) / 2));
  const rightLane = Math.max(leftLane + 1, Math.floor((index + 1) / 2));
  return { leftLane, rightLane };
}

function resolveBranchHeadCommitId(
  branchCommitId: string | null,
  commitMap: Map<string, unknown>,
): string | null {
  if (!branchCommitId) return null;
  if (commitMap.has(branchCommitId)) return branchCommitId;
  return [...commitMap.keys()].find((commitId) => commitId.startsWith(branchCommitId)) ?? null;
}
