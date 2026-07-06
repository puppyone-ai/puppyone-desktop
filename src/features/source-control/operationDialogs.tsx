import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DesktopDialogCloseButton, DesktopDialogRoot } from "../../components/DesktopDialog";
import { DesktopMenuItem, DesktopMenuSection } from "../../components/DesktopMenu";
import type { GitBranchSummary, GitStatusSnapshot } from "../../types/electron";
import { PuppyGitIcon } from "../app-shell/navigation";

export type GitOperationErrorState = {
  operation: string;
  message: string;
  raw: string;
  workspacePath: string | null;
};

export function createGitOperationErrorState(
  error: unknown,
  operation: string,
  workspacePath: string | null,
): GitOperationErrorState {
  const raw = error instanceof Error ? error.message : String(error);
  return {
    operation,
    message: formatGitOperationError(error, operation),
    raw: raw.trim() || "No raw Git output was captured.",
    workspacePath,
  };
}

export function createGitOperationMessageState(
  message: string,
  operation: string,
  workspacePath: string | null,
): GitOperationErrorState {
  return {
    operation,
    message,
    raw: message,
    workspacePath,
  };
}

export function formatGitOperationError(error: unknown, operation: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = cleanGitOperationError(rawMessage);

  if (operation === "checkout") {
    if (/local changes.*overwritten|would be overwritten|commit or stash|commit your changes or stash/i.test(message)) {
      return "Cannot switch branch because local changes would be overwritten. Commit or stash your changes before switching branches.";
    }
    if (/already checked out|already used by worktree/i.test(message)) {
      return "Cannot switch branch because that branch is already checked out in another worktree.";
    }
    if (/pathspec .* did not match|invalid reference|not a commit|cannot find that branch/i.test(message)) {
      return "Cannot find that branch. Fetch remotes and try again.";
    }
    return message ? `Cannot switch branch. ${message}` : "Cannot switch branch.";
  }

  if (operation === "init") {
    return message ? `Cannot initialize repository. ${message}` : "Cannot initialize repository.";
  }

  if (operation === "pull") {
    if (/not possible to fast-forward|diverging branches|diverged|non-fast-forward/i.test(message)) {
      return "Cannot pull or download changes because local commits and the remote branch have diverged. Rebase local commits onto the remote branch, then try again.";
    }
    return message ? `Cannot pull or download remote changes. ${message}` : "Cannot pull or download remote changes.";
  }

  if (operation === "push" || operation === "publish") {
    if (/non-fast-forward|fetch first|rejected/i.test(message)) {
      return "Cannot push or upload because the remote branch has changes that are not local yet. Pull or download remote changes first, then try again.";
    }
    return message ? `Cannot push or upload changes. ${message}` : "Cannot push or upload changes.";
  }

  if (operation === "commit-push") {
    if (/non-fast-forward|fetch first|rejected/i.test(message)) {
      return "Committed locally, but push/upload failed because the remote branch has changes that are not local yet. Pull or download remote changes first, then try again.";
    }
    return message ? `Cannot commit and push/upload changes. ${message}` : "Cannot commit and push/upload changes.";
  }

  if (operation === "cloud-backup") {
    return message ? `Cannot create Puppyone Cloud backup. ${message}` : "Cannot create Puppyone Cloud backup.";
  }

  if (operation === "commit" || operation === "commit-switch") {
    return message ? `Cannot commit changes. ${message}` : "Cannot commit changes.";
  }

  return message || "Git operation failed.";
}

function cleanGitOperationError(value: string): string {
  const withoutIpcPrefix = value
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");
  const withoutOperationPrefix = withoutIpcPrefix
    .replace(/^Unable to checkout branch:\s*/i, "")
    .replace(/^Unable to initialize repository:\s*/i, "")
    .replace(/^Unable to stage changes:\s*/i, "")
    .replace(/^Unable to commit changes:\s*/i, "")
    .replace(/^Unable to pull changes:\s*/i, "")
    .replace(/^Unable to fetch cloud changes:\s*/i, "")
    .replace(/^Unable to pull cloud changes:\s*/i, "")
    .replace(/^Unable to push changes:\s*/i, "")
    .replace(/^Unable to stash changes:\s*/i, "")
    .replace(/^Unable to preview remote change:\s*/i, "")
    .replace(/^Unable to preview committed change:\s*/i, "")
    .replace(/^Unable to read remote file diff:\s*/i, "")
    .replace(/^Unable to read committed file diff:\s*/i, "");
  const lines = withoutOperationPrefix
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Command failed:/i.test(line))
    .filter((line) => !/^git -C\s/i.test(line))
    .filter((line) => !line.includes(" git -C "));

  return lines.join(" ").replace(/^Error:\s*/i, "").trim();
}

export function formatGitPreviewError(error: unknown): string {
  const message = cleanGitOperationError(error instanceof Error ? error.message : String(error));
  if (/no merge base|no common history|do not share a common history/i.test(message)) {
    return "Cannot preview this diff because the local branch and remote branch do not share a common history. Pull with a merge or rebase strategy, then try again.";
  }
  if (/remote branch is not available|branch is not available locally|bad revision|unknown revision|ambiguous argument/i.test(message)) {
    return "Cannot preview this diff because the comparison branch is not available locally. Fetch remote changes and try again.";
  }
  return message || "Cannot preview this diff.";
}

export function isBranchOverwriteError(message: string): boolean {
  return /local changes would be overwritten|would overwrite/i.test(message);
}

export function getGitChangeCount(status: GitStatusSnapshot): number {
  return status.stagedEntries.length + status.unstagedEntries.length + status.untrackedEntries.length;
}

export function BranchSwitchConflictDialog({
  branchName,
  changeCount,
  error,
  loading,
  operationLoading,
  onCancel,
  onStashAndSwitch,
  onCommitAndSwitch,
}: {
  branchName: string;
  changeCount: number;
  error: string | null;
  loading: boolean;
  operationLoading: string | null;
  onCancel: () => void;
  onStashAndSwitch: () => void;
  onCommitAndSwitch: () => void;
}) {
  return (
    <DesktopDialogRoot
      onClose={onCancel}
      dismissOnBackdrop={!loading}
    >
      <section
        className="desktop-dialog-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-switch-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading warning" aria-hidden="true">
              <AlertTriangle size={17} />
            </span>
            <div>
              <h2 id="branch-switch-dialog-title">Switch Branch?</h2>
              <p>Switching to <strong>{branchName}</strong> may overwrite your current changes.</p>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={loading} onClick={onCancel} />
        </header>

        <div className="desktop-dialog-body">
          <div className="desktop-dialog-callout">
            <strong>{changeCount}</strong>
            <span>{changeCount === 1 ? "local change" : "local changes"} in this workspace.</span>
          </div>
          <p className="desktop-dialog-note">Commit them to history, or stash them temporarily before switching.</p>
          {error && <p className="desktop-dialog-error">{error}</p>}
        </div>

        <footer className="desktop-dialog-footer two-action">
          <button className="desktop-dialog-button" type="button" disabled={loading} onClick={onStashAndSwitch}>
            {operationLoading === "stash" ? "Stashing..." : "Stash & Switch"}
          </button>
          <button className="desktop-dialog-button primary" type="button" disabled={loading} onClick={onCommitAndSwitch}>
            {operationLoading === "commit-switch" ? "Committing..." : "Commit & Switch"}
          </button>
        </footer>
      </section>
    </DesktopDialogRoot>
  );
}

export function GitOperationErrorDialog({
  error,
  onClose,
}: {
  error: GitOperationErrorState;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = buildGitFixPrompt(error);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <DesktopDialogRoot onClose={onClose}>
      <section
        className="desktop-dialog-surface desktop-git-error-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="git-operation-error-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading warning" aria-hidden="true">
              <AlertTriangle size={17} />
            </span>
            <div>
              <h2 id="git-operation-error-title">Git Operation Failed</h2>
              <p>Copy the fix prompt into Codex or Claude Code if you want an agent to repair it.</p>
            </div>
          </div>
          <DesktopDialogCloseButton onClick={onClose} />
        </header>

        <div className="desktop-dialog-body">
          <p className="desktop-git-error-dialog-message">{error.message}</p>
          <div className="desktop-git-error-dialog-raw">
            <span>Raw Git output</span>
            <pre>{error.raw}</pre>
          </div>
        </div>

        <footer className="desktop-dialog-footer">
          <button className="desktop-dialog-button" type="button" onClick={() => void copyPrompt()}>
            {copied ? "Copied" : "Copy Prompt"}
          </button>
          <button className="desktop-dialog-button primary" type="button" onClick={onClose}>
            OK
          </button>
        </footer>
      </section>
    </DesktopDialogRoot>
  );
}

function buildGitFixPrompt(error: GitOperationErrorState): string {
  return [
    "I am using Puppyone Desktop and a Git operation failed.",
    "",
    `Operation: ${error.operation}`,
    `Workspace: ${error.workspacePath ?? "Unknown"}`,
    "",
    "User-facing summary:",
    error.message,
    "",
    "Raw Git output:",
    "```text",
    error.raw,
    "```",
    "",
    "Please diagnose the Git state and propose the safest fix. Do not run destructive commands such as reset, clean, or force-push unless you explicitly explain the data-loss risk and ask for confirmation first.",
  ].join("\n");
}

export function BranchMenuGroup({
  title,
  branches,
  operationLoading,
  onCheckout,
  onDone,
}: {
  title: string;
  branches: GitBranchSummary[];
  operationLoading: string | null;
  onCheckout: (branchName: string, remote: boolean) => Promise<boolean>;
  onDone: () => void;
}) {
  if (branches.length === 0) return null;

  return (
    <DesktopMenuSection className="desktop-branch-menu-group" label={title}>
      {branches.map((branch) => (
        <DesktopMenuItem
          key={`${branch.remote ? "remote" : "local"}:${branch.name}`}
          className="desktop-branch-menu-row"
          title={branch.lastCommitMessage ?? branch.name}
          selected={branch.current}
          disabled={Boolean(operationLoading) || branch.current}
          icon={<PuppyGitIcon size={13} />}
          label={branch.name}
          trailing={branch.current ? "current" : undefined}
          onClick={() => {
            void (async () => {
              const checkedOut = await onCheckout(branch.name, branch.remote);
              if (checkedOut) onDone();
            })();
          }}
        />
      ))}
    </DesktopMenuSection>
  );
}
