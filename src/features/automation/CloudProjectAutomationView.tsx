import { useEffect, useMemo, useState } from "react";
import {
  listCloudAutomationProviderSpecs,
  openCloudApp,
  type DesktopCloudAutomationProviderSpec,
  type DesktopCloudSession,
} from "../../lib/cloudApi";
import type { CloudProjectAccessData } from "../cloud/project/cloudProjectAccessData";
import { CloudAutomationPage } from "./AutomationPage";
import {
  buildCloudAutomationRows,
  cloudAutomationRowMatchesProvider,
  getCloudAutomationWebPath,
} from "./automationDomain";
import "./automation.css";

/** Automation for the single Project authorized by the current Git remote. */
export function CloudProjectAutomationView({
  projectId,
  cloudSession,
  accessData,
  activeProvider = null,
  onCloudSessionChange,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  accessData: CloudProjectAccessData;
  activeProvider?: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
}) {
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

  return (
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
}

