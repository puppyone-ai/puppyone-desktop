import { lazy, Suspense } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { adaptCloudAggregateToAccessData } from "../data/adaptCloudAggregateToAccessData";
import type { DesktopCloudDataState } from "../data/useDesktopCloudData";

const LazyDesktopCloudAutomationView = lazy(() => import("../../automation/DesktopCloudAutomationView").then((module) => ({
  default: module.DesktopCloudAutomationView,
})));

/** Automation reuses aggregate Cloud data — no second Access fetch. */
export function CloudAutomationRouteSection({
  projectId,
  cloudSession,
  apiBaseUrl,
  cloudData,
  sessionRestoring = false,
  onSessionChange,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  cloudData: DesktopCloudDataState;
  sessionRestoring?: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const { t } = useLocalization();
  const accessData = adaptCloudAggregateToAccessData({
    apiBaseUrl,
    scopes: cloudData.scopes,
    connectors: cloudData.connectors,
    mcpEndpoints: cloudData.mcpEndpoints,
    identity: cloudData.identity,
    loading: cloudData.loading,
    error: cloudData.error,
    warning: cloudData.warning,
    reload: cloudData.reload,
  });

  return (
    <Suspense fallback={<div className="desktop-view-route-loading" role="status">{t("cloud.loading.automation")}</div>}>
      <LazyDesktopCloudAutomationView
        projectId={projectId}
        cloudSession={cloudSession}
        accessData={accessData}
        activeProvider={null}
        sessionRestoring={sessionRestoring}
        embedded
        onCloudSessionChange={onSessionChange}
        onRefresh={cloudData.reload}
      />
    </Suspense>
  );
}
