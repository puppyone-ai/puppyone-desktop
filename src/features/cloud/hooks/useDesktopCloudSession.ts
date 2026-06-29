import { useCallback, useEffect, useState } from "react";
import {
  clearDesktopCloudSession,
  getCachedDesktopCloudSession,
  onDesktopCloudSessionChanged,
  restoreDesktopCloudSession,
  type DesktopCloudSession,
} from "../../../lib/cloudSession";

export function useDesktopCloudSession(enabled = true) {
  const [cloudSession, setCloudSession] = useState<DesktopCloudSession | null>(() => enabled ? getCachedDesktopCloudSession() : null);
  const [cloudSessionRestoring, setCloudSessionRestoring] = useState(enabled);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setCloudSession(null);
      setCloudSessionRestoring(false);
      return undefined;
    }

    setCloudSessionRestoring(true);
    const unsubscribe = onDesktopCloudSessionChanged((session) => {
      if (!cancelled) setCloudSession(session);
    });

    restoreDesktopCloudSession()
      .then((session) => {
        if (cancelled) return;
        setCloudSession(session);
      })
      .catch(() => {
        if (cancelled) return;
        setCloudSession(null);
      })
      .finally(() => {
        if (!cancelled) setCloudSessionRestoring(false);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);

  const handleCloudSessionChange = useCallback((session: DesktopCloudSession | null) => {
    if (!enabled) return;
    setCloudSession(session);
    if (!session) {
      void clearDesktopCloudSession().catch(() => {
        setCloudSession(null);
      });
    }
  }, [enabled]);

  return {
    cloudSession,
    cloudSessionRestoring,
    handleCloudSessionChange,
  };
}
