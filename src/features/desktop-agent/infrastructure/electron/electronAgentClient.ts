import type { AgentClientPort, AgentClientProvider } from "../../application/AgentClientPort";

/** The only Agent feature module that reads the Electron window bridge. */
export const getElectronAgentClient: AgentClientProvider = () => {
  const bridge = window.puppyoneDesktop;
  if (!bridge) return undefined;
  return {
    ...bridge,
    // `agent:providers-discover` is the stable IPC compatibility name. The
    // feature-facing port uses product-accurate runtime vocabulary.
    discoverAgentRuntimes: bridge.discoverAgentProviders,
  } as AgentClientPort;
};

export function getElectronFilePath(file: File) {
  return window.puppyoneDesktop?.getPathForFile?.(file) || null;
}

/** Routes Agent-authored external links through the Main-owned URL policy. */
export function openExternalAgentUrl(href: string) {
  const openExternalUrl = window.puppyoneDesktop?.openExternalUrl;
  if (!openExternalUrl) return;
  void openExternalUrl(href).catch(() => {});
}
