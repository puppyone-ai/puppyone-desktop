import { useCallback, useEffect, useState } from "react";
import type { DesktopUpdateState } from "../../types/electron";
import {
  FALLBACK_UPDATE_STATE,
  normalizeDesktopUpdateState,
} from "./updateModel";
import {
  createDesktopUpdatePreviewState,
  readDesktopUpdatePreviewRequest,
} from "./updatePreview";

const DEVELOPMENT_UPDATE_PREVIEW_STATE = createDesktopUpdatePreviewState({
  isDevelopment: import.meta.env.DEV,
  requestedStatus: readDesktopUpdatePreviewRequest({
    environmentStatus: import.meta.env.VITE_DESKTOP_UPDATE_PREVIEW,
    locationSearch: typeof window === "undefined" ? "" : window.location.search,
  }),
  version: import.meta.env.VITE_DESKTOP_UPDATE_PREVIEW_VERSION,
});

export type DesktopUpdatesController = {
  state: DesktopUpdateState;
  checkForUpdates: () => Promise<void>;
  updateNow: () => Promise<void>;
};

export function useDesktopUpdates(): DesktopUpdatesController {
  const [state, setState] = useState<DesktopUpdateState>(
    DEVELOPMENT_UPDATE_PREVIEW_STATE ?? FALLBACK_UPDATE_STATE,
  );

  useEffect(() => {
    if (DEVELOPMENT_UPDATE_PREVIEW_STATE) return undefined;
    const bridge = window.puppyoneDesktop;
    if (!bridge?.getUpdateState) return undefined;

    let cancelled = false;
    bridge.getUpdateState()
      .then((nextState) => {
        if (!cancelled) setState(normalizeDesktopUpdateState(nextState));
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            ...FALLBACK_UPDATE_STATE,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    const unsubscribe = bridge.onUpdateStateChanged?.((nextState) => {
      setState(normalizeDesktopUpdateState(nextState));
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (DEVELOPMENT_UPDATE_PREVIEW_STATE) {
      setState(DEVELOPMENT_UPDATE_PREVIEW_STATE);
      return;
    }
    const bridge = window.puppyoneDesktop;
    if (!bridge?.checkForUpdates) return;
    setState(normalizeDesktopUpdateState(await bridge.checkForUpdates()));
  }, []);

  const updateNow = useCallback(async () => {
    if (DEVELOPMENT_UPDATE_PREVIEW_STATE) return;
    const bridge = window.puppyoneDesktop;
    if (!bridge?.updateNow) return;
    setState(normalizeDesktopUpdateState(await bridge.updateNow()));
  }, []);

  return { state, checkForUpdates, updateNow };
}
