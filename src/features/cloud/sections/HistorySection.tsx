import { useEffect, useMemo, useState } from "react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { CloudProjectHistoryView } from "../CloudProjectHistory";
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
    () => buildCloudBranchGraphRows(null, historyData.history),
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

  return (
    <CloudProjectHistoryView
      projectId={projectId}
      projectName={projectName}
      history={historyData.history}
      rows={rows}
      selectedCommitId={selectedCommitId}
      loading={historyData.loading}
      error={historyData.error}
      onSelectCommit={setSelectedCommitId}
      onRefresh={historyData.reload}
    />
  );
}
