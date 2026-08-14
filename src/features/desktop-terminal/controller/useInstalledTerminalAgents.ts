import { useCallback, useEffect, useRef, useState } from "react";
import { discoverLocalTerminalAgents } from "../infrastructure/electron/terminalAgentInventoryClient";
import {
  listInstalledTerminalAgentIds,
  type InstalledTerminalAgentId,
  type TerminalAgentDiscoveryPhase,
} from "../model/terminalAgentAvailability";

type InstalledTerminalAgentsState = {
  ids: InstalledTerminalAgentId[];
  phase: TerminalAgentDiscoveryPhase;
};

export function useInstalledTerminalAgents({
  enabled,
  workspacePath,
}: {
  enabled: boolean;
  workspacePath: string;
}) {
  const [state, setState] = useState<InstalledTerminalAgentsState>({ ids: [], phase: "idle" });
  const requestGenerationRef = useRef(0);

  const discover = useCallback(async (refresh = false) => {
    const generation = ++requestGenerationRef.current;
    setState((current) => ({ ...current, phase: "loading" }));
    try {
      const snapshot = await discoverLocalTerminalAgents(workspacePath, refresh);
      if (generation !== requestGenerationRef.current) return;
      setState({ ids: listInstalledTerminalAgentIds(snapshot.connections), phase: "ready" });
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setState({ ids: [], phase: "error" });
    }
  }, [workspacePath]);

  useEffect(() => {
    if (!enabled) return undefined;
    void discover(false);
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [discover, enabled]);

  return {
    ...state,
    refresh: () => discover(true),
  };
}
