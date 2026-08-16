import { useEffect, useRef } from "react";

export type PersistentEditorPaneHosts = ReadonlyMap<string, HTMLDivElement>;

/**
 * Owns one stable, React-portal container per semantic pane ID. Layout slots
 * may be destroyed and recreated when the split tree changes, while the
 * document runtime mounted inside each host remains alive.
 */
export function usePersistentEditorPaneHosts(
  paneIds: readonly string[],
): PersistentEditorPaneHosts {
  const hostsRef = useRef<Map<string, HTMLDivElement> | null>(null);
  if (!hostsRef.current) hostsRef.current = new Map();
  const hosts = hostsRef.current;

  for (const paneId of paneIds) {
    if (hosts.has(paneId)) continue;
    const host = document.createElement("div");
    host.className = "desktop-editor-pane-host";
    host.dataset.editorPaneHostId = paneId;
    hosts.set(paneId, host);
  }

  useEffect(() => {
    const retained = new Set(paneIds);
    for (const [paneId, host] of hosts) {
      if (retained.has(paneId)) continue;
      host.remove();
      hosts.delete(paneId);
    }
  }, [hosts, paneIds]);

  // The slot effects detach hosts when the workbench unmounts and this map is
  // then garbage-collected. Do not clear it from an effect cleanup: React
  // StrictMode replays effect cleanup during development without discarding
  // component state, so clearing here would destroy still-live portal hosts.

  return hosts;
}
