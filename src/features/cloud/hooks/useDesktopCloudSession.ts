import { useCallback, useEffect, useState } from "react";
import {
  clearDesktopCloudSession,
  getCachedDesktopCloudAuthState,
  getCachedDesktopCloudSession,
  onDesktopCloudAuthStateChanged,
  onDesktopCloudSessionChanged,
  readDesktopCloudAuthState,
  restoreDesktopCloudSession,
  type DesktopCloudSession,
} from "../../../lib/cloudSession";

export function useDesktopCloudSession(enabled = true) {
  const [cloudSession, setCloudSession] = useState<DesktopCloudSession | null>(() => enabled ? getCachedDesktopCloudSession() : null);
  const [cloudAuthStatus, setCloudAuthStatus] = useState<DesktopCloudSession["status"]>(() => (
    enabled ? getCachedDesktopCloudAuthState()?.status ?? "restoring" : "signed-out"
  ));
  const [cloudSessionRestoring, setCloudSessionRestoring] = useState(enabled);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setCloudSession(null);
      setCloudAuthStatus("signed-out");
      setCloudSessionRestoring(false);
      return undefined;
    }

    setCloudSessionRestoring(true);
    const unsubscribeSession = onDesktopCloudSessionChanged((session) => {
      if (!cancelled) setCloudSession(session);
    });
    const unsubscribeAuthState = onDesktopCloudAuthStateChanged((state) => {
      if (cancelled) return;
      setCloudAuthStatus(state.status);
      setCloudSession(state.session);
    });

    restoreDesktopCloudSession()
      .then(async (session) => {
        if (cancelled) return;
        setCloudSession(session);
        setCloudAuthStatus(session?.status ?? "signed-out");
        try {
          const state = await readDesktopCloudAuthState();
          if (cancelled) return;
          setCloudAuthStatus(state.status);
          setCloudSession(state.session);
        } catch {
          // The restore result is still authoritative if the state snapshot
          // IPC fails independently.
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCloudSession(null);
        setCloudAuthStatus("signed-out");
      })
      .finally(() => {
        if (!cancelled) setCloudSessionRestoring(false);
      });

    return () => {
      cancelled = true;
      unsubscribeSession();
      unsubscribeAuthState();
    };
  }, [enabled]);

  const handleCloudSessionChange = useCallback((session: DesktopCloudSession | null) => {
    if (!enabled) return;
    setCloudSession(session);
    setCloudAuthStatus(session?.status ?? "signed-out");
    if (!session) {
      void clearDesktopCloudSession().catch(() => {
        setCloudSession(null);
      });
    }
  }, [enabled]);

  return {
    cloudSession,
    cloudAuthStatus,
    cloudSessionRestoring,
    handleCloudSessionChange,
  };
}
