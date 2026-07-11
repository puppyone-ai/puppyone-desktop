import { useEffect, useMemo, useState } from "react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import {
  CloudProjectHistorySidebar,
  CloudProjectHistoryView,
} from "../CloudProjectHistory";
import { useCloudBranchesData } from "../data/useCloudBranchesData";
import { buildCloudBranchGraphRows } from "../model";

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
  const historyData = useCloudBranchesData({
    session: cloudSession,
    projectId,
    apiBaseUrl,
    enabled: true,
    revisionKey,
    onSessionChange,
  });
  const rows = useMemo(
    () => buildCloudBranchGraphRows({ history: historyData.history }),
    [historyData.history],
  );
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  useEffect(() => {
    const commitRows = rows.filter((row) => row.kind === "commit");
    const headCommitId = historyData.history?.head_commit_id ?? null;
    setSelectedCommitId((current) => {
      if (current && commitRows.some((row) => row.id === current)) return current;
      if (headCommitId && commitRows.some((row) => row.id === headCommitId)) return headCommitId;
      return commitRows[0]?.id ?? null;
    });
  }, [historyData.history?.head_commit_id, rows]);

  const sharedProps = {
    rows,
    selectedCommitId,
    loading: historyData.loading,
    loadingMore: historyData.loadingMore,
    hasMore: historyData.hasMore,
    error: historyData.error,
    onSelectCommit: setSelectedCommitId,
    onRefresh: historyData.reload,
    onLoadMore: historyData.loadMore,
  };

  return (
    <section className="desktop-cloud-history-surface" aria-label="Cloud project commit history">
      <CloudProjectHistorySidebar {...sharedProps} />
      <CloudProjectHistoryView
        {...sharedProps}
        projectId={projectId}
        projectName={projectName}
        history={historyData.history}
      />
    </section>
  );
}
