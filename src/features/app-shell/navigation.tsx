import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { ArrowRightLeft, Blocks, Cloud, Folder, FolderOpen, Settings } from "lucide-react";
import type { DesktopView } from "../../components/DesktopCloudShell";
import type { SidebarNavigationOrientation } from "../../preferences";
import type { GitStatusEntry, GitStatusSnapshot } from "../../types/electron";
import { AutomationGridIcon } from "../automation";
import { AccessChainIcon } from "../cloud/accessFilters";

export type DesktopSidebarIconComponent = (props: { size?: number; className?: string }) => ReactNode;
export type DesktopWorkspaceSurfaceAction = {
  kind: "switch-to-cloud" | "switch-to-local" | "open-locally";
  disabled?: boolean;
  onClick: () => void;
};

export function PuppyGitIcon({
  size = 15,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="5" cy="6" r="3" />
      <path d="M5 9v12" />
      <circle cx="19" cy="18" r="3" />
      <path d="m15 9-3-3 3-3" />
      <path d="M12 6h5a2 2 0 0 1 2 2v7" />
    </svg>
  );
}

export function DesktopSidebarFooterNavigation({
  activeView,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  surfaceAction,
  onNavigate,
  onOpenSettings,
}: {
  activeView: DesktopView;
  cloudToolsEnabled?: boolean;
  gitEnabled?: boolean;
  pluginsEnabled?: boolean;
  gitIncomingCount: number;
  gitOperationLoading: string | null;
  gitStatus: GitStatusSnapshot | null;
  workspaceChangeCount: number;
  surfaceAction?: DesktopWorkspaceSurfaceAction | null;
  onNavigate: (view: DesktopView) => void;
  onOpenSettings: () => void;
}) {
  const localItems = getDesktopLocalSidebarNavItems(gitEnabled, pluginsEnabled);
  const cloudItems = getDesktopCloudSidebarNavItems(cloudToolsEnabled);

  return (
    <div
      className="desktop-sidebar-footer-bar desktop-sidebar-navigation-surface actions-only horizontal"
      data-placement="bottom"
      data-orientation="horizontal"
    >
      <div className="desktop-sidebar-footer-actions desktop-sidebar-footer-actions-left">
        <DesktopSidebarIconNavigation
          activeView={activeView}
          items={localItems}
          gitIncomingCount={gitIncomingCount}
          gitOperationLoading={gitOperationLoading}
          gitStatus={gitStatus}
          workspaceChangeCount={workspaceChangeCount}
          onNavigate={onNavigate}
        />
        {cloudItems.length > 0 && (
          <DesktopSidebarIconNavigation
            activeView={activeView}
            items={cloudItems}
            gitIncomingCount={gitIncomingCount}
            gitOperationLoading={gitOperationLoading}
            gitStatus={gitStatus}
            workspaceChangeCount={workspaceChangeCount}
            onNavigate={onNavigate}
          />
        )}
      </div>
      <div className="desktop-sidebar-footer-actions desktop-sidebar-footer-actions-settings">
        {surfaceAction && <DesktopWorkspaceSurfaceActionButton action={surfaceAction} />}
        <DesktopSidebarSettingsButton
          activeView={activeView}
          buttonClassName="desktop-sidebar-footer-button"
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
}

function DesktopWorkspaceSurfaceActionButton({
  action,
  buttonClassName = "desktop-sidebar-footer-button",
}: {
  action: DesktopWorkspaceSurfaceAction;
  buttonClassName?: string;
}) {
  const config = getDesktopWorkspaceSurfaceActionConfig(action.kind);
  return (
    <button
      className={buttonClassName}
      type="button"
      title={config.title}
      aria-label={config.title}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <span className="desktop-sidebar-surface-switch-icon" aria-hidden="true">
        <ArrowRightLeft size={13} strokeWidth={2} />
        <config.icon size={11} strokeWidth={2} />
      </span>
    </button>
  );
}

function getDesktopWorkspaceSurfaceActionConfig(kind: DesktopWorkspaceSurfaceAction["kind"]) {
  if (kind === "switch-to-cloud") {
    return {
      label: "Cloud",
      title: "Switch to cloud project",
      icon: Cloud,
    };
  }
  if (kind === "switch-to-local") {
    return {
      label: "Local",
      title: "Switch to local workspace",
      icon: Folder,
    };
  }
  return {
    label: "Open local",
    title: "Open locally",
    icon: FolderOpen,
  };
}

export function DesktopSidebarTopNavigation({
  activeView,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
  orientation,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  onNavigate,
  onOpenSettings,
}: {
  activeView: DesktopView;
  cloudToolsEnabled?: boolean;
  gitEnabled?: boolean;
  pluginsEnabled?: boolean;
  orientation: SidebarNavigationOrientation;
  gitIncomingCount: number;
  gitOperationLoading: string | null;
  gitStatus: GitStatusSnapshot | null;
  workspaceChangeCount: number;
  onNavigate: (view: DesktopView) => void;
  onOpenSettings: () => void;
}) {
  const localItems = getDesktopLocalSidebarNavItems(gitEnabled, pluginsEnabled);
  const cloudItems = getDesktopCloudSidebarNavItems(cloudToolsEnabled);
  return (
    <div
      className={`desktop-sidebar-top-navigation desktop-sidebar-navigation-surface ${orientation}`}
      data-placement="top"
      data-orientation={orientation}
    >
      <div className="desktop-sidebar-top-navigation-list" aria-label="Workspace navigation">
        <div className="desktop-sidebar-top-navigation-group desktop-sidebar-top-navigation-local">
          <DesktopSidebarButtonNavigation
            activeView={activeView}
            items={localItems}
            gitIncomingCount={gitIncomingCount}
            gitOperationLoading={gitOperationLoading}
            gitStatus={gitStatus}
            workspaceChangeCount={workspaceChangeCount}
            onNavigate={onNavigate}
          />
          <DesktopSidebarSettingsButton
            activeView={activeView}
            buttonClassName="desktop-sidebar-top-navigation-button"
            onOpenSettings={onOpenSettings}
          />
        </div>
        {cloudItems.length > 0 && (
          <div className="desktop-sidebar-top-navigation-group desktop-sidebar-top-navigation-cloud">
            <DesktopSidebarButtonNavigation
              activeView={activeView}
              items={cloudItems}
              gitIncomingCount={gitIncomingCount}
              gitOperationLoading={gitOperationLoading}
              gitStatus={gitStatus}
              workspaceChangeCount={workspaceChangeCount}
              onNavigate={onNavigate}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopSidebarRailNavigation({
  activeView,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  surfaceAction,
  onNavigate,
  onOpenSettings,
}: {
  activeView: DesktopView;
  cloudToolsEnabled?: boolean;
  gitEnabled?: boolean;
  pluginsEnabled?: boolean;
  gitIncomingCount: number;
  gitOperationLoading: string | null;
  gitStatus: GitStatusSnapshot | null;
  workspaceChangeCount: number;
  surfaceAction?: DesktopWorkspaceSurfaceAction | null;
  onNavigate: (view: DesktopView) => void;
  onOpenSettings: () => void;
}) {
  const localItems = getDesktopLocalSidebarNavItems(gitEnabled, pluginsEnabled);
  const cloudItems = getDesktopCloudSidebarNavItems(cloudToolsEnabled);
  return (
    <div className="desktop-sidebar-rail-navigation" aria-label="Workspace navigation">
      <div className="desktop-sidebar-rail-actions">
        <DesktopSidebarIconNavigation
          activeView={activeView}
          buttonClassName="desktop-sidebar-rail-button"
          items={localItems}
          gitIncomingCount={gitIncomingCount}
          gitOperationLoading={gitOperationLoading}
          gitStatus={gitStatus}
          workspaceChangeCount={workspaceChangeCount}
          onNavigate={onNavigate}
        />
        {cloudItems.length > 0 && (
          <DesktopSidebarIconNavigation
            activeView={activeView}
            buttonClassName="desktop-sidebar-rail-button"
            items={cloudItems}
            gitIncomingCount={gitIncomingCount}
            gitOperationLoading={gitOperationLoading}
            gitStatus={gitStatus}
            workspaceChangeCount={workspaceChangeCount}
            onNavigate={onNavigate}
          />
        )}
      </div>
      <div className="desktop-sidebar-rail-actions desktop-sidebar-rail-actions-end">
        {surfaceAction && <DesktopWorkspaceSurfaceActionButton action={surfaceAction} buttonClassName="desktop-sidebar-rail-button" />}
        <DesktopSidebarSettingsButton
          activeView={activeView}
          buttonClassName="desktop-sidebar-rail-button"
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
}

function DesktopSidebarSettingsButton({
  activeView,
  buttonClassName,
  onOpenSettings,
}: {
  activeView: DesktopView;
  buttonClassName: string;
  onOpenSettings: () => void;
}) {
  return (
    <button
      className={`${buttonClassName} ${activeView === "settings" ? "active" : ""}`}
      type="button"
      title="Settings"
      aria-label="Settings"
      aria-current={activeView === "settings" ? "page" : undefined}
      onClick={onOpenSettings}
    >
      <Settings size={16} />
    </button>
  );
}

function DesktopSidebarButtonNavigation({
  activeView,
  items,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  onNavigate,
}: {
  activeView: DesktopView;
  items: typeof DESKTOP_NAV_ITEMS;
  gitIncomingCount: number;
  gitOperationLoading: string | null;
  gitStatus: GitStatusSnapshot | null;
  workspaceChangeCount: number;
  onNavigate: (view: DesktopView) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const badge = getDesktopNavigationBadge(item.view, gitIncomingCount, workspaceChangeCount);
        const navLabel = getDesktopNavigationLabel(item.label, item.view, badge, workspaceChangeCount);
        const gitSummary = item.view === "git" ? getDesktopGitNavSummary(gitStatus, gitIncomingCount, gitOperationLoading) : null;
        return (
          <button
            key={item.view}
            className={[
              "desktop-sidebar-top-navigation-button",
              activeView === item.view ? "active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label={navLabel}
            aria-current={activeView === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <i className="desktop-sidebar-nav-icon-wrap" aria-hidden="true">
              <item.icon size={item.iconSize ?? 16} />
            </i>
            <span className="desktop-sidebar-nav-label">{item.label}</span>
            <DesktopNavBadge count={badge.count} tone={badge.tone} />
            {gitSummary && <DesktopGitNavBubble summary={gitSummary} />}
          </button>
        );
      })}
    </>
  );
}

function DesktopSidebarIconNavigation({
  activeView,
  buttonClassName = "desktop-sidebar-footer-button",
  items,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  onNavigate,
}: {
  activeView: DesktopView;
  buttonClassName?: string;
  items: typeof DESKTOP_NAV_ITEMS;
  gitIncomingCount: number;
  gitOperationLoading: string | null;
  gitStatus: GitStatusSnapshot | null;
  workspaceChangeCount: number;
  onNavigate: (view: DesktopView) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const badge = getDesktopNavigationBadge(item.view, gitIncomingCount, workspaceChangeCount);
        const navLabel = getDesktopNavigationLabel(item.label, item.view, badge, workspaceChangeCount);
        const gitSummary = item.view === "git" ? getDesktopGitNavSummary(gitStatus, gitIncomingCount, gitOperationLoading) : null;
        return (
          <button
            key={item.view}
            className={[
              buttonClassName,
              activeView === item.view ? "active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label={navLabel}
            aria-current={activeView === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <i className="desktop-sidebar-nav-icon-wrap" aria-hidden="true">
              <item.icon size={item.iconSize ?? 16} />
            </i>
            <DesktopNavBadge count={badge.count} tone={badge.tone} />
            {gitSummary && <DesktopGitNavBubble summary={gitSummary} />}
          </button>
        );
      })}
    </>
  );
}

function DesktopNavBadge({ count, tone }: { count: number; tone: "remote" | "workspace" }) {
  if (count <= 0) return null;
  return (
    <em className={`desktop-sidebar-nav-badge ${tone}`} aria-hidden="true">
      {count > 99 ? "99+" : count}
    </em>
  );
}

type DesktopGitNavSummary = {
  active: boolean;
  snapshotReady: boolean;
  changeCount: number;
  conflicts: number;
  unstaged: number;
  staged: number;
  committed: number;
  remoteIncoming: number;
  operationActive: boolean;
};

function DesktopGitNavBubble({ summary }: { summary: DesktopGitNavSummary }) {
  const bubble = useTransientGitNavBubble(summary);
  if (!bubble) return null;

  return (
    <span key={bubble.id} className="desktop-sidebar-nav-popover is-visible" role="status">
      {bubble.label}
    </span>
  );
}

type DesktopGitNavBubbleState = {
  id: number;
  label: string;
};

const DESKTOP_GIT_NAV_BUBBLE_ENABLED = false;

function useTransientGitNavBubble(summary: DesktopGitNavSummary): DesktopGitNavBubbleState | null {
  const [bubble, setBubble] = useState<DesktopGitNavBubbleState | null>(null);
  const previousSignatureRef = useRef<string | null>(null);
  const bubbleIdRef = useRef(0);
  const initializedRef = useRef(false);
  const operationActiveRef = useRef(false);
  const signature = getDesktopGitNavSignature(summary);

  useEffect(() => {
    if (!DESKTOP_GIT_NAV_BUBBLE_ENABLED) return undefined;

    const previousSignature = previousSignatureRef.current;
    const wasOperationActive = operationActiveRef.current;
    operationActiveRef.current = summary.operationActive;

    if (!initializedRef.current) {
      if (!summary.operationActive && summary.snapshotReady) {
        previousSignatureRef.current = signature;
        initializedRef.current = true;
      }
      return undefined;
    }

    if (summary.operationActive) {
      return undefined;
    }

    previousSignatureRef.current = signature;

    if (previousSignature === null) {
      return undefined;
    }

    if (!wasOperationActive && (!summary.active || previousSignature === signature)) {
      return undefined;
    }

    bubbleIdRef.current += 1;
    setBubble({
      id: bubbleIdRef.current,
      label: getDesktopGitNavBubbleLabel(summary),
    });
    const timeout = window.setTimeout(() => setBubble(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [signature, summary.active, summary.operationActive, summary.snapshotReady]);

  return DESKTOP_GIT_NAV_BUBBLE_ENABLED ? bubble : null;
}

function getDesktopGitNavBubbleLabel(summary: DesktopGitNavSummary): string {
  const labels = getDesktopGitNavBubbleLabels(summary);
  if (labels.length === 0) return "Changed";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} + more`;
}

function getDesktopGitNavBubbleLabels(summary: DesktopGitNavSummary): string[] {
  const labels: string[] = [];
  if (summary.conflicts > 0) labels.push("Conflicts");
  if (summary.remoteIncoming > 0) labels.push("Incoming");
  if (summary.committed > 0) labels.push("Committed");
  if (summary.staged > 0) labels.push("Staged");
  if (summary.unstaged > 0) labels.push("Unstaged");
  return labels;
}

function getDesktopGitNavSignature(summary: DesktopGitNavSummary): string {
  return [
    summary.conflicts,
    summary.unstaged,
    summary.staged,
    summary.committed,
    summary.remoteIncoming,
  ].join(":");
}

function getDesktopGitNavSummary(
  status: GitStatusSnapshot | null,
  gitIncomingCount: number,
  operationLoading: string | null,
): DesktopGitNavSummary {
  const summary: DesktopGitNavSummary = {
    active: Boolean(gitIncomingCount > 0),
    snapshotReady: Boolean(status),
    changeCount: 0,
    conflicts: 0,
    unstaged: 0,
    staged: 0,
    committed: 0,
    remoteIncoming: gitIncomingCount,
    operationActive: Boolean(operationLoading),
  };

  for (const entry of status?.entries ?? []) {
    const kind = getDesktopGitEntryKind(entry);
    if (kind === "conflict") summary.conflicts += 1;
  }
  summary.unstaged = (status?.unstagedEntries.length ?? 0) + (status?.untrackedEntries.length ?? 0);
  summary.staged = status?.stagedEntries.length ?? 0;
  summary.committed = Math.max(0, status?.sourceControl.remote.ahead ?? 0);
  summary.remoteIncoming = Math.max(summary.remoteIncoming, status?.sourceControl.remote.behind ?? 0);

  summary.active = summary.active
    || summary.unstaged > 0
    || summary.staged > 0
    || summary.committed > 0
    || summary.remoteIncoming > 0
    || summary.conflicts > 0;
  summary.changeCount = summary.unstaged + summary.staged + summary.committed + summary.conflicts + summary.remoteIncoming;
  return summary;
}

function getDesktopGitEntryKind(entry: GitStatusEntry): "added" | "modified" | "deleted" | "renamed" | "conflict" {
  const status = entry.status.toLowerCase();
  if (entry.conflict || status === "conflict") return "conflict";
  if (status === "untracked" || status === "added" || entry.staged === "A" || entry.unstaged === "A") return "added";
  if (status === "deleted" || entry.staged === "D" || entry.unstaged === "D") return "deleted";
  if (status === "renamed" || status === "copied" || entry.staged === "R" || entry.unstaged === "R") return "renamed";
  return "modified";
}

type DesktopNavigationBadge = {
  count: number;
  tone: "remote" | "workspace";
  kind: "remote" | "workspace" | "none";
};

function getDesktopNavigationBadge(
  view: DesktopView,
  gitIncomingCount: number,
  workspaceChangeCount: number,
): DesktopNavigationBadge {
  if (view !== "git") return { count: 0, tone: "remote", kind: "none" };
  if (workspaceChangeCount > 0) {
    return { count: workspaceChangeCount, tone: "workspace", kind: "workspace" };
  }
  if (gitIncomingCount > 0) {
    return { count: gitIncomingCount, tone: "remote", kind: "remote" };
  }
  return { count: 0, tone: "remote", kind: "none" };
}

function getDesktopNavigationLabel(
  label: string,
  view: DesktopView,
  badge: DesktopNavigationBadge,
  workspaceChangeCount: number,
) {
  if (view === "data" && workspaceChangeCount > 0) return `${label}, workspace changes detected`;
  if (badge.count <= 0) return label;
  if (badge.kind === "workspace") {
    return `${label}, ${badge.count} workspace change${badge.count === 1 ? "" : "s"}`;
  }
  return `${label}, ${badge.count} remote change${badge.count === 1 ? "" : "s"} to pull`;
}

const DESKTOP_NAV_ITEMS = [
  { view: "data", label: "Files", icon: Folder },
  { view: "git", label: "Changes", icon: PuppyGitIcon, iconSize: 15 },
  { view: "plugins", label: "Plugins", icon: Blocks },
  { view: "access", label: "Access", icon: AccessChainIcon },
  { view: "automation", label: "Automation", icon: AutomationGridIcon },
] satisfies Array<{
  view: Extract<DesktopView, "data" | "git" | "plugins" | "access" | "automation">;
  label: string;
  icon: DesktopSidebarIconComponent;
  iconSize?: number;
}>;

const DESKTOP_LOCAL_SIDEBAR_NAV_ITEMS = DESKTOP_NAV_ITEMS.filter((item) => item.view !== "access" && item.view !== "automation");
const DESKTOP_CLOUD_SIDEBAR_NAV_ITEMS = DESKTOP_NAV_ITEMS.filter((item) => item.view === "access" || item.view === "automation");

function getDesktopLocalSidebarNavItems(
  gitEnabled: boolean,
  pluginsEnabled: boolean,
): typeof DESKTOP_LOCAL_SIDEBAR_NAV_ITEMS {
  return DESKTOP_LOCAL_SIDEBAR_NAV_ITEMS.filter((item) => (
    (gitEnabled || item.view !== "git") &&
    (pluginsEnabled || item.view !== "plugins")
  ));
}

function getDesktopCloudSidebarNavItems(cloudToolsEnabled: boolean): typeof DESKTOP_CLOUD_SIDEBAR_NAV_ITEMS {
  return cloudToolsEnabled ? DESKTOP_CLOUD_SIDEBAR_NAV_ITEMS : [];
}
