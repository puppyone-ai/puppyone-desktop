import { useCallback, useEffect, useRef, useState } from "react";
import {
  locateTerminalAgents,
  subscribeToTerminalAgentLocationProgress,
} from "../infrastructure/electron/terminalAgentLocatorClient";
import {
  normalizeAvailableTerminalAgentIds,
  normalizeTerminalAgentLocationProgressEvent,
  normalizeTerminalAgentLocationSnapshot,
  type AvailableTerminalAgentId,
  type TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";

type TerminalAgentLocatorState = {
  ids: AvailableTerminalAgentId[];
  phase: TerminalAgentDiscoveryPhase;
};

let nextRequestId = 0;

export function useTerminalAgentLocator({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<TerminalAgentLocatorState>({ ids: [], phase: "idle" });
  const requestGenerationRef = useRef(0);
  const activeRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeToTerminalAgentLocationProgress((value) => {
      try {
        const progress = normalizeTerminalAgentLocationProgressEvent(value);
        if (progress.requestId !== activeRequestIdRef.current) return;
        setState((current) => ({
          ids: normalizeAvailableTerminalAgentIds([
            ...current.ids,
            ...progress.availableAgentIds,
          ]),
          phase: "loading",
        }));
      } catch {
        // Native progress is advisory; the final invoke response remains authoritative.
      }
    });
  }, [enabled]);

  const discover = useCallback(async (refresh = false) => {
    const generation = ++requestGenerationRef.current;
    const requestId = `terminal-agent-location:${++nextRequestId}`;
    activeRequestIdRef.current = requestId;
    setState((current) => ({ ...current, phase: "loading" }));
    try {
      const snapshot = normalizeTerminalAgentLocationSnapshot(
        await locateTerminalAgents(refresh, requestId),
      );
      if (generation !== requestGenerationRef.current) return;
      activeRequestIdRef.current = null;
      setState({ ids: snapshot.availableAgentIds, phase: "ready" });
    } catch {
      if (generation !== requestGenerationRef.current) return;
      activeRequestIdRef.current = null;
      setState((current) => ({ ...current, phase: "error" }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void discover(false);
    return () => {
      requestGenerationRef.current += 1;
      activeRequestIdRef.current = null;
    };
  }, [discover, enabled]);

  const refresh = useCallback(() => discover(true), [discover]);

  return {
    ...state,
    refresh,
  };
}
