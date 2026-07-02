import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  getCloudRepoIdentity,
  listCloudConnectors,
  listCloudMcpEndpoints,
  listCloudScopes,
  openCloudApp,
  type DesktopCloudConnector,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudRepoIdentity,
  type DesktopCloudScope,
  type DesktopCloudSession,
} from "../../lib/cloudApi";
import {
  CLOUD_ACCESS_BUILTIN_FILTERS,
  getCloudAccessFilterDescriptor,
  type CloudAccessFilter,
} from "./accessFilters";
import { CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "./components/shared";
import { getCloudRouteWebPath } from "./routes/cloudRoutes";
import { CloudAccessSection } from "./sections/access/AccessSection";
import type { CloudWorkspaceSection } from "./types";
import {
  formatProviderLabel,
  getCloudProviderIconUrl,
  isCloudIntegrationConnector,
  providerIcon,
  unwrapSettled,
} from "./utils";

type DesktopCloudAccessState = {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  loading: boolean;
  error: string | null;
  warning: string | null;
};

export function DesktopCloudAccessView({
  projectId,
  cloudSession,
  activeFilter,
  activeIntegrationProvider,
  sessionRestoring,
  onCloudSessionChange,
  onRefresh,
}: {
  projectId: string | null;
  cloudSession: DesktopCloudSession | null;
  activeFilter: CloudAccessFilter;
  activeIntegrationProvider?: string | null;
  sessionRestoring: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const cloudApiBaseUrl = cloudSession?.api_base_url ?? null;
  const [state, setState] = useState<DesktopCloudAccessState>(() => createCloudAccessState());

  useEffect(() => {
    if (!cloudSession || !projectId) {
      setState(createCloudAccessState());
      return undefined;
    }

    let cancelled = false;
    const loadAccess = async () => {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
        warning: null,
      }));

      const [scopesResult, connectorsResult, mcpResult, identityResult] = await Promise.allSettled([
        listCloudScopes(cloudSession, projectId, onCloudSessionChange, cloudApiBaseUrl),
        listCloudConnectors(cloudSession, projectId, onCloudSessionChange, cloudApiBaseUrl),
        listCloudMcpEndpoints(cloudSession, projectId, onCloudSessionChange, cloudApiBaseUrl),
        getCloudRepoIdentity(cloudSession, projectId, onCloudSessionChange, cloudApiBaseUrl),
      ]);

      if (cancelled) return;

      const failures = [scopesResult, connectorsResult, mcpResult, identityResult]
        .filter((result) => result.status === "rejected");
      const allFailed = failures.length === 4;
      const firstFailure = failures[0];
      setState({
        scopes: unwrapSettled(scopesResult) ?? [],
        connectors: unwrapSettled(connectorsResult) ?? [],
        mcpEndpoints: unwrapSettled(mcpResult) ?? [],
        identity: unwrapSettled(identityResult),
        loading: false,
        error: allFailed && firstFailure?.status === "rejected"
          ? getErrorMessage(firstFailure.reason, "Unable to load Cloud access.")
          : null,
        warning: !allFailed && failures.length > 0
          ? "Some Cloud access details could not be loaded. Refresh after checking the backend connection."
          : null,
      });
    };

    void loadAccess().catch((error) => {
      if (cancelled) return;
      setState(createCloudAccessState({
        loading: false,
        error: getErrorMessage(error, "Unable to load Cloud access."),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [cloudApiBaseUrl, cloudSession, onCloudSessionChange, projectId]);

  if (sessionRestoring && !cloudSession) {
    return (
      <div className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label="Loading Cloud session" />
        </div>
      </div>
    );
  }

  if (!cloudSession) {
    return (
      <div className="desktop-cloud-main-view desktop-cloud-auth-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudProjectBrowserSignedOut
            apiBaseUrl={cloudApiBaseUrl}
            accountEmail={null}
            onSignedIn={onCloudSessionChange}
            onSignedOut={() => onCloudSessionChange(null)}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <div className="desktop-cloud-main-alert">No Cloud project is active.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`desktop-cloud-main-view ${activeFilter === "integrations" ? "desktop-cloud-integrations-main-view" : ""}`}>
      <div className={`desktop-cloud-page-shell ${activeFilter === "integrations" ? "desktop-cloud-integrations-page-shell" : ""}`}>
        {state.error && <div className="desktop-cloud-main-alert">{state.error}</div>}
        {state.warning && <div className="desktop-cloud-main-alert">{state.warning}</div>}
        <CloudAccessSection
          projectId={projectId}
          apiBaseUrl={cloudApiBaseUrl}
          identity={state.identity}
          scopes={state.scopes}
          connectors={state.connectors}
          mcpEndpoints={state.mcpEndpoints}
          filter={activeFilter}
          integrationProviderFilter={activeIntegrationProvider ?? null}
          loading={state.loading}
          onOpenProject={handleOpenProject}
          onOpenIntegrations={handleOpenIntegrations}
        />
      </div>
    </div>
  );
}

export function DesktopCloudAccessSidebar({
  activeFilter,
  onSelectFilter,
}: {
  activeFilter: CloudAccessFilter;
  onSelectFilter: (filter: CloudAccessFilter) => void;
}) {
  const [allExpanded, setAllExpanded] = useState(true);
  const allAccess = getCloudAccessFilterDescriptor("all");
  const AllIcon = allAccess.icon;

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar desktop-cloud-access-type-sidebar">
      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label="Cloud access types">
          <div className="desktop-cloud-access-nav-tree">
            <div className="desktop-cloud-access-nav-parent-row">
              <button
                className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row desktop-cloud-access-nav-parent ${activeFilter === "all" ? "active" : ""}`}
                type="button"
                aria-current={activeFilter === "all" ? "page" : undefined}
                onClick={() => onSelectFilter("all")}
              >
                <span className="desktop-cloud-sidebar-nav-icon">
                  <AllIcon size={15} />
                </span>
                <span className="desktop-cloud-sidebar-nav-label">{allAccess.label}</span>
              </button>
              <button
                className={`desktop-cloud-access-nav-toggle ${allExpanded ? "expanded" : ""}`}
                type="button"
                aria-label={allExpanded ? "Collapse access types" : "Expand access types"}
                aria-expanded={allExpanded}
                onClick={() => setAllExpanded((expanded) => !expanded)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {allExpanded && (
              <div className="desktop-cloud-access-nav-children" role="group" aria-label="All Access types">
                {CLOUD_ACCESS_BUILTIN_FILTERS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row desktop-cloud-access-nav-child ${activeFilter === item.id ? "active" : ""}`}
                      type="button"
                      aria-current={activeFilter === item.id ? "page" : undefined}
                      onClick={() => onSelectFilter(item.id)}
                    >
                      <span className="desktop-cloud-sidebar-nav-icon">
                        <Icon size={14} />
                      </span>
                      <span className="desktop-cloud-sidebar-nav-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>
    </section>
  );
}

type DesktopCloudIntegrationsSidebarState = {
  connectors: DesktopCloudConnector[];
  loading: boolean;
  error: string | null;
};

export function DesktopCloudIntegrationsSidebar({
  projectId,
  cloudSession,
  activeProvider,
  onCloudSessionChange,
  onSelectProvider,
}: {
  projectId: string | null;
  cloudSession: DesktopCloudSession | null;
  activeProvider: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onSelectProvider: (provider: string | null) => void;
}) {
  const integrations = getCloudAccessFilterDescriptor("integrations");
  const IntegrationsIcon = integrations.icon;
  const cloudApiBaseUrl = cloudSession?.api_base_url ?? null;
  const [state, setState] = useState<DesktopCloudIntegrationsSidebarState>({
    connectors: [],
    loading: false,
    error: null,
  });
  const integrationConnectors = state.connectors.filter(isCloudIntegrationConnector);
  const providerGroups = getIntegrationSidebarProviderGroups(integrationConnectors);
  const providerKey = providerGroups.map((group) => group.provider).join("|");

  useEffect(() => {
    if (!cloudSession || !projectId) {
      setState({ connectors: [], loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void listCloudConnectors(cloudSession, projectId, onCloudSessionChange, cloudApiBaseUrl)
      .then((connectors) => {
        if (cancelled) return;
        setState({ connectors, loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          connectors: [],
          loading: false,
          error: getErrorMessage(error, "Unable to load integrations."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cloudApiBaseUrl, cloudSession, onCloudSessionChange, projectId]);

  useEffect(() => {
    if (activeProvider && !providerKey.split("|").includes(activeProvider)) {
      onSelectProvider(null);
    }
  }, [activeProvider, onSelectProvider, providerKey]);

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar desktop-cloud-integrations-type-sidebar">
      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label="Cloud integrations">
          <button
            className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row ${activeProvider ? "" : "active"}`}
            type="button"
            aria-current={activeProvider ? undefined : "page"}
            onClick={() => onSelectProvider(null)}
          >
            <span className="desktop-cloud-sidebar-nav-icon">
              <IntegrationsIcon size={15} />
            </span>
            <span className="desktop-cloud-sidebar-nav-label">All Integrations</span>
            {integrationConnectors.length > 0 && (
              <span className="desktop-cloud-sidebar-nav-count">{integrationConnectors.length}</span>
            )}
          </button>
          <div className="desktop-cloud-integrations-nav-group">
            {providerGroups.map((group) => {
              const Icon = providerIcon(group.provider);
              const iconUrl = getCloudProviderIconUrl(group.provider);
              const active = activeProvider === group.provider;
              return (
                <button
                  className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row desktop-cloud-integrations-provider-row ${active ? "active" : ""}`}
                  key={group.provider}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  title={group.label}
                  onClick={() => onSelectProvider(group.provider)}
                >
                  <span className="desktop-cloud-sidebar-nav-icon">
                    {iconUrl ? <img src={iconUrl} alt="" /> : <Icon size={14} />}
                  </span>
                  <span className="desktop-cloud-sidebar-nav-label">{group.label}</span>
                  <span className="desktop-cloud-sidebar-nav-count">{group.connectors.length}</span>
                </button>
              );
            })}
            {state.loading && providerGroups.length === 0 && (
              <div className="desktop-cloud-integrations-nav-empty" role="status">Loading integrations</div>
            )}
            {!state.loading && state.error && (
              <div className="desktop-cloud-integrations-nav-empty" role="status">{state.error}</div>
            )}
            {!state.loading && !state.error && providerGroups.length === 0 && (
              <div className="desktop-cloud-integrations-nav-empty">No active integrations</div>
            )}
          </div>
        </nav>
      </div>
    </section>
  );
}

function getIntegrationSidebarProviderGroups(connectors: DesktopCloudConnector[]) {
  const groups = new Map<string, {
    provider: string;
    label: string;
    connectors: DesktopCloudConnector[];
  }>();

  for (const connector of connectors) {
    const group = groups.get(connector.provider) ?? {
      provider: connector.provider,
      label: formatProviderLabel(connector.provider),
      connectors: [],
    };
    group.connectors.push(connector);
    groups.set(connector.provider, group);
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function handleOpenProject(projectId: string, section: CloudWorkspaceSection = "access") {
  openCloudApp(getCloudRouteWebPath(section, projectId));
}

function handleOpenIntegrations(projectId: string) {
  openCloudApp(`/projects/${encodeURIComponent(projectId)}/workflows`);
}

function createCloudAccessState(overrides: Partial<DesktopCloudAccessState> = {}): DesktopCloudAccessState {
  return {
    scopes: [],
    connectors: [],
    mcpEndpoints: [],
    identity: null,
    loading: false,
    error: null,
    warning: null,
    ...overrides,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
