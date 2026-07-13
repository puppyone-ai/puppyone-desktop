import { useEffect, useMemo, useState } from "react";
import {
  getWorkspaceGitBranchGraph,
  toWorkspaceGitBranchGraphSnapshot,
} from "../../../lib/localFiles";
import type { GitBranchGraphSnapshot, GitStatusSnapshot } from "../../../types/electron";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export type CloudBranchesGitStatusState = {
  status: GitBranchGraphSnapshot | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
};

export function useCloudBranchesGitStatus({
  rootPath,
  fallbackStatus,
}: {
  rootPath: string;
  fallbackStatus: GitStatusSnapshot | null;
}): CloudBranchesGitStatusState {
  const fallbackGraphStatus = useMemo(
    () => fallbackStatus ? toWorkspaceGitBranchGraphSnapshot(fallbackStatus) : null,
    [fallbackStatus],
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<{
    rootPath: string | null;
    status: GitBranchGraphSnapshot | null;
    loading: boolean;
    error: CloudMessageDescriptor | null;
  }>(() => ({
    rootPath: null,
    status: fallbackGraphStatus,
    loading: false,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({
      rootPath,
      status: current.rootPath === rootPath ? current.status ?? fallbackGraphStatus : fallbackGraphStatus,
      loading: true,
      error: null,
    }));

    getWorkspaceGitBranchGraph(rootPath)
      .then((nextStatus) => {
        if (cancelled) return;
        setState({
          rootPath,
          status: nextStatus,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          rootPath,
          status: fallbackGraphStatus,
          loading: false,
          error: cloudMessage("git-topology-load-failed", undefined, error instanceof Error ? error.message : undefined),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackGraphStatus, reloadToken, rootPath]);

  const reload = async () => {
    setReloadToken((token) => token + 1);
  };

  return {
    status: state.rootPath === rootPath ? state.status ?? fallbackGraphStatus : fallbackGraphStatus,
    loading: state.rootPath === rootPath ? state.loading : true,
    error: state.rootPath === rootPath ? state.error : null,
    reload,
  };
}
