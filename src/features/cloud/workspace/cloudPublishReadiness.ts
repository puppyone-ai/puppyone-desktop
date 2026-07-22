import type { GitStatusSnapshot } from "../../../types/electron";

export type CloudPublishReadiness =
  | "ready"
  | "repository-required"
  | "commit-required"
  | "branch-required";

type CloudPublishIdentity = Pick<GitStatusSnapshot, "isRepo" | "headCommitId" | "totalCommits" | "branch">;

/** Git may report a detached checkout using any of these renderer values. */
export function isCloudPublishBranchDetached(branch: string | null): boolean {
  if (branch === null) return true;
  const normalized = branch.trim().toLowerCase();
  return normalized === "head" || normalized === "detached" || normalized.length === 0;
}

export function isCloudPublishBranchReady(branch: string | null): branch is string {
  return !isCloudPublishBranchDetached(branch);
}

export function getCloudPublishReadiness(status: CloudPublishIdentity): CloudPublishReadiness {
  if (!status.isRepo) return "repository-required";
  if (!status.headCommitId || status.totalCommits < 1) return "commit-required";
  if (!isCloudPublishBranchReady(status.branch)) return "branch-required";
  return "ready";
}

export function matchesCloudPublishExpectedIdentity(
  status: CloudPublishIdentity,
  expected: { headCommitId: string; branch: string },
): boolean {
  return getCloudPublishReadiness(status) === "ready"
    && status.headCommitId === expected.headCommitId
    && status.branch === expected.branch;
}
