import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCloudHistory,
  type DesktopCloudHistory,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";

export type CloudBranchesDataState = {
  history: DesktopCloudHistory | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

type CloudBranchesDataInternalState = Omit<CloudBranchesDataState, "reload" | "loadMore" | "hasMore"> & {
  contextKey: string | null;
};

const CLOUD_HISTORY_PAGE_SIZE = 80;

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
            loadingMore: false,
            error: null,
          }
        : createCloudBranchesDataState({
            loading: true,
            contextKey,
          })
    ));

    try {
      const history = await getCloudHistory(
        session,
        projectId,
        CLOUD_HISTORY_PAGE_SIZE,
        onSessionChange,
        apiBaseUrl,
      );
      if (activeRequestRef.current !== requestId) return;
      setState({
        history,
        loading: false,
        loadingMore: false,
        error: null,
        contextKey,
      });
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setState((current) => ({
        history: current.contextKey === contextKey ? current.history : null,
        loading: false,
        loadingMore: false,
        error: error instanceof Error ? error.message : "Unable to load branch history.",
        contextKey,
      }));
    }
  }, [apiBaseUrl, canLoad, contextKey, onSessionChange, projectId, session]);

  const loadMore = useCallback(async () => {
    const currentHistory = state.contextKey === contextKey ? state.history : null;
    const cursor = currentHistory?.next_cursor ?? null;
    if (
      !canLoad
      || !session
      || !projectId
      || state.loading
      || state.loadingMore
      || !currentHistory?.has_more
      || !cursor
    ) return;

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setState((current) => (
      current.contextKey === contextKey
        ? { ...current, loadingMore: true, error: null }
        : current
    ));

    try {
      const nextPage = await getCloudHistory(
        session,
        projectId,
        CLOUD_HISTORY_PAGE_SIZE,
        onSessionChange,
        apiBaseUrl,
        cursor,
      );
      if (activeRequestRef.current !== requestId) return;
      setState((current) => {
        if (current.contextKey !== contextKey || !current.history) return current;
        return {
          ...current,
          history: mergeCloudHistoryPages(current.history, nextPage),
          loadingMore: false,
          error: null,
        };
      });
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setState((current) => (
        current.contextKey === contextKey
          ? {
              ...current,
              loadingMore: false,
              error: error instanceof Error ? error.message : "Unable to load more history.",
            }
          : current
      ));
    }
  }, [
    apiBaseUrl,
    canLoad,
    contextKey,
    onSessionChange,
    projectId,
    session,
    state.contextKey,
    state.history,
    state.loading,
    state.loadingMore,
  ]);

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
      loadMore,
    };
  }

  return {
    ...toPublicCloudBranchesDataState(state),
    reload: load,
    loadMore,
  };
}

function createCloudBranchesDataState(
  overrides: Partial<CloudBranchesDataInternalState> = {},
): CloudBranchesDataInternalState {
  return {
    history: null,
    loading: false,
    loadingMore: false,
    error: null,
    contextKey: null,
    ...overrides,
  };
}

function toPublicCloudBranchesDataState({
  contextKey,
  ...publicState
}: CloudBranchesDataInternalState): Omit<CloudBranchesDataState, "reload" | "loadMore"> {
  void contextKey;
  return {
    ...publicState,
    hasMore: Boolean(publicState.history?.has_more && publicState.history.next_cursor),
  };
}

export function mergeCloudHistoryPages(
  current: DesktopCloudHistory,
  nextPage: DesktopCloudHistory,
): DesktopCloudHistory {
  const commitsById = new Map(current.commits.map((commit) => [commit.commit_id, commit]));
  for (const commit of nextPage.commits) {
    if (!commitsById.has(commit.commit_id)) commitsById.set(commit.commit_id, commit);
  }
  const commits = [...commitsById.values()];
  const madeProgress = commits.length > current.commits.length;
  return {
    ...nextPage,
    project_id: current.project_id || nextPage.project_id,
    commits,
    head_commit_id: current.head_commit_id ?? nextPage.head_commit_id,
    refs: current.refs ?? nextPage.refs,
    total: current.total ?? nextPage.total,
    next_cursor: madeProgress ? nextPage.next_cursor : null,
    has_more: madeProgress && Boolean(nextPage.has_more),
  };
}
