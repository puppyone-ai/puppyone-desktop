import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { GitBranch } from "lucide-react";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { DesktopMenuItem, DesktopMenuSurface } from "../../components/DesktopMenu";
import type { GitBranchSummary, GitStatusSnapshot } from "../../types/electron";
import { BranchMenuGroup } from "../source-control/operationDialogs";
import {
  DesktopWorkspaceSwitcher,
  type DesktopWorkspaceSwitcherItem,
} from "./DesktopWorkspaceSwitcher";

export function DesktopTitlebarContext({
  activeGitStatus,
  branchSwitcherOpen,
  branchSwitcherRef,
  compact,
  gitStatusLoading,
  gitOperationLoading,
  localBranches,
  remoteBranches,
  workspace,
  workspaceKind,
  workspaceIsCloud,
  workspaceSwitcherItems,
  workspaceSwitcherOpen,
  workspaceSwitcherRef,
  onCheckoutBranch,
  onCloseBranchSwitcher,
  onCreateCloudProject,
  onGoHome,
  onOpenFolder,
  onOpenWorkspaceSwitcherItem,
  onToggleBranchSwitcher,
  onToggleWorkspaceSwitcher,
}: DesktopTitlebarContextProps) {
  const { t } = useLocalization();
  const workspaceTitlebarLabel = workspace.name.trim() || workspace.name;
  const branchReady = !workspaceIsCloud && activeGitStatus?.isRepo === true;
  const branchLabel = branchReady
    ? (activeGitStatus.branch ?? t("shell.branch.detached"))
    : gitStatusLoading
      ? t("shell.branch.loading")
      : t("shell.branch.noGit");
  const branchTitlebarLabel = branchLabel.trim() || branchLabel;

  return (
    <div className="desktop-titlebar-context">
      <DesktopWorkspaceSwitcher
        compact={compact}
        open={workspaceSwitcherOpen}
        refObject={workspaceSwitcherRef}
        titlebarLabel={workspaceTitlebarLabel}
        workspace={workspace}
        workspaceKind={workspaceKind}
        items={workspaceSwitcherItems}
        onOpenFolder={onOpenFolder}
        onCreateCloudProject={onCreateCloudProject}
        onOpenItem={onOpenWorkspaceSwitcherItem}
        onGoHome={onGoHome}
        onToggle={onToggleWorkspaceSwitcher}
      />
      {!workspaceIsCloud && (
        <DesktopBranchSwitcher
          open={branchSwitcherOpen}
          refObject={branchSwitcherRef}
          titlebarLabel={branchTitlebarLabel}
          branchLabel={branchLabel}
          disabled={!branchReady}
          loading={gitStatusLoading}
          localBranches={localBranches}
          remoteBranches={remoteBranches}
          operationLoading={gitOperationLoading}
          onCheckout={onCheckoutBranch}
          onDone={onCloseBranchSwitcher}
          onToggle={onToggleBranchSwitcher}
        />
      )}
    </div>
  );
}

type DesktopTitlebarContextProps = {
  activeGitStatus: GitStatusSnapshot | null;
  branchSwitcherOpen: boolean;
  branchSwitcherRef: RefObject<HTMLDivElement>;
  compact: boolean;
  gitStatusLoading: boolean;
  gitOperationLoading: string | null;
  localBranches: GitBranchSummary[];
  remoteBranches: GitBranchSummary[];
  workspace: Workspace;
  workspaceKind: DesktopWorkspaceSwitcherItem["kind"];
  workspaceIsCloud: boolean;
  workspaceSwitcherItems: DesktopWorkspaceSwitcherItem[];
  workspaceSwitcherOpen: boolean;
  workspaceSwitcherRef: RefObject<HTMLDivElement>;
  onCheckoutBranch: (branchName: string, remote: boolean) => Promise<boolean>;
  onCloseBranchSwitcher: () => void;
  onCreateCloudProject?: () => void | Promise<void>;
  onGoHome: () => void;
  onOpenFolder: () => void;
  onOpenWorkspaceSwitcherItem: (item: DesktopWorkspaceSwitcherItem) => void;
  onToggleBranchSwitcher: () => void;
  onToggleWorkspaceSwitcher: () => void;
};

function DesktopBranchSwitcher({
  branchLabel,
  disabled,
  loading,
  localBranches,
  open,
  operationLoading,
  refObject,
  remoteBranches,
  titlebarLabel,
  onCheckout,
  onDone,
  onToggle,
}: {
  branchLabel: string;
  disabled: boolean;
  loading: boolean;
  localBranches: GitBranchSummary[];
  open: boolean;
  operationLoading: string | null;
  refObject: RefObject<HTMLDivElement>;
  remoteBranches: GitBranchSummary[];
  titlebarLabel: string;
  onCheckout: (branchName: string, remote: boolean) => Promise<boolean>;
  onDone: () => void;
  onToggle: () => void;
}) {
  const { t } = useLocalization();
  const hasBranches = localBranches.length > 0 || remoteBranches.length > 0;

  return (
    <div className="desktop-titlebar-branch-wrap" ref={refObject}>
      <button
        className="desktop-titlebar-branch-button"
        type="button"
        aria-label={t("shell.branch.switch", { branch: bidiIsolate(branchLabel) })}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        title={disabled
          ? branchLabel
          : t("shell.branch.title", { branch: bidiIsolate(branchLabel) })}
        onClick={onToggle}
      >
        <GitBranch size={13} strokeWidth={1.8} aria-hidden="true" />
        <span>{titlebarLabel}</span>
      </button>

      {open && !disabled && (
        <DesktopMenuSurface className="desktop-titlebar-menu desktop-branch-menu">
          {loading ? (
            <DesktopMenuItem
              className="desktop-branch-menu-row"
              disabled
              icon={<GitBranch size={13} strokeWidth={1.8} />}
              label={t("shell.branch.loadingBranches")}
            />
          ) : hasBranches ? (
            <>
              <BranchMenuGroup
                title={t("shell.branch.localBranches")}
                branches={localBranches}
                operationLoading={operationLoading}
                onCheckout={onCheckout}
                onDone={onDone}
              />
              <BranchMenuGroup
                title={t("shell.branch.remoteBranches")}
                branches={remoteBranches}
                operationLoading={operationLoading}
                onCheckout={onCheckout}
                onDone={onDone}
              />
            </>
          ) : (
            <DesktopMenuItem
              className="desktop-branch-menu-row"
              disabled
              icon={<GitBranch size={13} strokeWidth={1.8} />}
              label={t("shell.branch.noBranches")}
            />
          )}
        </DesktopMenuSurface>
      )}
    </div>
  );
}
