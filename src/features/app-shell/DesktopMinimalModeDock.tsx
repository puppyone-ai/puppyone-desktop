import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  Blocks,
  Clock3,
  Cloud,
  Folder,
  Maximize2,
  Settings,
  Workflow,
} from "lucide-react";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import type { DesktopView, DesktopWorkspaceKind } from "../../components/DesktopCloudShell";
import { VersionControlIcon } from "../source-control/VersionControlIcon";
import {
  AssetsDistributionIcon,
  type DesktopWorkspaceSurfaceAction,
} from "./navigation";

type DesktopMinimalModeDockProps = {
  activeView: DesktopView;
  cloudHubEnabled: boolean;
  cloudToolsEnabled: boolean;
  contextMenuOpen: boolean;
  contextSlot: ReactNode;
  pluginsEnabled: boolean;
  titlebarActions: ReactNode;
  workspaceKind: DesktopWorkspaceKind;
  workspaceSurfaceAction?: DesktopWorkspaceSurfaceAction | null;
  onExitMinimalMode: () => void;
  onNavigate: (view: DesktopView) => void;
};

/**
 * Minimal Mode keeps the normal shell's commands but compresses them into one
 * horizontally expanding, centered dock. It owns presentation only; project,
 * branch, navigation, Terminal, and Chat state remain in their existing
 * controllers.
 */
export function DesktopMinimalModeDock({
  activeView,
  cloudHubEnabled,
  cloudToolsEnabled,
  contextMenuOpen,
  contextSlot,
  pluginsEnabled,
  titlebarActions,
  workspaceKind,
  workspaceSurfaceAction = null,
  onExitMinimalMode,
  onNavigate,
}: DesktopMinimalModeDockProps) {
  const { t } = useLocalization();
  const [pinned, setPinned] = useState(false);
  const expanded = pinned || contextMenuOpen;

  useEffect(() => {
    if (!pinned) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [pinned]);

  const navigate = (view: DesktopView) => {
    setPinned(false);
    onNavigate(view);
  };

  return (
    <div
      className="desktop-minimal-mode-dock"
      data-expanded={expanded ? "true" : undefined}
      data-workspace-kind={workspaceKind}
    >
      <button
        className="desktop-minimal-mode-logo"
        type="button"
        aria-label={t("shell.minimal.controls")}
        aria-controls="desktop-minimal-mode-controls"
        aria-expanded={expanded}
        title={t("shell.minimal.controls")}
        onClick={() => setPinned((value) => !value)}
      >
        <img src="/logo-square.png" alt="" aria-hidden="true" />
      </button>

      <div
        id="desktop-minimal-mode-controls"
        className="desktop-minimal-mode-controls"
        role="toolbar"
        aria-label={t("shell.minimal.commands")}
      >
        <div className="desktop-minimal-mode-context">
          {contextSlot}
        </div>
        <DockSeparator />
        <DockButton
          active={activeView === "data"}
          label={t("shell.navigation.files")}
          icon={<Folder size={16} />}
          onClick={() => navigate("data")}
        />
        <DockButton
          active={activeView === "git"}
          label={t(workspaceKind === "cloud" ? "shell.navigation.history" : "shell.navigation.changes")}
          icon={workspaceKind === "cloud" ? <Clock3 size={16} /> : <VersionControlIcon size={17} />}
          onClick={() => navigate("git")}
        />
        {pluginsEnabled && (
          <DockButton
            active={activeView === "plugins"}
            label={t("shell.navigation.plugins")}
            icon={<Blocks size={16} />}
            onClick={() => navigate("plugins")}
          />
        )}
        {cloudHubEnabled && (
          <DockButton
            active={activeView === "cloud"}
            label={t("shell.navigation.cloud")}
            icon={<Cloud size={16} />}
            onClick={() => navigate("cloud")}
          />
        )}
        {cloudToolsEnabled && (
          <>
            <DockButton
              active={activeView === "access"}
              label={t("shell.navigation.assets")}
              icon={<AssetsDistributionIcon size={16} />}
              onClick={() => navigate("access")}
            />
            <DockButton
              active={activeView === "automation"}
              label={t("shell.navigation.automation")}
              icon={<Workflow size={16} />}
              onClick={() => navigate("automation")}
            />
          </>
        )}
        {workspaceSurfaceAction && (
          <DockButton
            disabled={workspaceSurfaceAction.disabled}
            label={surfaceActionLabel(workspaceSurfaceAction.kind, t)}
            icon={(
              <span className="desktop-minimal-mode-surface-icon" aria-hidden="true">
                <ArrowRightLeft size={13} />
                {workspaceSurfaceAction.kind === "switch-to-cloud"
                  ? <Cloud size={11} />
                  : <Folder size={11} />}
              </span>
            )}
            onClick={() => {
              setPinned(false);
              workspaceSurfaceAction.onClick();
            }}
          />
        )}
        <DockButton
          active={activeView === "settings"}
          label={t("shell.navigation.settings")}
          icon={<Settings size={16} />}
          onClick={() => navigate("settings")}
        />
        <DockSeparator />
        <div className="desktop-minimal-mode-titlebar-actions">
          {titlebarActions}
        </div>
        <DockButton
          label={t("shell.minimal.exit")}
          icon={<Maximize2 size={15} />}
          onClick={() => {
            setPinned(false);
            onExitMinimalMode();
          }}
        />
      </div>
    </div>
  );
}

function DockButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`desktop-minimal-mode-action ${active ? "active" : ""}`}
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function DockSeparator() {
  return <span className="desktop-minimal-mode-separator" aria-hidden="true" />;
}

function surfaceActionLabel(kind: DesktopWorkspaceSurfaceAction["kind"], t: MessageFormatter) {
  if (kind === "switch-to-cloud") return t("shell.surface.switchToCloud");
  if (kind === "switch-to-local") return t("shell.surface.switchToLocal");
  return t("shell.surface.openLocally");
}
