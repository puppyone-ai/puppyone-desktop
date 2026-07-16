import { ArrowLeft } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { SidebarRoot, SidebarRow, SidebarScrollArea } from "@puppyone/shared-ui";
import { SidebarGroup } from "../../components/sidebar";
import type { CloudServiceSidebarProps, CloudWorkspaceSection } from "./types";
import { getCloudAuthSession, resolveCloudAuthState } from "./auth";
import { resolveCloudEnvironment } from "./environment";
import {
  CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES,
  CLOUD_GLOBAL_SIDEBAR_ROUTES,
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  getCloudRoute,
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

const SIGNED_OUT_CLOUD_SIDEBAR_ROUTES: CloudSidebarNavEntry[] = [
  ...CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES.map((route) => ({
    ...route,
    locked: true,
  })),
];

const LOCAL_ONLY_CLOUD_SIDEBAR_ROUTES: CloudSidebarNavEntry[] = [
  {
    ...getCloudRoute("initialize"),
    id: "initialize",
    labelId: "cloud.initialize.sidebarLabel",
  },
  ...CLOUD_GLOBAL_SIDEBAR_ROUTES,
];

export function CloudServiceSidebar({
  status,
  cloudSession,
  cloudApiBaseUrl,
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
  const cloudEnvironment = resolveCloudEnvironment({ status, desktopApiBaseUrl: cloudApiBaseUrl });
  const cloudAuthState = resolveCloudAuthState({
    cloudSession,
    environment: cloudEnvironment,
  });
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const accountEmail = effectiveCloudSession?.user_email ?? null;
  const signedIn = Boolean(effectiveCloudSession);
  // Project context comes from an authorized resolver / explicit route — never from route alone.
  const inProjectContext = signedIn && projectContext && !localOnlyWorkspaceContext;
  const baseNavItems: CloudSidebarNavEntry[] = localOnlyWorkspaceContext
    ? LOCAL_ONLY_CLOUD_SIDEBAR_ROUTES
    : !signedIn
      ? SIGNED_OUT_CLOUD_SIDEBAR_ROUTES
      : inProjectContext && localWorkspaceContext
        ? CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES
        : inProjectContext
          ? CLOUD_PROJECT_SIDEBAR_ROUTES
          : CLOUD_GLOBAL_SIDEBAR_ROUTES;
  const navItems = baseNavItems.filter((item) => (
    item.id !== "cloud-billing" || billingEnabled
  )).filter((item) => (
    !signedIn
      || !("requiredCapability" in item)
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
              onSelectSection("overview");
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
                    active={
                      !item.locked && (
                        (localOnlyWorkspaceContext && normalizedActiveSection === item.id)
                        || (signedIn && (
                          normalizedActiveSection === item.id
                          || (inProjectContext && localWorkspaceContext && item.id === "contents" && normalizedActiveSection === "overview")
                        ))
                      )
                    }
                    onSelect={(section) => {
                      if (localWorkspaceContext && section === "overview") {
                        onSelectSection("contents");
                        return;
                      }
                      onSelectSection(section);
                    }}
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
  onSelect,
}: {
  item: CloudSidebarNavEntry;
  active: boolean;
  onSelect: (section: CloudWorkspaceSection) => void;
}) {
  const { t } = useLocalization();
  const Icon = item.icon;
  const label = t(item.labelId);

  return (
    <SidebarRow
      className={`desktop-cloud-sidebar-nav-row ${item.locked ? "locked" : ""}`}
      active={active}
      aria-disabled={item.locked || undefined}
      title={item.locked ? t("cloud.sidebar.signInToUse") : undefined}
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
