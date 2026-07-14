import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import {
  getDesktopGitNavSummary,
  getDesktopNavigationBadge,
  getDesktopNavigationLabel,
  type DesktopGitNavSummary,
} from "./navigationModel";
import type { DesktopNavigationItem, DesktopNavigationRuntime } from "./types";

type NavigationItemsProps = DesktopNavigationRuntime & {
  buttonClassName: string;
  items: readonly DesktopNavigationItem[];
  showLabel?: boolean;
};

export function DesktopNavigationItems({
  activeView,
  buttonClassName,
  items,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  onNavigate,
  showLabel = false,
}: NavigationItemsProps) {
  const { t } = useLocalization();
  return (
    <>
      {items.map((item) => {
        const badge = getDesktopNavigationBadge(item.view, gitIncomingCount, workspaceChangeCount);
        const itemLabel = t(item.labelId);
        const navLabel = getDesktopNavigationLabel(t, itemLabel, item.view, badge, workspaceChangeCount);
        const gitSummary = item.view === "git"
          ? getDesktopGitNavSummary(gitStatus, gitIncomingCount, gitOperationLoading)
          : null;
        return (
          <button
            key={item.view}
            className={[buttonClassName, activeView === item.view ? "active" : ""].filter(Boolean).join(" ")}
            type="button"
            aria-label={navLabel}
            aria-current={activeView === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <i className="desktop-sidebar-nav-icon-wrap" aria-hidden="true">
              <item.icon size={item.iconSize ?? 16} />
            </i>
            {showLabel && <span className="desktop-sidebar-nav-label">{itemLabel}</span>}
            <DesktopNavBadge count={badge.count} tone={badge.tone} />
            {gitSummary && <DesktopGitNavBubble summary={gitSummary} />}
          </button>
        );
      })}
    </>
  );
}

export function DesktopSidebarSettingsButton({
  activeView,
  buttonClassName,
  onOpenSettings,
}: {
  activeView: DesktopView;
  buttonClassName: string;
  onOpenSettings: () => void;
}) {
  const { t } = useLocalization();
  return (
    <button
      className={`${buttonClassName} ${activeView === "settings" ? "active" : ""}`}
      type="button"
      title={t("shell.navigation.settings")}
      aria-label={t("shell.navigation.settings")}
      aria-current={activeView === "settings" ? "page" : undefined}
      onClick={onOpenSettings}
    >
      <Settings size={16} />
    </button>
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

function DesktopGitNavBubble({ summary }: { summary: DesktopGitNavSummary }) {
  const { t } = useLocalization();
  const bubble = useTransientGitNavBubble(summary, t);
  if (!bubble) return null;
  return (
    <span key={bubble.id} className="desktop-sidebar-nav-popover is-visible" role="status">
      {bubble.label}
    </span>
  );
}

const DESKTOP_GIT_NAV_BUBBLE_ENABLED = false;

function useTransientGitNavBubble(summary: DesktopGitNavSummary, t: MessageFormatter) {
  const [bubble, setBubble] = useState<{ id: number; label: string } | null>(null);
  const previousSignatureRef = useRef<string | null>(null);
  const bubbleIdRef = useRef(0);
  const initializedRef = useRef(false);
  const operationActiveRef = useRef(false);
  const signature = getDesktopGitNavSignature(summary);
  const bubbleLabel = getDesktopGitNavBubbleLabel(summary, t);

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
    if (summary.operationActive) return undefined;
    previousSignatureRef.current = signature;
    if (previousSignature === null) return undefined;
    if (!wasOperationActive && (!summary.active || previousSignature === signature)) return undefined;

    bubbleIdRef.current += 1;
    setBubble({ id: bubbleIdRef.current, label: bubbleLabel });
    const timeout = window.setTimeout(() => setBubble(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [bubbleLabel, signature, summary.active, summary.operationActive, summary.snapshotReady]);

  return DESKTOP_GIT_NAV_BUBBLE_ENABLED ? bubble : null;
}

function getDesktopGitNavBubbleLabel(summary: DesktopGitNavSummary, t: MessageFormatter): string {
  const labels: string[] = [];
  if (summary.conflicts > 0) labels.push(t("shell.gitBubble.conflicts"));
  if (summary.remoteIncoming > 0) labels.push(t("shell.gitBubble.incoming"));
  if (summary.committed > 0) labels.push(t("shell.gitBubble.committed"));
  if (summary.staged > 0) labels.push(t("shell.gitBubble.staged"));
  if (summary.unstaged > 0) labels.push(t("shell.gitBubble.unstaged"));
  if (labels.length === 0) return t("shell.gitBubble.changed");
  if (labels.length === 1) return labels[0];
  return t("shell.gitBubble.more", { first: labels[0] });
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
