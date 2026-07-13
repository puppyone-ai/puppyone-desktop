import { useEffect, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  listCloudAutomationProviderSpecs,
  openCloudApp,
  type DesktopCloudAutomationProviderSpec,
  type DesktopCloudConnector,
  type DesktopCloudSession,
} from "../../lib/cloudApi";
import { CloudProjectBrowserSignedOut } from "../cloud/components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "../cloud/components/shared";
import { formatCloudMessage } from "../cloud/cloudPresentation";
import type { DesktopCloudAccessDataState } from "../cloud/data/useDesktopCloudAccessData";
import {
  formatProviderLabel,
  getCloudProviderIconUrl,
  providerIcon,
} from "../cloud/utils";
import { AutomationGridIcon } from "./AutomationIcon";
import { CloudAutomationPage } from "./AutomationPage";
import {
  buildCloudAutomationRows,
  cloudAutomationRowMatchesProvider,
  getCloudAutomationWebPath,
  isCloudAutomationConnector,
} from "./automationDomain";

export function DesktopCloudAutomationView({
  projectId,
  cloudSession,
  accessData,
  activeProvider,
  sessionRestoring,
  embedded = false,
  onCloudSessionChange,
  onRefresh,
}: {
  projectId: string | null;
  cloudSession: DesktopCloudSession | null;
  accessData: DesktopCloudAccessDataState;
  activeProvider: string | null;
  sessionRestoring: boolean;
  embedded?: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [providerSpecs, setProviderSpecs] = useState<DesktopCloudAutomationProviderSpec[]>([]);
  const [providerSpecsLoading, setProviderSpecsLoading] = useState(true);
  const [providerSpecsError, setProviderSpecsError] = useState<string | null>(null);
  const automationRows = useMemo(
    () => buildCloudAutomationRows({
      scopes: accessData.scopeRows,
      connectors: accessData.connectors,
    }),
    [accessData.connectors, accessData.scopeRows],
  );
  const visibleRows = useMemo(
    () => automationRows.filter((row) => cloudAutomationRowMatchesProvider(row, activeProvider)),
    [activeProvider, automationRows],
  );
  const detailRow = visibleRows.find((row) => row.id === detailRowId) ?? null;

  useEffect(() => {
    if (!cloudSession) {
      setProviderSpecs([]);
      setProviderSpecsLoading(false);
      setProviderSpecsError(null);
      return undefined;
    }
    let cancelled = false;
    setProviderSpecsLoading(true);
    setProviderSpecsError(null);
    void listCloudAutomationProviderSpecs(
      cloudSession,
      onCloudSessionChange,
      cloudSession.api_base_url ?? null,
    )
      .then((providers) => {
        if (!cancelled) setProviderSpecs(providers);
      })
      .catch((error) => {
        if (cancelled) return;
        setProviderSpecs([]);
        setProviderSpecsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setProviderSpecsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudSession, onCloudSessionChange]);

  useEffect(() => {
    if (detailRowId && !visibleRows.some((row) => row.id === detailRowId)) {
      setDetailRowId(null);
    }
  }, [detailRowId, visibleRows]);

  if (sessionRestoring && !cloudSession) {
    return (
      <div className="desktop-cloud-main-view desktop-cloud-automation-main-view">
        <div className="desktop-cloud-page-shell desktop-cloud-automation-page-shell">
          <CloudWorkspaceLoadingState label={t("automation.view.loadingCloudSession")} />
        </div>
      </div>
    );
  }

  if (!cloudSession) {
    return (
      <div className="desktop-cloud-main-view desktop-cloud-auth-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudProjectBrowserSignedOut
            apiBaseUrl={null}
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
          <div className="desktop-cloud-main-alert">{t("automation.view.noActiveProject")}</div>
        </div>
      </div>
    );
  }

  const automationPage = (
    <CloudAutomationPage
      projectId={projectId}
      cloudSession={cloudSession}
      apiBaseUrl={cloudSession.api_base_url ?? null}
      rows={visibleRows}
      totalCount={automationRows.length}
      hasAnyAutomation={automationRows.length > 0}
      loading={accessData.loading}
      providerSpecs={providerSpecs}
      providerSpecsLoading={providerSpecsLoading}
      providerSpecsError={providerSpecsError}
      detailRow={detailRow}
      onOpenRow={setDetailRowId}
      onCloseDetail={() => setDetailRowId(null)}
      onCloudSessionChange={onCloudSessionChange}
      onRefresh={accessData.reload}
      onOpenAutomation={() => openCloudApp(getCloudAutomationWebPath(projectId))}
    />
  );

  if (embedded) return automationPage;

  return (
    <div className="desktop-cloud-main-view desktop-cloud-automation-main-view">
      <div className="desktop-cloud-page-shell desktop-cloud-automation-page-shell">
        {accessData.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(accessData.error, t)}</div>}
        {accessData.warning && <div className="desktop-cloud-main-alert">{formatCloudMessage(accessData.warning, t)}</div>}
        {automationPage}
      </div>
    </div>
  );
}

export function DesktopCloudAutomationSidebar({
  accessData,
  activeProvider,
  onSelectProvider,
}: {
  accessData: DesktopCloudAccessDataState;
  activeProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const automationConnectors = accessData.connectors.filter(isCloudAutomationConnector);
  const providerGroups = getAutomationSidebarProviderGroups(
    automationConnectors,
    localization.getCollator({ sensitivity: "base" }),
    t,
  );
  const providerKey = providerGroups.map((group) => group.provider).join("|");

  useEffect(() => {
    if (activeProvider && !providerKey.split("|").includes(activeProvider)) {
      onSelectProvider(null);
    }
  }, [activeProvider, onSelectProvider, providerKey]);

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar desktop-cloud-automation-type-sidebar">
      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label={t("automation.page.cloudAutomation")}>
          <button
            className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row ${activeProvider ? "" : "active"}`}
            type="button"
            aria-current={activeProvider ? undefined : "page"}
            onClick={() => onSelectProvider(null)}
          >
            <span className="desktop-cloud-sidebar-nav-icon">
              <AutomationGridIcon size={15} />
            </span>
            <span className="desktop-cloud-sidebar-nav-label">{t("automation.sidebar.all")}</span>
            {automationConnectors.length > 0 && (
              <span className="desktop-cloud-sidebar-nav-count">{automationConnectors.length}</span>
            )}
          </button>
          <div className="desktop-cloud-automation-nav-group">
            {providerGroups.map((group) => {
              const Icon = providerIcon(group.provider);
              const iconUrl = getCloudProviderIconUrl(group.provider);
              const active = activeProvider === group.provider;
              return (
                <button
                  className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row desktop-cloud-automation-provider-row ${active ? "active" : ""}`}
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
            {accessData.loading && providerGroups.length === 0 && (
              <div className="desktop-cloud-automation-nav-empty" role="status">{t("automation.sidebar.loading")}</div>
            )}
            {!accessData.loading && accessData.error && (
              <div className="desktop-cloud-automation-nav-empty" role="status">{formatCloudMessage(accessData.error, t)}</div>
            )}
            {!accessData.loading && !accessData.error && providerGroups.length === 0 && (
              <div className="desktop-cloud-automation-nav-empty">{t("automation.sidebar.noneActive")}</div>
            )}
          </div>
        </nav>
      </div>
    </section>
  );
}

function getAutomationSidebarProviderGroups(
  connectors: DesktopCloudConnector[],
  collator: Intl.Collator,
  t: ReturnType<typeof useLocalization>["t"],
) {
  const groups = new Map<string, {
    provider: string;
    label: string;
    connectors: DesktopCloudConnector[];
  }>();

  for (const connector of connectors) {
    const group = groups.get(connector.provider) ?? {
      provider: connector.provider,
      label: formatProviderLabel(connector.provider, t),
      connectors: [],
    };
    group.connectors.push(connector);
    groups.set(connector.provider, group);
  }

  return [...groups.values()].sort((left, right) => collator.compare(left.label, right.label));
}
