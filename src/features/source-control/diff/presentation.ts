import type { GitStatusSnapshot } from "../../../types/electron";
import type { GitWorkingSelection } from "../types";

export type GitDiffContextTone = "incoming" | "outgoing" | "staged" | "working" | "untracked";

export type GitDiffContextPresentation = {
  label: string;
  detail: string;
  tone: GitDiffContextTone;
};

/**
 * Explains the comparison scope separately from the file's net change kind.
 * "Outgoing" and "Added" answer different questions and must not compete for
 * the same badge: the first names the range, the second names the file result.
 */
export function getGitDiffContextPresentation(
  selection: GitWorkingSelection,
  status: GitStatusSnapshot | null,
): GitDiffContextPresentation {
  if (selection.origin === "committed") {
    const ahead = Math.max(0, status?.sourceControl.remote.ahead ?? 0);
    return {
      label: "OUTGOING",
      detail: `Net changes in ${formatCommitCount(ahead, "local")} relative to ${getComparisonTarget(status)}.`,
      tone: "outgoing",
    };
  }

  if (selection.origin === "remote") {
    const behind = Math.max(0, status?.sourceControl.remote.behind ?? 0);
    return {
      label: "INCOMING",
      detail: `Net changes in ${formatCommitCount(behind, "remote")} from ${getComparisonTarget(status)}.`,
      tone: "incoming",
    };
  }

  if (selection.staged) {
    return {
      label: "STAGED",
      detail: "HEAD → index",
      tone: "staged",
    };
  }

  if (selection.status === "untracked") {
    return {
      label: "UNTRACKED",
      detail: "Not present → working tree",
      tone: "untracked",
    };
  }

  return {
    label: "WORKING TREE",
    detail: "Index → working tree",
    tone: "working",
  };
}

function getComparisonTarget(status: GitStatusSnapshot | null) {
  return status?.sourceControl.remote.target?.ref
    ?? status?.sourceControl.remote.upstream
    ?? "the upstream branch";
}

function formatCommitCount(count: number, qualifier: "local" | "remote") {
  return `${count} ${qualifier} commit${count === 1 ? "" : "s"}`;
}
