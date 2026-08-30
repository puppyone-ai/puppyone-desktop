import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSessionController } from "../application/AgentSessionController";
import type {
  AgentRuntimeCatalogEntry,
  AgentSessionListItem,
} from "../domain/agent-contract";

const HISTORY_PAGE_SIZE = 20;

type Options = {
  active: boolean;
  enabled: boolean;
  controller: AgentSessionController;
  runtimes: readonly AgentRuntimeCatalogEntry[];
  excludedSessionIds: readonly string[];
};

type CursorMap = Record<string, string>;

/**
 * Reads PuppyOne's locator catalog only while the History drill-down is open.
 * Native discovery remains separate and can only run from an explicit action.
 */
export function useAgentConversationHistory({
  active,
  enabled,
  controller,
  runtimes,
  excludedSessionIds,
}: Options) {
  const [sessions, setSessions] = useState<AgentSessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursors, setNextCursors] = useState<CursorMap>({});
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const nativeRuntimes = useMemo(() => runtimes.filter((entry) => (
    entry.readiness.status === "ready"
    && entry.descriptor.ownership?.session === "runtime"
  )), [runtimes]);

  const loadCatalog = useCallback(async () => {
    const response = await controller.listSavedSessions();
    setSessions(sortSessions(response.sessions));
    return response;
  }, [controller]);

  useEffect(() => {
    if (!active || !enabled) {
      setLoaded(false);
      return;
    }
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    void loadCatalog()
      .catch((reason) => {
        if (generation.current === requestGeneration) setError(messageOf(reason));
      })
      .finally(() => {
        if (generation.current === requestGeneration) {
          setLoaded(true);
          setLoading(false);
        }
      });
    return () => {
      if (generation.current === requestGeneration) generation.current += 1;
    };
  }, [active, enabled, loadCatalog]);

  const refreshNative = useCallback(async () => {
    if (refreshing || loadingMore) return;
    setRefreshing(true);
    setError(null);
    const cursors: CursorMap = {};
    const warnings: string[] = [];
    try {
      for (const runtime of nativeRuntimes) {
        const response = await controller.listSavedSessions({
          runtimeId: runtime.descriptor.id,
          discoverNative: true,
          limit: HISTORY_PAGE_SIZE,
        });
        if (response.discovery.nextCursor) {
          cursors[runtime.descriptor.id] = response.discovery.nextCursor;
        }
        warnings.push(...response.warnings);
      }
      setNextCursors(cursors);
      await loadCatalog();
      setError(warnings[0] ?? null);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setRefreshing(false);
    }
  }, [controller, loadCatalog, loadingMore, nativeRuntimes, refreshing]);

  const loadMoreNative = useCallback(async () => {
    if (refreshing || loadingMore) return;
    const pending = Object.entries(nextCursors);
    if (pending.length === 0) return;
    setLoadingMore(true);
    setError(null);
    const cursors: CursorMap = {};
    const warnings: string[] = [];
    try {
      for (const [runtimeId, cursor] of pending) {
        const response = await controller.listSavedSessions({
          runtimeId,
          discoverNative: true,
          cursor,
          limit: HISTORY_PAGE_SIZE,
        });
        if (response.discovery.nextCursor) cursors[runtimeId] = response.discovery.nextCursor;
        warnings.push(...response.warnings);
      }
      setNextCursors(cursors);
      await loadCatalog();
      setError(warnings[0] ?? null);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoadingMore(false);
    }
  }, [controller, loadCatalog, loadingMore, nextCursors, refreshing]);

  const excluded = useMemo(() => new Set(excludedSessionIds), [excludedSessionIds]);
  const visibleSessions = useMemo(
    () => sessions.filter((session) => !excluded.has(session.id)),
    [excluded, sessions],
  );

  return {
    sessions: visibleSessions,
    loading,
    loaded,
    refreshing,
    loadingMore,
    hasMore: Object.keys(nextCursors).length > 0,
    error,
    refreshNative,
    loadMoreNative,
  };
}

function sortSessions(sessions: AgentSessionListItem[]) {
  return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
