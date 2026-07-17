import { ArrowLeft } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { SidebarRoot, SidebarRow, SidebarScrollArea } from "@puppyone/shared-ui";
import { SidebarGroup } from "../../components/sidebar";
import type { CloudServiceSidebarProps, CloudWorkspaceSection } from "./types";
import { getCloudAuthSession } from "./auth";
import {
  CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES,
  CLOUD_GLOBAL_SIDEBAR_ROUTES,
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  normalizeCloudSection,
  type CloudRouteDescriptor,
} from "./routes/cloudRoutes";
import { getAccountInitial } from "./utils";
import { useFeatureFlag } from "../flags";

type CloudSidebarNavEntry = {
  id: CloudWorkspaceSection;
  labelId: string;
  icon: CloudRouteDescriptor["icon"];
  context: CloudRouteDescriptor["context"];
  requiredCapability?: string;
  locked?: boolean;
};

type CloudSidebarNavGroup = {
  id: "project" | "organization";
  labelId: "cloud.sidebar.projectGroup" | "cloud.sidebar.organizationGroup";
  items: CloudSidebarNavEntry[];
};

/** Preview of project sections while Cloud is unavailable (signed out or not initialized). */
const LOCKED_PROJECT_PREVIEW_SIDEBAR_ROUTES: CloudSidebarNavEntry[] = [
  ...CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES.map((route) => ({
    ...route,
    locked: true,
  })),
];

export function CloudServiceSidebar({
  cloudAuthState,
  activeSection,
  projectContext = false,
  localWorkspaceContext = false,
  localOnlyWorkspaceContext = false,
  projectCapabilities = [],
  onSelectSection,
  onBackToProjects,
}: CloudServiceSidebarProps) {
  const { t } = useLocalization();
  const billingEnabled = useFeatureFlag("cloudBilling");
  const normalizedActiveSection = normalizeCloudSection(activeSection);
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const accountEmail = effectiveCloudSession?.user_email ?? null;
  const signedIn = Boolean(effectiveCloudSession);
  // Project context comes from an authorized resolver / explicit route — never from route alone.
  const inProjectContext = signedIn && projectContext && !localOnlyWorkspaceContext;
  const baseNavItems: CloudSidebarNavEntry[] = localOnlyWorkspaceContext || !signedIn
    ? LOCKED_PROJECT_PREVIEW_SIDEBAR_ROUTES
    : inProjectContext && localWorkspaceContext
      ? CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES
      : inProjectContext
        ? CLOUD_PROJECT_SIDEBAR_ROUTES
        : CLOUD_GLOBAL_SIDEBAR_ROUTES;
  const navItems = baseNavItems.filter((item) => (
    item.id !== "cloud-billing" || billingEnabled
  )).filter((item) => (
    // Keep locked preview rows visible even before Project capabilities exist.
    item.locked
      || !signedIn
      || !item.requiredCapability
      || projectCapabilities.includes(item.requiredCapability)
  ));
  const navGroups = buildCloudSidebarNavGroups(navItems);

  return (
    <SidebarRoot className="desktop-cloud-service-sidebar">
      {inProjectContext && !localWorkspaceContext && (
        <div className="desktop-cloud-sidebar-context">
          <button
            className="desktop-cloud-sidebar-context-back"
            type="button"
            onClick={() => {
              if (onBackToProjects) {
                onBackToProjects();
                return;
              }
              onSelectSection("projects");
            }}
          >
            <ArrowLeft className="po-directional-icon" size={14} />
            <span>{t("cloud.route.overview.label")}</span>
          </button>
        </div>
      )}

      <SidebarScrollArea className="desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label={t(inProjectContext ? "cloud.sidebar.projectSections" : "cloud.sidebar.sections")}>
          {navGroups.map((group) => {
            const disabled = group.items.every((item) => item.locked);
            return (
              <SidebarGroup
                title={t(group.labelId)}
                disabled={disabled}
                key={group.id}
              >
                {group.items.map((item) => (
                  <CloudSidebarNavItem
                    key={item.id}
                    item={item}
                    lockedReason={localOnlyWorkspaceContext ? "initialize" : "sign-in"}
                    active={
                      !item.locked && signedIn && (
                        normalizedActiveSection === item.id
                      )
                    }
                    onSelect={onSelectSection}
                  />
                ))}
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarScrollArea>

      {signedIn && (
        <div className="desktop-cloud-sidebar-footer">
          <div className="desktop-cloud-sidebar-footer-avatar" role="img" title={accountEmail ? bidiIsolate(accountEmail) : t("cloud.account.signedIn")} aria-label={t("cloud.account.ariaLabel")}>
            {getAccountInitial(accountEmail)}
          </div>
        </div>
      )}
    </SidebarRoot>
  );
}

export function CloudSidebarNavItem({
  item,
  active,
  lockedReason = "sign-in",
  onSelect,
}: {
  item: CloudSidebarNavEntry;
  active: boolean;
  lockedReason?: "sign-in" | "initialize";
  onSelect: (section: CloudWorkspaceSection) => void;
}) {
  const { t } = useLocalization();
  const Icon = item.icon;
  const label = t(item.labelId);
  const lockedTitle = item.locked
    ? t(lockedReason === "initialize" ? "cloud.sidebar.initializeToUse" : "cloud.sidebar.signInToUse")
    : undefined;

  return (
    <SidebarRow
      className={`desktop-cloud-sidebar-nav-row ${item.locked ? "locked" : ""}`}
      active={active}
      aria-disabled={item.locked || undefined}
      title={lockedTitle}
      onClick={() => {
        if (!item.locked) onSelect(item.id);
      }}
      icon={<span className="desktop-cloud-sidebar-nav-icon">
        <Icon size={15} />
      </span>}
      label={<span className="desktop-cloud-sidebar-nav-label">{label}</span>}
    />
  );
}

function buildCloudSidebarNavGroups(items: readonly CloudSidebarNavEntry[]): CloudSidebarNavGroup[] {
  const groups: CloudSidebarNavGroup[] = [
    {
      id: "project",
      labelId: "cloud.sidebar.projectGroup",
      items: items.filter((item) => item.context !== "account"),
    },
    {
      id: "organization",
      labelId: "cloud.sidebar.organizationGroup",
      items: items.filter((item) => item.context === "account"),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}
