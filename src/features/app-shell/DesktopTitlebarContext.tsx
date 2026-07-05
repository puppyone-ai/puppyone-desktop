import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { GitBranchSummary, GitStatusSnapshot } from "../../types/electron";
import {
  TITLEBAR_BRANCH_LABEL_CHARS,
  TITLEBAR_WORKSPACE_LABEL_CHARS,
  shortenTitlebarLabel,
} from "./preferences";
import {
  DesktopWorkspaceSwitcher,
  type DesktopWorkspaceSwitcherItem,
} from "./DesktopWorkspaceSwitcher";
import { PuppyGitIcon } from "./navigation";
import { BranchMenuGroup } from "../source-control/operationDialogs";

export function DesktopTitlebarContext({
  activeGitStatus,
  branchSwitcherOpen,
  branchSwitcherRef,
  gitOperationLoading,
  gitStatusLoading,
  localBranches,
  onBranchCheckout,
  onBranchMenuDone,
  onBranchToggle,
  onCreateCloudProject,
  onGoHome,
  onOpenFolder,
  onOpenGitView,
  onOpenWorkspaceItem,
  onWorkspaceToggle,
  remoteBranches,
  switcherOpen,
  switcherRef,
  workspace,
  workspaceIsCloud,
  workspaceItems,
}: {
  activeGitStatus: GitStatusSnapshot | null;
  branchSwitcherOpen: boolean;
  branchSwitcherRef: RefObject<HTMLDivElement>;
  gitOperationLoading: string | null;
  gitStatusLoading: boolean;
  localBranches: GitBranchSummary[];
  onBranchCheckout: (branchName: string, remote: boolean) => Promise<boolean>;
  onBranchMenuDone: () => void;
  onBranchToggle: () => void;
  onCreateCloudProject?: () => void;
  onGoHome: () => void;
  onOpenFolder: () => void;
  onOpenGitView: () => void;
  onOpenWorkspaceItem: (item: DesktopWorkspaceSwitcherItem) => void;
  onWorkspaceToggle: () => void;
  remoteBranches: GitBranchSummary[];
  switcherOpen: boolean;
  switcherRef: RefObject<HTMLDivElement>;
  workspace: Workspace;
  workspaceIsCloud: boolean;
  workspaceItems: DesktopWorkspaceSwitcherItem[];
}) {
  const workspaceTitlebarLabel = shortenTitlebarLabel(workspace.name, TITLEBAR_WORKSPACE_LABEL_CHARS);
  const branchReady = !workspaceIsCloud && activeGitStatus?.isRepo === true;
  const branchLabel = branchReady ? (activeGitStatus.branch ?? "detached") : gitStatusLoading ? "Loading" : "No Git";
  const branchTitlebarLabel = shortenTitlebarLabel(branchLabel, TITLEBAR_BRANCH_LABEL_CHARS);
  const branchButtonDisabled = workspaceIsCloud || (gitStatusLoading && !activeGitStatus);

  return (
    <div className="desktop-titlebar-context">
      <DesktopWorkspaceSwitcher
        open={switcherOpen}
        refObject={switcherRef}
        titlebarLabel={workspaceTitlebarLabel}
        workspace={workspace}
        workspaceKind={workspaceIsCloud ? "cloud" : "local"}
        items={workspaceItems}
        onOpenFolder={onOpenFolder}
        onCreateCloudProject={onCreateCloudProject}
        onOpenItem={onOpenWorkspaceItem}
        onGoHome={onGoHome}
        onToggle={onWorkspaceToggle}
      />

      {!workspaceIsCloud && (
        <div className="desktop-titlebar-branch-wrap" ref={branchSwitcherRef}>
          <button
            className="desktop-titlebar-branch-button"
            type="button"
            aria-label={branchReady ? `Switch branch: ${branchLabel}` : "Open Source Control"}
            aria-expanded={branchReady ? branchSwitcherOpen : false}
            title={branchReady ? branchLabel : "Open Source Control"}
            disabled={branchButtonDisabled}
            onClick={() => {
              if (!branchReady) {
                onOpenGitView();
                return;
              }
              onBranchToggle();
            }}
          >
            <PuppyGitIcon size={13} />
            <span>{branchTitlebarLabel}</span>
          </button>

          {branchReady && branchSwitcherOpen && (
            <div className="desktop-branch-menu desktop-titlebar-menu">
              <BranchMenuGroup
                title="Local"
                branches={localBranches}
                operationLoading={gitOperationLoading}
                onCheckout={onBranchCheckout}
                onDone={onBranchMenuDone}
              />
              {remoteBranches.length > 0 && (
                <BranchMenuGroup
                  title="Remote"
                  branches={remoteBranches}
                  operationLoading={gitOperationLoading}
                  onCheckout={onBranchCheckout}
                  onDone={onBranchMenuDone}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
