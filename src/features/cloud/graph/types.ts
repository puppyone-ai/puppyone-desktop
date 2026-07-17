export type CloudBranchGraphLabel = {
  name: string;
  nameCode?: "cloud-history";
  kind: "local" | "remote" | "cloud" | "tag";
  current: boolean;
};

export type CloudBranchGraphSegment = {
  fromLane: number;
  toLane: number;
  color: string;
  from: "top" | "middle" | "bottom";
  to: "top" | "middle" | "bottom";
  kind: "lane";
};

export type CloudBranchGraphLine = {
  prefix: string;
  laneCount: number;
  segments: CloudBranchGraphSegment[];
};

export type CloudBranchGraphRefMarker = {
  lane: number;
  color: string;
  label: string;
  kind: CloudBranchGraphLabel["kind"];
  count: number;
};

export type CloudBranchGraphStats = {
  files: number;
  addedFiles: number;
  deletedFiles: number;
  modifiedFiles: number;
  additions: number;
  deletions: number;
};

export type CloudBranchGraphRow = {
  id: string;
  kind: "commit" | "ref";
  prefix: string;
  message: string;
  messageCode?: "update-workspace" | "branch-head-outside-loaded-history" | "branch-head-outside-visible-history";
  createdAt: string | null;
  stats: CloudBranchGraphStats | null;
  authorName: string;
  authorCode?: "cloud" | "unknown" | "ref-only";
  labels: CloudBranchGraphLabel[];
  laneCount: number;
  nodeLane: number;
  nodeColor: string;
  segments: CloudBranchGraphSegment[];
  refMarkers: CloudBranchGraphRefMarker[];
  continuationLines: CloudBranchGraphLine[];
};

export type CloudBranchGraphDiagnostics = {
  source: "git-topology" | "cloud-topology" | "linear-git" | "linear-cloud" | "missing-topology";
  commitCount: number;
  mergeCommitCount: number;
  branchCount: number;
  structuralPrefixCount: number;
  warning: string | null;
  warningCode?: "cloud-ancestry-missing" | "git-topology-missing";
};
