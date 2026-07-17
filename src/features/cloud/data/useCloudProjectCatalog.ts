import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCloudProjects,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export type CloudProjectCatalogState = {
  projects: DesktopCloudProject[];
  loading: boolean;
  error: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
};

type InternalCatalogState = Omit<CloudProjectCatalogState, "reload"> & {
  contextKey: string;
};

/** Global catalog owner. Repository-context loaders must never enumerate an organization. */
export function useCloudProjectCatalog({
  enabled,
  session,
  apiBaseUrl,
  onSessionChange,
}: {
  enabled: boolean;
  session: DesktopCloudSession | null;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}): CloudProjectCatalogState {
  const contextKey = enabled && session
    ? [session.user_id, session.session_generation, apiBaseUrl ?? session.api_base_url].join("\n")
    : "disabled";
  const [state, setState] = useState<InternalCatalogState>(() => emptyCatalogState(contextKey));
  const requestRef = useRef(0);
  const sessionRef = useRef(session);
  const onSessionChangeRef = useRef(onSessionChange);
  sessionRef.current = session;
  onSessionChangeRef.current = onSessionChange;

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    const activeSession = sessionRef.current;
    if (!enabled || !activeSession) {
      setState(emptyCatalogState(contextKey));
      return;
    }
    setState((current) => current.contextKey === contextKey
      ? { ...current, loading: true, error: null }
      : { ...emptyCatalogState(contextKey), loading: true });
    try {
      const projects = await listCloudProjects(
        activeSession,
        onSessionChangeRef.current,
        apiBaseUrl,
      );
      if (requestRef.current !== requestId) return;
      setState({ contextKey, projects, loading: false, error: null });
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setState({
        contextKey,
        projects: [],
        loading: false,
        error: cloudMessage(
          "project-list-load-failed",
          undefined,
          error instanceof Error ? error.message : undefined,
        ),
      });
    }
  }, [apiBaseUrl, contextKey, enabled]);

  useEffect(() => {
    void reload();
    return () => {
      requestRef.current += 1;
    };
  }, [reload]);

  const effectiveState = state.contextKey === contextKey ? state : emptyCatalogState(contextKey);
  return { ...effectiveState, reload };
}

function emptyCatalogState(contextKey: string): InternalCatalogState {
  return { contextKey, projects: [], loading: false, error: null };
}
