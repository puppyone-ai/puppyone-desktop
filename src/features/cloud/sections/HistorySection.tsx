import type { DesktopCloudSession } from "../../../lib/cloudApi";
import {
  CloudProjectHistorySidebar,
  CloudProjectHistoryView,
} from "../history";
import { useCloudHistoryController } from "../history/useCloudHistoryController";

export function CloudHistorySection({
  projectId,
  projectName,
  cloudSession,
  apiBaseUrl,
  onSessionChange,
  revisionKey,
}: {
  projectId: string;
  projectName: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  revisionKey?: string | null;
}) {
  const history = useCloudHistoryController({
    session: cloudSession,
    projectId,
    apiBaseUrl,
    enabled: true,
    revisionKey,
    onSessionChange,
  });
  const sharedProps = {
    rows: history.rows,
    selectedCommitId: history.selectedCommitId,
    loading: history.loading,
    loadingMore: history.loadingMore,
    hasMore: history.hasMore,
    error: history.error,
    warning: history.warning,
    onSelectCommit: history.selectCommit,
    onRefresh: history.reload,
    onLoadMore: history.loadMore,
  };

  return (
    <section className="desktop-cloud-history-surface" aria-label="Cloud project commit history">
      <CloudProjectHistorySidebar {...sharedProps} />
      <CloudProjectHistoryView
        {...sharedProps}
        projectId={projectId}
        projectName={projectName}
        history={history.history}
      />
    </section>
  );
}
