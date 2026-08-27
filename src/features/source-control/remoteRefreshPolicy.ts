import type { GitStatusSnapshot } from "../../types/electron";

export const REMOTE_FETCH_INTERVAL_MS = 180_000;
export const REMOTE_FETCH_FOCUS_STALE_MS = 60_000;
export const REMOTE_FETCH_MIN_GAP_MS = 15_000;

export type RemoteFetchTarget = Readonly<{
  remoteName: string;
  branchName: string | null;
  key: string;
}>;

/**
 * Resolve the one effective sync remote selected by the repository model.
 * This intentionally works for GitHub, PuppyOne Cloud, and generic Git hosts;
 * local-only repositories never trigger network traffic.
 */
export function getRemoteFetchTarget(
  status: GitStatusSnapshot | null,
): RemoteFetchTarget | null {
  const hosting = status?.effectiveHosting;
  if (
    !status?.isRepo
    || !hosting?.ready
    || hosting.kind === "local-only"
    || !hosting.remoteName
  ) {
    return null;
  }
  return {
    remoteName: hosting.remoteName,
    branchName: hosting.branchName,
    key: `${hosting.remoteName}:${hosting.branchName ?? "detached"}`,
  };
}

export function shouldFetchRemote({
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
