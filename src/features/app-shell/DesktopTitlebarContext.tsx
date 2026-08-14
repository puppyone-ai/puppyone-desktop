import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { GitBranch } from "lucide-react";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { DesktopMenuItem } from "../../components/DesktopMenu";
import type { GitBranchSummary, GitStatusSnapshot } from "../../types/electron";
import { BranchMenuGroup } from "../source-control/operationDialogs";
import { DesktopTitlebarMenuLayer } from "./DesktopTitlebarMenuLayer";
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
  workspaceSwitcherItems,
  workspaceSwitcherOpen,
  workspaceSwitcherRef,
  onCheckoutBranch,
  onCloseBranchSwitcher,
  onGoHome,
  onOpenFolder,
  onOpenWorkspaceSwitcherItem,
  onToggleBranchSwitcher,
  onToggleWorkspaceSwitcher,
}: DesktopTitlebarContextProps) {
  const { t } = useLocalization();
  const workspaceTitlebarLabel = workspace.name.trim() || workspace.name;
  const branchReady = activeGitStatus?.isRepo === true;
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
        items={workspaceSwitcherItems}
        onOpenFolder={onOpenFolder}
        onOpenItem={onOpenWorkspaceSwitcherItem}
        onGoHome={onGoHome}
        onToggle={onToggleWorkspaceSwitcher}
      />
      <DesktopBranchSwitcher
        compact={compact}
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
  workspaceSwitcherItems: DesktopWorkspaceSwitcherItem[];
  workspaceSwitcherOpen: boolean;
  workspaceSwitcherRef: RefObject<HTMLDivElement>;
  onCheckoutBranch: (branchName: string, remote: boolean) => Promise<boolean>;
  onCloseBranchSwitcher: () => void;
  onGoHome: () => void;
  onOpenFolder: () => void;
  onOpenWorkspaceSwitcherItem: (item: DesktopWorkspaceSwitcherItem) => void;
  onToggleBranchSwitcher: () => void;
  onToggleWorkspaceSwitcher: () => void;
};

function DesktopBranchSwitcher({
  branchLabel,
  compact,
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
  compact: boolean;
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

      <DesktopTitlebarMenuLayer
        anchorRef={refObject}
        className="desktop-branch-menu"
        gap={compact ? 8 : 4}
        open={open && !disabled}
        preferredMaxHeight={440}
      >
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
      </DesktopTitlebarMenuLayer>
    </div>
  );
}
