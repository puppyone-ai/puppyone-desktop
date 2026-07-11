import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { DesktopCloudAutomationView } from "../../automation/DesktopCloudAutomationView";
import { adaptCloudAggregateToAccessData } from "../data/adaptCloudAggregateToAccessData";
import type { DesktopCloudDataState } from "../data/useDesktopCloudData";

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
    <DesktopCloudAutomationView
      projectId={projectId}
      cloudSession={cloudSession}
      accessData={accessData}
      activeProvider={null}
      sessionRestoring={sessionRestoring}
      embedded
      onCloudSessionChange={onSessionChange}
      onRefresh={cloudData.reload}
    />
  );
}
