import { useEffect, useMemo, useState } from "react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { buildCloudBranchGraphRows } from "../graph/model";
import { useCloudHistoryData } from "./useCloudHistoryData";

export function useCloudHistoryController({
  session,
  projectId,
  apiBaseUrl,
  enabled = true,
  revisionKey,
  onSessionChange,
}: {
  session: DesktopCloudSession | null;
  projectId: string | null;
  apiBaseUrl: string | null;
  enabled?: boolean;
  revisionKey?: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const data = useCloudHistoryData({
    session,
    projectId,
    apiBaseUrl,
    enabled,
    revisionKey,
    onSessionChange,
  });
  const rows = useMemo(
    () => buildCloudBranchGraphRows({ history: data.history }),
    [data.history],
  );
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  useEffect(() => {
    const commitRows = rows.filter((row) => row.kind === "commit");
    const headCommitId = data.history?.head_commit_id ?? null;
    setSelectedCommitId((current) => {
      if (!enabled) return null;
      if (current && commitRows.some((row) => row.id === current)) return current;
      if (headCommitId && commitRows.some((row) => row.id === headCommitId)) return headCommitId;
      return commitRows[0]?.id ?? null;
    });
  }, [data.history?.head_commit_id, enabled, rows]);

  return {
    ...data,
    rows,
    selectedCommitId,
    selectCommit: setSelectedCommitId,
  };
}
