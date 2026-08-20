import type { GitStatusSnapshot } from "../../types/electron";

export const GITHUB_REMOTE_FETCH_INTERVAL_MS = 180_000;
export const GITHUB_REMOTE_FETCH_FOCUS_STALE_MS = 60_000;
export const GITHUB_REMOTE_FETCH_MIN_GAP_MS = 15_000;

export type GitHubRemoteFetchTarget = Readonly<{
  remoteName: string;
  branchName: string | null;
  key: string;
}>;

export function getGitHubRemoteFetchTarget(
  status: GitStatusSnapshot | null,
): GitHubRemoteFetchTarget | null {
  const hosting = status?.effectiveHosting;
  if (!status?.isRepo || hosting?.kind !== "github" || !hosting.ready || !hosting.remoteName) {
    return null;
  }
  return {
    remoteName: hosting.remoteName,
    branchName: hosting.branchName,
    key: `${hosting.remoteName}:${hosting.branchName ?? "detached"}`,
  };
}

export function shouldFetchGitHubRemote({
  focused,
  online,
  now,
  lastAttemptAt,
  minimumGapMs,
}: {
  focused: boolean;
  online: boolean;
  now: number;
  lastAttemptAt: number | null;
  minimumGapMs: number;
}): boolean {
  if (!focused || !online) return false;
  if (lastAttemptAt == null) return true;
  return now - lastAttemptAt >= minimumGapMs;
}
