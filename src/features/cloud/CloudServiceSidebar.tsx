import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { SidebarRoot, SidebarRow, SidebarScrollArea } from "@puppyone/shared-ui";
import { ChevronRight } from "lucide-react";
import { SidebarGroup } from "../../components/sidebar";
import type { CloudServiceSidebarProps, CloudWorkspaceSection } from "./types";
import { getCloudAuthSession } from "./auth";
import {
  CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES,
  getCloudSidebarActiveSection,
  getCloudSignedOutSection,
  normalizeCloudSection,
  type CloudRouteNavigationGroup,
  type CloudRouteDescriptor,
} from "./routes/cloudRoutes";
import { formatSidebarAccount, getAccountInitial } from "./utils";
import { useFeatureFlag } from "../flags";

type CloudSidebarNavEntry = {
  id: CloudWorkspaceSection;
  labelId: string;
  icon: CloudRouteDescriptor["icon"];
  context: CloudRouteDescriptor["context"];
  requiredCapability?: string;
  navigationGroup?: CloudRouteNavigationGroup;
  locked?: boolean;
};

type CloudSidebarNavGroup = {
  id: CloudRouteNavigationGroup;
  labelId: "cloud.sidebar.projectGroup" | "cloud.sidebar.connectionsGroup" | "cloud.sidebar.organizationGroup";
  items: CloudSidebarNavEntry[];
};

export function CloudServiceSidebar({
  cloudAuthState,
  activeSection,
  projectAvailable = false,
  projectCapabilities = [],
  onOpenAccount,
  onSelectSection,
}: CloudServiceSidebarProps) {
  const { t } = useLocalization();
  const billingEnabled = useFeatureFlag("cloudBilling");
  const normalizedActiveSection = normalizeCloudSection(activeSection);
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const accountEmail = effectiveCloudSession?.user_email ?? null;
  const accountLabel = formatSidebarAccount(accountEmail, t);
  const signedIn = Boolean(effectiveCloudSession);
  const visibleActiveSection = getCloudSidebarActiveSection(
    signedIn
      ? normalizedActiveSection
      : getCloudSignedOutSection(normalizedActiveSection),
  );
  const navItems: CloudSidebarNavEntry[] = CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES.map((route: CloudRouteDescriptor) => ({
    ...route,
    locked: route.context === "project"
      ? projectAvailable
        && Boolean(route.requiredCapability && !projectCapabilities.includes(route.requiredCapability))
      : false,
  })).filter((item) => (
    item.id !== "cloud-billing" || billingEnabled
  ));
  const navGroups = buildCloudSidebarNavGroups(navItems);

  return (
    <SidebarRoot className="desktop-cloud-service-sidebar">
      <SidebarScrollArea>
        <nav className="desktop-cloud-sidebar-nav" aria-label={t("cloud.sidebar.projectSections")}>
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
                    lockedReason={!signedIn ? "sign-in" : "initialize"}
                    active={
                      !item.locked && (
                        visibleActiveSection === item.id
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
          <button
            className="desktop-cloud-sidebar-account"
            type="button"
            title={accountEmail ? bidiIsolate(accountEmail) : t("cloud.common.account")}
            aria-label={`${t("cloud.common.account")}: ${accountLabel}`}
            onClick={onOpenAccount}
          >
            <span className="desktop-cloud-sidebar-footer-avatar" aria-hidden="true">
              {getAccountInitial(accountEmail)}
            </span>
            <span className="desktop-cloud-sidebar-account-name" dir="auto">
              {accountLabel}
            </span>
            <ChevronRight className="desktop-cloud-sidebar-account-chevron po-directional-icon" size={13} aria-hidden="true" />
          </button>
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
      active={active}
      disabled={item.locked}
      aria-disabled={item.locked || undefined}
      title={lockedTitle}
      onClick={() => {
        if (!item.locked) onSelect(item.id);
      }}
      icon={<Icon size={15} />}
      label={label}
    />
  );
}

function buildCloudSidebarNavGroups(items: readonly CloudSidebarNavEntry[]): CloudSidebarNavGroup[] {
  const groups: CloudSidebarNavGroup[] = [
    {
      id: "project",
      labelId: "cloud.sidebar.projectGroup",
      items: items.filter((item) => item.navigationGroup === "project"),
    },
    {
      id: "connections",
      labelId: "cloud.sidebar.connectionsGroup",
      items: items.filter((item) => item.navigationGroup === "connections"),
    },
    {
      id: "organization",
      labelId: "cloud.sidebar.organizationGroup",
      items: items.filter((item) => item.navigationGroup === "organization"),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}
