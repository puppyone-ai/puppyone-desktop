import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCloudHistory,
  type DesktopCloudHistory,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";

export type CloudBranchesDataState = {
  history: DesktopCloudHistory | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

type CloudBranchesDataInternalState = Omit<CloudBranchesDataState, "reload"> & {
  contextKey: string | null;
};

export function useCloudBranchesData({
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
}): CloudBranchesDataState {
  const canLoad = enabled && Boolean(session && projectId);
  const contextKey = canLoad && session && projectId
    ? [
        session.user_id,
        session.session_generation,
        session.api_base_url,
        apiBaseUrl ?? "",
        projectId,
        revisionKey ?? "mutable-latest",
      ].join("\n")
    : `disabled:${projectId ?? "none"}`;
  const [state, setState] = useState<CloudBranchesDataInternalState>(() => createCloudBranchesDataState());
  const activeRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    if (!canLoad || !session || !projectId) {
      setState(createCloudBranchesDataState({ contextKey }));
      return;
    }

    setState((current) => (
      current.contextKey === contextKey
        ? {
            ...current,
            loading: true,
            error: null,
          }
        : createCloudBranchesDataState({
            loading: true,
            contextKey,
          })
    ));

    try {
      const history = await getCloudHistory(session, projectId, 80, onSessionChange, apiBaseUrl);
      if (activeRequestRef.current !== requestId) return;
      setState({
        history,
        loading: false,
        error: null,
        contextKey,
      });
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setState({
        history: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load branch history.",
        contextKey,
      });
    }
  }, [apiBaseUrl, canLoad, contextKey, onSessionChange, projectId, session]);

  useEffect(() => {
    void load();
    return () => {
      activeRequestRef.current += 1;
    };
  }, [load, revisionKey]);

  if (state.contextKey !== contextKey) {
    return {
      ...toPublicCloudBranchesDataState(createCloudBranchesDataState({ loading: canLoad })),
      reload: load,
    };
  }

  return {
    ...toPublicCloudBranchesDataState(state),
    reload: load,
  };
}

function createCloudBranchesDataState(
  overrides: Partial<CloudBranchesDataInternalState> = {},
): CloudBranchesDataInternalState {
  return {
    history: null,
    loading: false,
    error: null,
    contextKey: null,
    ...overrides,
  };
}

function toPublicCloudBranchesDataState({
  contextKey,
  ...publicState
}: CloudBranchesDataInternalState): Omit<CloudBranchesDataState, "reload"> {
  void contextKey;
  return publicState;
}
