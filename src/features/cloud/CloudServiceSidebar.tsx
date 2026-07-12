import { ArrowLeft, Cloud } from "lucide-react";
import type { CloudServiceSidebarProps, CloudWorkspaceSection } from "./types";
import { getCloudAuthSession, resolveCloudAuthState } from "./auth";
import { resolveCloudEnvironment } from "./environment";
import {
  CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES,
  CLOUD_GLOBAL_SIDEBAR_ROUTES,
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  normalizeCloudSection,
} from "./routes/cloudRoutes";
import { getAccountInitial } from "./utils";

type CloudSidebarNavEntry = {
  id: CloudWorkspaceSection;
  label: string;
  icon: typeof Cloud;
  groupEnd?: boolean;
  requiredCapability?: string;
  locked?: boolean;
  lockReason?: string;
};

const SIGNED_OUT_CLOUD_SIDEBAR_ROUTES: CloudSidebarNavEntry[] = [
  ...CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES.map((route) => ({
    ...route,
    locked: true,
    lockReason: `Sign in to use ${route.label}`,
  })),
];

export function CloudServiceSidebar({
  status,
  cloudSession,
  cloudApiBaseUrl,
  activeSection,
  projectContext = false,
  projectBound = false,
  projectCapabilities = [],
  onSelectSection,
  onBackToProjects,
}: CloudServiceSidebarProps) {
  const normalizedActiveSection = normalizeCloudSection(activeSection);
  const cloudEnvironment = resolveCloudEnvironment({ status, desktopApiBaseUrl: cloudApiBaseUrl });
  const cloudAuthState = resolveCloudAuthState({
    cloudSession,
    environment: cloudEnvironment,
  });
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const accountEmail = effectiveCloudSession?.user_email ?? null;
  const signedIn = Boolean(effectiveCloudSession);
  // Project context comes from binding / explicit selection — never from route alone.
  const inProjectContext = signedIn && projectContext;
  const baseNavItems: CloudSidebarNavEntry[] = !signedIn
    ? SIGNED_OUT_CLOUD_SIDEBAR_ROUTES
    : inProjectContext && projectBound
      ? CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES
      : inProjectContext
        ? CLOUD_PROJECT_SIDEBAR_ROUTES
        : CLOUD_GLOBAL_SIDEBAR_ROUTES;
  const navItems = baseNavItems.filter((item) => (
    !signedIn
    || !("requiredCapability" in item)
    || !item.requiredCapability
    || projectCapabilities.includes(item.requiredCapability)
  ));

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar">
      {inProjectContext && !projectBound && (
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
            <ArrowLeft size={14} />
            <span>Cloud Projects</span>
          </button>
        </div>
      )}

      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label={inProjectContext ? "Cloud project sections" : "Cloud sections"}>
          {navItems.map((item) => (
            <CloudSidebarNavItem
              key={item.id}
              item={item}
              active={
                signedIn && !item.locked && (
                  normalizedActiveSection === item.id
                  || (inProjectContext && projectBound && item.id === "contents" && normalizedActiveSection === "overview")
                )
              }
              onSelect={(section) => {
                if (projectBound && section === "overview") {
                  onSelectSection("contents");
                  return;
                }
                onSelectSection(section);
              }}
            />
          ))}
        </nav>
      </div>

      {signedIn && (
        <div className="desktop-cloud-sidebar-footer">
          <div className="desktop-cloud-sidebar-footer-avatar" role="img" title={accountEmail ?? "Signed in"} aria-label="Cloud account">
            {getAccountInitial(accountEmail)}
          </div>
        </div>
      )}
    </section>
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
  const Icon = item.icon;

  return (
    <>
      <button
        className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row ${active ? "active" : ""} ${item.locked ? "locked" : ""}`}
        type="button"
        aria-disabled={item.locked || undefined}
        title={item.lockReason}
        onClick={() => {
          if (!item.locked) onSelect(item.id);
        }}
      >
        <span className="desktop-cloud-sidebar-nav-icon">
          <Icon size={15} />
        </span>
        <span className="desktop-cloud-sidebar-nav-label">{item.label}</span>
      </button>
      {item.groupEnd && <div className="desktop-cloud-sidebar-separator" />}
    </>
  );
}
